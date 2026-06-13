package auth

import (
	"context"
	"errors"
	"log"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

// APIError carries the HTTP status, machine-readable code, and a safe
// user-facing message for a failed operation.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string { return e.Message }

func newAPIError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

var (
	errValidation   = func(msg string) *APIError { return newAPIError(422, "VALIDATION_ERROR", msg) }
	errUnauthorized = newAPIError(401, "UNAUTHORIZED", "Invalid email or password")
	errInternal     = newAPIError(500, "INTERNAL_ERROR", "An unexpected error occurred")

	errOAuthOnlyAccount = newAPIError(403, "OAUTH_ONLY_ACCOUNT",
		"This account was created with social login. Please use GitHub or Google to sign in.")
	errOAuthCallback = newAPIError(400, "OAUTH_CALLBACK_ERROR", "Sign-in with the provider failed")
	errOAuthState    = newAPIError(400, "OAUTH_INVALID_STATE", "Invalid or expired sign-in attempt, please try again")
	errOAuthExchange = newAPIError(400, "OAUTH_EXCHANGE_FAILED", "Failed to complete sign-in with the provider")
)

var fullNameRe = regexp.MustCompile(`^[A-Za-z\s\-']{2,100}$`)

// dummyHash is a bcrypt hash of a fixed, never-used password. It is used to
// run a CompareHashAndPassword for unknown emails so that login timing is
// indistinguishable from a real (wrong-password) attempt.
var dummyHash = func() string {
	h, err := bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing-safety"), bcrypt.DefaultCost)
	if err != nil {
		panic("failed to generate dummy bcrypt hash: " + err.Error())
	}
	return string(h)
}()

type Service struct {
	repo   *Repository
	tokens *TokenManager
	cfg    *Config
}

func NewService(repo *Repository, tokens *TokenManager, cfg *Config) *Service {
	return &Service{repo: repo, tokens: tokens, cfg: cfg}
}

// --- Validation helpers ---

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validateEmail(email string) error {
	if len(email) == 0 || len(email) > 254 {
		return errValidation("Email must be between 1 and 254 characters")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return errValidation("Invalid email format")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < 8 || len(password) > 128 {
		return errValidation("Password must be between 8 and 128 characters")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, c := range password {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit {
		return errValidation("Password must contain at least one uppercase letter, one lowercase letter, and one digit")
	}
	return nil
}

func validateFullName(name string) error {
	if !fullNameRe.MatchString(name) {
		return errValidation("Full name must be 2-100 characters and contain only letters, spaces, hyphens, or apostrophes")
	}
	return nil
}

// --- Registration ---

func (s *Service) Register(ctx context.Context, req RegisterRequest, ip, ua string) (*AuthResponse, *APIError) {
	email := normalizeEmail(req.Email)

	if err := validateEmail(email); err != nil {
		return nil, err.(*APIError)
	}
	if err := validatePassword(req.Password); err != nil {
		return nil, err.(*APIError)
	}
	if err := validateFullName(req.FullName); err != nil {
		return nil, err.(*APIError)
	}

	// Check if the email already exists; return a generic error either way
	// so we never confirm whether an email is registered.
	if _, err := s.repo.GetUserByEmail(ctx, email); err == nil {
		return nil, errValidation("Unable to register with the provided details")
	} else if !errors.Is(err, ErrNotFound) {
		log.Printf("register: lookup failed: %v", err)
		return nil, errInternal
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("register: hash failed: %v", err)
		return nil, errInternal
	}

	user, err := s.repo.CreateUser(ctx, email, string(hash), strings.TrimSpace(req.FullName))
	if err != nil {
		log.Printf("register: create user failed: %v", err)
		return nil, errInternal
	}

	if err := s.repo.WriteAuditLog(ctx, &user.ID, "USER_REGISTERED", ip, ua, nil); err != nil {
		log.Printf("register: audit log failed: %v", err)
	}

	return s.issueTokenPair(ctx, user, uuid.Nil, ip, ua)
}

// --- Login ---

func (s *Service) Login(ctx context.Context, req LoginRequest, ip, ua string) (*AuthResponse, *APIError) {
	email := normalizeEmail(req.Email)

	user, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			// Run a dummy bcrypt compare so timing matches a real wrong-password attempt.
			_ = bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(req.Password))
			if logErr := s.repo.WriteAuditLog(ctx, nil, "LOGIN_FAILED", ip, ua, map[string]interface{}{"email": email}); logErr != nil {
				log.Printf("login: audit log failed: %v", logErr)
			}
			return nil, errUnauthorized
		}
		log.Printf("login: lookup failed: %v", err)
		return nil, errInternal
	}

	// Account lockout check
	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		return nil, newAPIError(423, "ACCOUNT_LOCKED", "Account locked until "+user.LockedUntil.UTC().Format(time.RFC3339))
	}

	// Accounts created via OAuth only (no password set) cannot use
	// email/password login.
	if !user.HasPassword {
		return nil, errOAuthOnlyAccount
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		if err := s.repo.IncrementFailedAttempts(ctx, user.ID); err != nil {
			log.Printf("login: increment failed attempts: %v", err)
		}

		newCount := user.FailedAttempts + 1
		if newCount >= s.cfg.MaxFailedAttempts {
			until := time.Now().Add(s.cfg.LockoutDuration)
			if err := s.repo.LockUser(ctx, user.ID, until); err != nil {
				log.Printf("login: lock user: %v", err)
			}
		}

		if err := s.repo.WriteAuditLog(ctx, &user.ID, "LOGIN_FAILED", ip, ua, nil); err != nil {
			log.Printf("login: audit log failed: %v", err)
		}
		return nil, errUnauthorized
	}

	if !user.IsActive {
		return nil, errUnauthorized
	}

	if err := s.repo.ResetFailedAttempts(ctx, user.ID); err != nil {
		log.Printf("login: reset failed attempts: %v", err)
	}

	if err := s.repo.WriteAuditLog(ctx, &user.ID, "LOGIN_SUCCESS", ip, ua, nil); err != nil {
		log.Printf("login: audit log failed: %v", err)
	}

	return s.issueTokenPair(ctx, user, uuid.Nil, ip, ua)
}

