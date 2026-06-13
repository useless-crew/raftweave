package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrWrongTokenType   = errors.New("unexpected token type")
	ErrTokenExpired     = errors.New("token expired")
)

// TokenManager creates and validates access/refresh JWTs.
type TokenManager struct {
	cfg *Config
}

func NewTokenManager(cfg *Config) *TokenManager {
	return &TokenManager{cfg: cfg}
}

// GeneratedAccessToken bundles the signed access token with its expiry.
type GeneratedAccessToken struct {
	Token     string
	ExpiresAt time.Time
}

// GeneratedRefreshToken bundles the raw signed refresh token along with
// the data that must be persisted server-side (the hash, never the raw token).
type GeneratedRefreshToken struct {
	Token     string
	TokenHash string
	FamilyID  uuid.UUID
	ExpiresAt time.Time
}

// GenerateAccessToken issues a new HS256 access token for the given user.
func (tm *TokenManager) GenerateAccessToken(userID, email, role string) (*GeneratedAccessToken, error) {
	now := time.Now()
	expiresAt := now.Add(tm.cfg.AccessExpiry)

	claims := AccessClaims{
		UserID:    userID,
		Email:     email,
		Role:      role,
		TokenType: "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(tm.cfg.AccessSecret)
	if err != nil {
		return nil, err
	}

	return &GeneratedAccessToken{Token: signed, ExpiresAt: expiresAt}, nil
}

// GenerateRefreshToken issues a new HS256 refresh token belonging to familyID.
// If familyID is uuid.Nil, a new family is started (used on login/register).
func (tm *TokenManager) GenerateRefreshToken(userID string, familyID uuid.UUID) (*GeneratedRefreshToken, error) {
	if familyID == uuid.Nil {
		familyID = uuid.New()
	}

	now := time.Now()
	expiresAt := now.Add(tm.cfg.RefreshExpiry)

	claims := RefreshClaims{
		UserID:    userID,
		FamilyID:  familyID.String(),
		TokenType: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(tm.cfg.RefreshSecret)
	if err != nil {
		return nil, err
	}

	return &GeneratedRefreshToken{
		Token:     signed,
		TokenHash: HashToken(signed),
		FamilyID:  familyID,
		ExpiresAt: expiresAt,
	}, nil
}

// HashToken returns the hex-encoded SHA-256 hash of a raw token string.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// ParseAccessToken validates an access token's signature, expiry and token_type.
func (tm *TokenManager) ParseAccessToken(raw string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return tm.cfg.AccessSecret, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidToken
	}
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.TokenType != "access" {
		return nil, ErrWrongTokenType
	}
	return claims, nil
}

// ParseRefreshToken validates a refresh token's signature, expiry and token_type.
func (tm *TokenManager) ParseRefreshToken(raw string) (*RefreshClaims, error) {
	claims := &RefreshClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return tm.cfg.RefreshSecret, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidToken
	}
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.TokenType != "refresh" {
		return nil, ErrWrongTokenType
	}
	return claims, nil
}
