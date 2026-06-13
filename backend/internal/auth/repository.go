package auth

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
)

var ErrNotFound = errors.New("not found")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// --- User operations ---

const userColumns = `id, email, password_hash, full_name, role, is_verified, is_active,
		          has_password, failed_attempts, locked_until, created_at, updated_at`

func (r *Repository) CreateUser(ctx context.Context, email, passwordHash, fullName string) (*User, error) {
	q := `
		INSERT INTO users (email, password_hash, full_name)
		VALUES ($1, $2, $3)
		RETURNING ` + userColumns

	return r.scanUser(r.pool.QueryRow(ctx, q, email, passwordHash, fullName))
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE email = $1`

	return r.scanUser(r.pool.QueryRow(ctx, q, email))
}

func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE id = $1`

	return r.scanUser(r.pool.QueryRow(ctx, q, id))
}

func (r *Repository) scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.Role, &u.IsVerified,
		&u.IsActive, &u.HasPassword, &u.FailedAttempts, &u.LockedUntil, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) IncrementFailedAttempts(ctx context.Context, userID uuid.UUID) error {
	const q = `UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, userID)
	return err
}

func (r *Repository) LockUser(ctx context.Context, userID uuid.UUID, until time.Time) error {
	const q = `UPDATE users SET locked_until = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, userID, until)
	return err
}

func (r *Repository) ResetFailedAttempts(ctx context.Context, userID uuid.UUID) error {
	const q = `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, userID)
	return err
}

// --- Refresh token operations ---

func (r *Repository) StoreRefreshToken(ctx context.Context, userID uuid.UUID, tokenHash string, familyID uuid.UUID, expiresAt time.Time, ip, ua string) error {
	const q = `
		INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.pool.Exec(ctx, q, userID, tokenHash, familyID, expiresAt, ip, ua)
	return err
}

