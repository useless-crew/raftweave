package auth

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/hkdf"
	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
	googleoauth "golang.org/x/oauth2/google"
)

var (
	ErrEmailNotVerified   = errors.New("provider did not return a verified email")
	ErrOAuthStateNotFound = errors.New("oauth state not found")
)

// OAuthProvider holds the oauth2.Config and provider-specific profile fetcher
// for a single identity provider.
type OAuthProvider struct {
	Config       *oauth2.Config
	Name         string
	FetchProfile func(ctx context.Context, token *oauth2.Token) (*OAuthProfile, error)
}

// NewGitHubProvider constructs the GitHub OAuth2 provider.
// Scopes: "read:user" (profile) + "user:email" (email — needed because
// GitHub users can have private emails, requiring a separate API call).
func NewGitHubProvider(clientID, clientSecret, redirectURL string) *OAuthProvider {
	return &OAuthProvider{
		Name: "github",
		Config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"read:user", "user:email"},
			Endpoint:     githuboauth.Endpoint,
		},
		FetchProfile: fetchGitHubProfile,
	}
}

// NewGoogleProvider constructs the Google OIDC provider.
// Scopes: "openid" + "profile" + "email".
// Google returns an id_token in the token response; the profile is extracted
// from the id_token claims (avoiding an extra API call).
func NewGoogleProvider(clientID, clientSecret, redirectURL string) *OAuthProvider {
	return &OAuthProvider{
		Name: "google",
		Config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "profile", "email"},
			Endpoint:     googleoauth.Endpoint,
		},
		FetchProfile: fetchGoogleProfile,
	}
}

// --- GitHub profile fetching ---

type githubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func fetchGitHubProfile(ctx context.Context, token *oauth2.Token) (*OAuthProfile, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))

	var gu githubUser
	if err := githubGetJSON(ctx, client, "https://api.github.com/user", &gu); err != nil {
		return nil, fmt.Errorf("fetch github user: %w", err)
	}

	email := gu.Email
	if email == "" {
		var emails []githubEmail
		if err := githubGetJSON(ctx, client, "https://api.github.com/user/emails", &emails); err != nil {
			return nil, fmt.Errorf("fetch github user emails: %w", err)
		}
		for _, e := range emails {
			if e.Primary && e.Verified {
				email = e.Email
				break
			}
		}
		if email == "" {
			return nil, ErrEmailNotVerified
		}
	}

	name := gu.Name
	if name == "" {
		name = gu.Login
	}

	return &OAuthProfile{
		ProviderUserID: strconv.FormatInt(gu.ID, 10),
		Email:          email,
		Name:           name,
		AvatarURL:      gu.AvatarURL,
	}, nil
}

func githubGetJSON(ctx context.Context, client *http.Client, url string, out interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d from %s", resp.StatusCode, url)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// --- Google profile fetching ---

type googleIDTokenClaims struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func fetchGoogleProfile(_ context.Context, token *oauth2.Token) (*OAuthProfile, error) {
	raw, ok := token.Extra("id_token").(string)
	if !ok || raw == "" {
		return nil, errors.New("google token response missing id_token")
	}

	claims, err := decodeGoogleIDToken(raw)
	if err != nil {
		return nil, fmt.Errorf("decode google id_token: %w", err)
	}

	if !claims.EmailVerified {
		return nil, ErrEmailNotVerified
	}

	return &OAuthProfile{
		ProviderUserID: claims.Sub,
		Email:          claims.Email,
		Name:           claims.Name,
		AvatarURL:      claims.Picture,
	}, nil
}

// decodeGoogleIDToken decodes the JWT payload (base64url, middle segment)
// without verifying the signature. This is safe because the token was
// received directly from Google's token endpoint over TLS, not from an
// untrusted source.
func decodeGoogleIDToken(rawToken string) (*googleIDTokenClaims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed id_token")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}

	var claims googleIDTokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}
	return &claims, nil
}

