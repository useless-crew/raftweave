# RaftWeave Auth Backend

## Quick Start

```bash
# 1. Start infrastructure
docker compose up postgres redis -d

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum, change the JWT secrets

# 3. Run the server (migrations run automatically on startup)
go run main.go
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Register a new account |
| POST | /auth/login | Login, returns access + refresh token |
| POST | /auth/refresh | Rotate refresh token |
| POST | /auth/logout | Revoke refresh token (requires auth) |
| GET | /auth/me | Current user profile (requires auth) |
| GET | /health | Health check |
| GET | /auth/{provider}/authorize | Start an OAuth flow (`provider` is `github` or `google`), returns `{"authorization_url": "..."}` |
| GET | /auth/{provider}/callback | OAuth provider redirect target; resolves the account and redirects to the frontend with a token pair |

## Social Login

GitHub and Google sign-in use the OAuth 2.0 Authorization Code flow with PKCE
(`golang.org/x/oauth2`). The frontend calls `GET /auth/{provider}/authorize`,
redirects the browser to the returned `authorization_url`, and the provider
redirects back to `GET /auth/{provider}/callback`, which redirects to
`{FRONTEND_URL}/auth/callback#access_token=...` with the issued token pair.

Account resolution on callback:

| Situation | Result |
|-----------|--------|
| An `oauth_identities` row already exists for (provider, provider user id) | Sign in to the linked account |
| No identity, but a `users` row with a matching email exists | Link the provider identity to that existing account (`OAUTH_ACCOUNT_LINKED`) |
| Neither exists | Create a new account with `has_password = false`, `role = 'viewer'` (`OAUTH_ACCOUNT_CREATED`) |

Accounts created via OAuth only (`has_password = false`) cannot use
`/auth/login` with a password — they must continue signing in via the same
provider.

Provider access/refresh tokens are encrypted at rest with AES-256-GCM (key
derived via HKDF from `OAUTH_TOKEN_ENCRYPTION_KEY`). CSRF state and PKCE
verifiers are stored server-side in Redis with a 10-minute TTL and consumed
atomically (`GETDEL`) — never placed in cookies or query parameters.

See [docs/oauth-setup.md](../docs/oauth-setup.md) for how to configure GitHub
and Google OAuth apps.

## Database Administration

[Adminer](https://www.adminer.org/) is available at `http://localhost:8888`
when running via `docker compose up -d`, bound to `127.0.0.1` only (not
reachable from other hosts). Login with:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `raftweave`
- Password: `raftweave_dev_password`
- Database: `raftweave_auth`

## Security Architecture

- Passwords: bcrypt cost 12
- Access tokens: HS256 JWT, 15-minute expiry, in-memory only on client
- Refresh tokens: HS256 JWT, 7-day expiry, SHA-256 hash stored in DB
- Refresh rotation: every use issues a new pair; reuse revokes entire family
- Account lockout: 5 failed attempts → 15-minute lock
- Rate limiting: 30 requests/minute per IP on auth endpoints
- Dummy bcrypt comparison on unknown emails to prevent timing-based user enumeration
- Security headers (HSTS, CSP, X-Frame-Options, etc.) applied to all responses
- CORS restricted to explicit origins from `ALLOWED_ORIGINS` (no wildcard)

## Validation

With Postgres and Redis running (`docker compose up postgres redis -d`) and the server running on `:8080`:

```bash
# Health check
curl -sf http://localhost:8080/health

# Register
curl -sf -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@raftweave.dev","password":"TestPass123","full_name":"Test User"}'

# Login
curl -sf -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@raftweave.dev","password":"TestPass123"}'

# /auth/me (replace TOKEN with the access_token from login)
curl -sf http://localhost:8080/auth/me -H "Authorization: Bearer TOKEN"

# Refresh (replace REFRESH with the refresh_token from login)
curl -sf -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"REFRESH"}'
```