func (r *Repository) GetRefreshToken(ctx context.Context, tokenHash string) (*RefreshToken, error) {
	const q = `
		SELECT id, user_id, token_hash, family_id, issued_at, expires_at,
		       revoked_at, revoked_reason, ip_address, user_agent
		FROM refresh_tokens WHERE token_hash = $1`

	var t RefreshToken
	err := r.pool.QueryRow(ctx, q, tokenHash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.FamilyID, &t.IssuedAt, &t.ExpiresAt,
		&t.RevokedAt, &t.RevokedReason, &t.IPAddress, &t.UserAgent,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func (r *Repository) RevokeRefreshToken(ctx context.Context, tokenHash, reason string) error {
	const q = `
		UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
		WHERE token_hash = $1 AND revoked_at IS NULL`
	_, err := r.pool.Exec(ctx, q, tokenHash, reason)
	return err
}

func (r *Repository) RevokeTokenFamily(ctx context.Context, familyID uuid.UUID, reason string) error {
	const q = `
		UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = $2
		WHERE family_id = $1 AND revoked_at IS NULL`
	_, err := r.pool.Exec(ctx, q, familyID, reason)
	return err
}

func (r *Repository) CleanExpiredTokens(ctx context.Context) error {
	const q = `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
	_, err := r.pool.Exec(ctx, q)
	return err
}

// --- Audit log ---

func (r *Repository) WriteAuditLog(ctx context.Context, userID *uuid.UUID, eventType, ip, ua string, metadata map[string]interface{}) error {
	var metaJSON []byte
	if metadata != nil {
		var err error
		metaJSON, err = json.Marshal(metadata)
		if err != nil {
			return err
		}
	}

	const q = `
		INSERT INTO auth_audit_log (user_id, event_type, ip_address, user_agent, metadata)
		VALUES ($1, $2, $3, $4, $5)`
	_, err := r.pool.Exec(ctx, q, userID, eventType, ip, ua, metaJSON)
	return err
}

func writeAuditLogTx(ctx context.Context, tx pgx.Tx, userID *uuid.UUID, eventType, ip, ua string, metadata map[string]interface{}) error {
	var metaJSON []byte
	if metadata != nil {
		var err error
		metaJSON, err = json.Marshal(metadata)
		if err != nil {
			return err
		}
	}

	const q = `
		INSERT INTO auth_audit_log (user_id, event_type, ip_address, user_agent, metadata)
		VALUES ($1, $2, $3, $4, $5)`
	_, err := tx.Exec(ctx, q, userID, eventType, ip, ua, metaJSON)
	return err
}

// --- OAuth identities ---

// OAuthUpsertUser handles the three-way account resolution for OAuth login:
//
//   - An existing oauth_identities row for (provider, provider_user_id) is
//     a returning OAuth user — update tokens and last_login_at.
//   - No identity, but a users row with a matching email exists — link the
//     provider identity to that account (OAUTH_ACCOUNT_LINKED).
//   - Neither exists — create a new OAuth-only user (has_password = FALSE,
//     is_verified = TRUE, role = 'viewer') and its identity (OAUTH_ACCOUNT_CREATED).
//
// Provider access/refresh tokens are encrypted at rest with AES-256-GCM
// using encKey. Returns the resolved user and whether this was a new
// registration. Runs entirely within a single transaction with row-level
// locks to prevent races between concurrent callbacks.
func (r *Repository) OAuthUpsertUser(
	ctx context.Context,
	profile *OAuthProfile,
	provider string,
	providerToken *oauth2.Token,
	encKey [32]byte,
	ip, ua string,
) (*User, bool, error) {
	encAccess, err := encryptToken(encKey, providerToken.AccessToken)
	if err != nil {
		return nil, false, err
	}
	encRefresh, err := encryptToken(encKey, providerToken.RefreshToken)
	if err != nil {
		return nil, false, err
	}
	var expiresAt *time.Time
	if !providerToken.Expiry.IsZero() {
		t := providerToken.Expiry
		expiresAt = &t
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op if Commit already ran

	// Step 1: does this provider identity already exist?
	var userID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE`,
		provider, profile.ProviderUserID,
	).Scan(&userID)

	switch {
	case err == nil:
		// Case A: returning OAuth user.
		const updateIdentityQ = `
			UPDATE oauth_identities
			SET email = $3, name = $4, avatar_url = $5,
			    access_token = $6, refresh_token = $7, token_expires_at = $8,
			    last_login_at = NOW()
			WHERE provider = $1 AND provider_user_id = $2`
		if _, err := tx.Exec(ctx, updateIdentityQ,
			provider, profile.ProviderUserID, profile.Email, profile.Name, profile.AvatarURL,
			encAccess, encRefresh, expiresAt,
		); err != nil {
			return nil, false, err
		}

		user, err := r.scanUser(tx.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1 FOR UPDATE`, userID))
		if err != nil {
			return nil, false, err
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return user, false, nil

	case errors.Is(err, pgx.ErrNoRows):
		// Fall through to step 2.

	default:
		return nil, false, err
	}

	// Step 2: is there an existing account with this email?
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1 FOR UPDATE`, profile.Email).Scan(&userID)

	switch {
	case err == nil:
		// Case B1: link this provider identity to the existing account.
		// Do NOT overwrite the password or other user fields.
		if err := insertOAuthIdentity(ctx, tx, userID, provider, profile, encAccess, encRefresh, expiresAt); err != nil {
			return nil, false, err
		}

		if err := writeAuditLogTx(ctx, tx, &userID, AuditOAuthAccountLinked, ip, ua, map[string]interface{}{"provider": provider}); err != nil {
			return nil, false, err
		}

		user, err := r.scanUser(tx.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, userID))
		if err != nil {
			return nil, false, err
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return user, false, nil

	case errors.Is(err, pgx.ErrNoRows):
		// Case B2: brand new OAuth-only account.
		fullName := profile.Name
		if fullName == "" {
			fullName = profile.Email
		}

		const createUserQ = `
			INSERT INTO users (email, password_hash, full_name, role, is_verified, has_password)
			VALUES ($1, '', $2, 'viewer', TRUE, FALSE)
			RETURNING ` + userColumns
		user, err := r.scanUser(tx.QueryRow(ctx, createUserQ, profile.Email, fullName))
		if err != nil {
			return nil, false, err
		}

		if err := insertOAuthIdentity(ctx, tx, user.ID, provider, profile, encAccess, encRefresh, expiresAt); err != nil {
			return nil, false, err
		}

		if err := writeAuditLogTx(ctx, tx, &user.ID, AuditOAuthAccountCreated, ip, ua, map[string]interface{}{"provider": provider}); err != nil {
			return nil, false, err
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return user, true, nil

	default:
		return nil, false, err
	}
}

func insertOAuthIdentity(ctx context.Context, tx pgx.Tx, userID uuid.UUID, provider string, profile *OAuthProfile, encAccess, encRefresh string, expiresAt *time.Time) error {
	const q = `
		INSERT INTO oauth_identities (user_id, provider, provider_user_id, email, name, avatar_url,
		                               access_token, refresh_token, token_expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := tx.Exec(ctx, q,
		userID, provider, profile.ProviderUserID, profile.Email, profile.Name, profile.AvatarURL,
		encAccess, encRefresh, expiresAt,
	)
	return err
}