// --- PKCE + state generation ---

// GenerateOAuthState generates a cryptographically secure random state token.
// Returns a 64-character hex-encoded string, stored in Redis and embedded in
// the redirect URL. Uses crypto/rand — never math/rand.
func GenerateOAuthState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// GeneratePKCE generates a PKCE code_verifier and its S256 code_challenge.
// code_verifier: 64 bytes from crypto/rand, base64url-encoded (RFC 7636 §4.1).
// code_challenge: BASE64URL(SHA256(ASCII(code_verifier))) (RFC 7636 §4.2).
func GeneratePKCE() (verifier string, challenge string, err error) {
	b := make([]byte, 64)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	verifier = base64.RawURLEncoding.EncodeToString(b)

	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])

	return verifier, challenge, nil
}

// --- Redis state storage ---

type oauthFlowData struct {
	Provider     string    `json:"provider"`
	CodeVerifier string    `json:"code_verifier"`
	CreatedAt    time.Time `json:"created_at"`
}

// OAuthStateStore manages the server-side state for in-progress OAuth flows.
// Using Redis instead of cookies or query params prevents state forgery.
type OAuthStateStore struct {
	redis *redis.Client
	ttl   time.Duration // 10 minutes — enough for a human to complete the flow
}

func NewOAuthStateStore(client *redis.Client) *OAuthStateStore {
	return &OAuthStateStore{redis: client, ttl: 10 * time.Minute}
}

// SaveOAuthFlow stores the state token → {provider, code_verifier, created_at}
// as a JSON blob in Redis with a 10-minute TTL.
// Key format: "oauth:state:{stateToken}"
func (s *OAuthStateStore) SaveOAuthFlow(ctx context.Context, state, provider, codeVerifier string) error {
	data := oauthFlowData{Provider: provider, CodeVerifier: codeVerifier, CreatedAt: time.Now()}
	blob, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return s.redis.Set(ctx, oauthStateKey(state), blob, s.ttl).Err()
}

// ConsumeOAuthFlow atomically retrieves and deletes the flow data for a state
// token using GETDEL (atomic, available since Redis 6.2). Returns
// ErrOAuthStateNotFound if the key does not exist (expired, replayed, or
// never existed).
func (s *OAuthStateStore) ConsumeOAuthFlow(ctx context.Context, state string) (provider, codeVerifier string, err error) {
	raw, err := s.redis.GetDel(ctx, oauthStateKey(state)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", "", ErrOAuthStateNotFound
		}
		return "", "", err
	}

	var data oauthFlowData
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return "", "", err
	}
	return data.Provider, data.CodeVerifier, nil
}

func oauthStateKey(state string) string {
	return "oauth:state:" + state
}

// --- Provider token encryption ---

// DeriveOAuthEncryptionKey validates that hexKey is a 64-character hex string
// (32 bytes) and derives a 32-byte AES-256 key from it via HKDF-SHA256.
// Called once at startup; the service fails fast if this returns an error.
func DeriveOAuthEncryptionKey(hexKey string) ([32]byte, error) {
	var key [32]byte

	raw, err := hex.DecodeString(hexKey)
	if err != nil || len(raw) != 32 {
		return key, fmt.Errorf("OAUTH_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
	}

	kdf := hkdf.New(sha256.New, raw, nil, []byte("raftweave-oauth-token"))
	if _, err := io.ReadFull(kdf, key[:]); err != nil {
		return key, fmt.Errorf("derive oauth encryption key: %w", err)
	}
	return key, nil
}

// encryptToken encrypts plaintext with AES-256-GCM. The nonce is prepended to
// the ciphertext and the result is hex-encoded. Empty input returns "".
func encryptToken(key [32]byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// decryptToken reverses encryptToken. Empty input returns "".
func decryptToken(key [32]byte, encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}

	data, err := hex.DecodeString(encoded)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
