-- ============================================================
-- Migration 002: OAuth provider identities
-- Extends the users table to support social login
-- ============================================================

-- OAuth provider identities — one row per (user, provider) pair
CREATE TABLE IF NOT EXISTS oauth_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL CHECK (provider IN ('github', 'google')),
    provider_user_id TEXT NOT NULL,        -- Provider's stable user ID (not email)
    email            TEXT NOT NULL,        -- Email as returned by provider
    name             TEXT,                 -- Display name from provider
    avatar_url       TEXT,                 -- Profile picture URL from provider
    access_token     TEXT,                 -- Provider access token (encrypted at rest)
    refresh_token    TEXT,                 -- Provider refresh token if issued (encrypted)
    token_expires_at TIMESTAMPTZ,
    last_login_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A provider user ID maps to exactly one RaftWeave user
    UNIQUE (provider, provider_user_id)
);

-- Index for lookup by provider + provider user ID (used on every OAuth callback)
CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_uid
    ON oauth_identities (provider, provider_user_id);

-- Index for lookup by user_id (used for account linking UI)
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user_id
    ON oauth_identities (user_id);

-- Index for email-based account linking
CREATE INDEX IF NOT EXISTS idx_oauth_identities_email
    ON oauth_identities (email);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_oauth_identities_updated_at ON oauth_identities;
CREATE TRIGGER update_oauth_identities_updated_at
    BEFORE UPDATE ON oauth_identities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add has_password column to users for display + login-method gating
-- has_password = FALSE means the user registered via OAuth only
-- and cannot use email/password login (no password is set for their account)
ALTER TABLE users ADD COLUMN IF NOT EXISTS
    has_password BOOLEAN NOT NULL DEFAULT TRUE;
