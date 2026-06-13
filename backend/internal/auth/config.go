package auth

import "time"

// Config holds all environment-derived settings needed by the auth package.
type Config struct {
	AccessSecret  []byte
	RefreshSecret []byte
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration

	MaxFailedAttempts int
	LockoutDuration   time.Duration

	RateLimitPerMinute int
	RateLimitBurst     int

	// OAuthEncryptionKey is the HKDF-derived AES-256 key used to encrypt
	// OAuth provider tokens at rest. Derived once at startup from
	// OAUTH_TOKEN_ENCRYPTION_KEY via DeriveOAuthEncryptionKey.
	OAuthEncryptionKey [32]byte

	// FrontendURL is the base URL of the dashboard frontend, used to
	// build the post-OAuth redirect URL.
	FrontendURL string
}