// --- Token refresh ---

func (s *Service) Refresh(ctx context.Context, req RefreshRequest, ip, ua string) (*AuthResponse, *APIError) {
	claims, err := s.tokens.ParseRefreshToken(req.RefreshToken)
	if err != nil {
		return nil, errUnauthorized
	}

	tokenHash := HashToken(req.RefreshToken)
	stored, err := s.repo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, errUnauthorized
	}

	if stored.RevokedAt != nil {
		// Reuse of an already-revoked token: possible theft. Nuke the family.
		familyID, parseErr := uuid.Parse(claims.FamilyID)
		if parseErr == nil {
			if err := s.repo.RevokeTokenFamily(ctx, familyID, "REUSE_DETECTED"); err != nil {
				log.Printf("refresh: revoke family failed: %v", err)
			}
		}
		if err := s.repo.WriteAuditLog(ctx, &stored.UserID, "REFRESH_TOKEN_REUSE_DETECTED", ip, ua, nil); err != nil {
			log.Printf("refresh: audit log failed: %v", err)
		}
		return nil, errUnauthorized
	}

	if stored.ExpiresAt.Before(time.Now()) {
		return nil, errUnauthorized
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, errUnauthorized
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errUnauthorized
	}

	if err := s.repo.RevokeRefreshToken(ctx, tokenHash, "ROTATED"); err != nil {
		log.Printf("refresh: revoke old token: %v", err)
		return nil, errInternal
	}

	if err := s.repo.WriteAuditLog(ctx, &user.ID, "TOKEN_REFRESHED", ip, ua, nil); err != nil {
		log.Printf("refresh: audit log failed: %v", err)
	}

	return s.issueTokenPair(ctx, user, stored.FamilyID, ip, ua)
}

// --- Logout ---

func (s *Service) Logout(ctx context.Context, userID uuid.UUID, req LogoutRequest, ip, ua string) *APIError {
	if req.RefreshToken == "" {
		return errValidation("refresh_token is required")
	}

	tokenHash := HashToken(req.RefreshToken)
	if err := s.repo.RevokeRefreshToken(ctx, tokenHash, "USER_LOGOUT"); err != nil {
		log.Printf("logout: revoke token: %v", err)
		return errInternal
	}

	if err := s.repo.WriteAuditLog(ctx, &userID, "LOGOUT", ip, ua, nil); err != nil {
		log.Printf("logout: audit log failed: %v", err)
	}

	return nil
}

// --- Current user ---

func (s *Service) GetUser(ctx context.Context, userID uuid.UUID) (*User, *APIError) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, errUnauthorized
		}
		log.Printf("getuser: %v", err)
		return nil, errInternal
	}
	return user, nil
}

// --- OAuth login ---

// OAuthLogin resolves the OAuth profile to a RaftWeave user (creating or
// linking an account as needed), issues a JWT pair, and returns the
// AuthResponse. Account resolution is delegated to the repository and token
// issuance to the existing issueTokenPair.
func (s *Service) OAuthLogin(
	ctx context.Context,
	profile *OAuthProfile,
	provider string,
	providerToken *oauth2.Token,
	ip, ua string,
) (*AuthResponse, *APIError) {
	user, _, err := s.repo.OAuthUpsertUser(ctx, profile, provider, providerToken, s.cfg.OAuthEncryptionKey, ip, ua)
	if err != nil {
		log.Printf("oauth login: upsert user failed: %v", err)
		return nil, errInternal
	}

	if !user.IsActive {
		return nil, errUnauthorized
	}

	if err := s.repo.WriteAuditLog(ctx, &user.ID, AuditOAuthLoginSuccess, ip, ua, map[string]interface{}{
		"provider":         provider,
		"provider_user_id": profile.ProviderUserID,
	}); err != nil {
		log.Printf("oauth login: audit log failed: %v", err)
	}

	return s.issueTokenPair(ctx, user, uuid.Nil, ip, ua)
}

// --- Shared token issuance ---

func (s *Service) issueTokenPair(ctx context.Context, user *User, familyID uuid.UUID, ip, ua string) (*AuthResponse, *APIError) {
	access, err := s.tokens.GenerateAccessToken(user.ID.String(), user.Email, user.Role)
	if err != nil {
		log.Printf("issueTokenPair: access token: %v", err)
		return nil, errInternal
	}

	refresh, err := s.tokens.GenerateRefreshToken(user.ID.String(), familyID)
	if err != nil {
		log.Printf("issueTokenPair: refresh token: %v", err)
		return nil, errInternal
	}

	if err := s.repo.StoreRefreshToken(ctx, user.ID, refresh.TokenHash, refresh.FamilyID, refresh.ExpiresAt, ip, ua); err != nil {
		log.Printf("issueTokenPair: store refresh token: %v", err)
		return nil, errInternal
	}

	return &AuthResponse{
		AccessToken:  access.Token,
		RefreshToken: refresh.Token,
		ExpiresIn:    int(s.cfg.AccessExpiry.Seconds()),
		TokenType:    "Bearer",
		User:         ToUserResponse(user),
	}, nil
}
