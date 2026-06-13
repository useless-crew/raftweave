package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type User struct {
	ID             uuid.UUID  `db:"id" json:"id"`
	Email          string     `db:"email" json:"email"`
	PasswordHash   string     `db:"password_hash" json:"-"`
	FullName       string     `db:"full_name" json:"full_name"`
	Role           string     `db:"role" json:"role"`
	IsVerified     bool       `db:"is_verified" json:"is_verified"`
	IsActive       bool       `db:"is_active" json:"is_active"`
	HasPassword    bool       `db:"has_password" json:"has_password"`
	FailedAttempts int        `db:"failed_attempts" json:"-"`
	LockedUntil    *time.Time `db:"locked_until" json:"-"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at" json:"updated_at"`
}

// OAuthIdentity links a RaftWeave user to a social login provider account.
type OAuthIdentity struct {
	ID             uuid.UUID  `db:"id"`
	UserID         uuid.UUID  `db:"user_id"`
	Provider       string     `db:"provider"`
	ProviderUserID string     `db:"provider_user_id"`
	Email          string     `db:"email"`
	Name           *string    `db:"name"`
	AvatarURL      *string    `db:"avatar_url"`
	AccessToken    *string    `db:"access_token"`
	RefreshToken   *string    `db:"refresh_token"`
	TokenExpiresAt *time.Time `db:"token_expires_at"`
	LastLoginAt    time.Time  `db:"last_login_at"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
}

// OAuthProfile is the normalised user profile returned by any provider.
// All provider-specific API responses are mapped into this struct.
type OAuthProfile struct {
	ProviderUserID string // Provider's stable numeric or string ID (NOT the email)
	Email          string // Primary verified email
	Name           string // Display name
	AvatarURL      string // Profile picture URL
}

// OAuth audit log event types.
const (
	AuditOAuthFlowInitiated      = "OAUTH_FLOW_INITIATED"
	AuditOAuthLoginSuccess       = "OAUTH_LOGIN_SUCCESS"
	AuditOAuthAccountLinked      = "OAUTH_ACCOUNT_LINKED"
	AuditOAuthAccountCreated     = "OAUTH_ACCOUNT_CREATED"
	AuditOAuthCallbackError      = "OAUTH_CALLBACK_ERROR"
	AuditOAuthCSRFDetected       = "OAUTH_CSRF_DETECTED"
	AuditOAuthStateExpiredOrInvalid = "OAUTH_STATE_EXPIRED_OR_INVALID"
	AuditOAuthEmailUnverified    = "OAUTH_EMAIL_UNVERIFIED"
	AuditOAuthProviderFetchFailed = "OAUTH_PROVIDER_FETCH_FAILED"
)

type RefreshToken struct {
	ID            uuid.UUID  `db:"id"`
	UserID        uuid.UUID  `db:"user_id"`
	TokenHash     string     `db:"token_hash"`
	FamilyID      uuid.UUID  `db:"family_id"`
	IssuedAt      time.Time  `db:"issued_at"`
	ExpiresAt     time.Time  `db:"expires_at"`
	RevokedAt     *time.Time `db:"revoked_at"`
	RevokedReason *string    `db:"revoked_reason"`
	IPAddress     string     `db:"ip_address"`
	UserAgent     string     `db:"user_agent"`
}

// Request bodies

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Response bodies

type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int          `json:"expires_in"` // seconds
	TokenType    string       `json:"token_type"` // "Bearer"
	User         UserResponse `json:"user"`
}

type UserResponse struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	FullName string    `json:"full_name"`
	Role     string    `json:"role"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// JWT Claims

type AccessClaims struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	TokenType string `json:"token_type"` // "access"
	jwt.RegisteredClaims
}

type RefreshClaims struct {
	UserID    string `json:"user_id"`
	FamilyID  string `json:"family_id"` // for rotation theft detection
	TokenType string `json:"token_type"` // "refresh"
	jwt.RegisteredClaims
}

func ToUserResponse(u *User) UserResponse {
	return UserResponse{
		ID:       u.ID,
		Email:    u.Email,
		FullName: u.FullName,
		Role:     u.Role,
	}
}
