# OAuth 2.0 Social Login Setup (GitHub & Google)

RaftWeave supports signing in with GitHub or Google in addition to
email/password. This guide covers creating the OAuth apps, configuring the
backend, and running the stack with Docker Compose.

## 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers) and click **New OAuth App**.
2. Fill in:
   - **Application name**: `RaftWeave (dev)`
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:8080/auth/github/callback`
3. Click **Register application**, then generate a **Client secret**.
4. Note the **Client ID** and **Client secret**.

## 2. Create a Google OAuth Client

1. Go to the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** of type **Web application**.
3. Add to **Authorized redirect URIs**: `http://localhost:8080/auth/google/callback`
4. Add to **Authorized JavaScript origins**: `http://localhost:5173`
5. Note the **Client ID** and **Client secret**.

## 3. Generate the token encryption key

Provider access/refresh tokens are encrypted at rest with AES-256-GCM. Generate
a 32-byte (64 hex character) key:

```bash
openssl rand -hex 32
```

## 4. Configure `backend/.env`

Copy `backend/.env.example` to `backend/.env` if you haven't already, then set:

```bash
FRONTEND_URL=http://localhost:5173

GITHUB_CLIENT_ID=<your GitHub client id>
GITHUB_CLIENT_SECRET=<your GitHub client secret>
GITHUB_REDIRECT_URL=http://localhost:8080/auth/github/callback

GOOGLE_CLIENT_ID=<your Google client id>
GOOGLE_CLIENT_SECRET=<your Google client secret>
GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback

OAUTH_TOKEN_ENCRYPTION_KEY=<output of `openssl rand -hex 32`>
```

The server fails fast at startup if any of these are missing, or if
`OAUTH_TOKEN_ENCRYPTION_KEY` is not exactly 64 hex characters.

## 5. Run the stack

```bash
docker compose up -d
```

This starts Postgres, Redis, the backend API (`http://127.0.0.1:8080`), and
Adminer (`http://127.0.0.1:8888`).

To run just the backend locally against containerized Postgres/Redis:

```bash
docker compose up postgres redis -d
cd backend && go run main.go
```

And the frontend separately:

```bash
cd dashboard && npm run dev
```

## 6. Try it out

Open `http://localhost:5173`, go to Sign In, and click **Continue with
GitHub** or **Continue with Google**.

## Database Administration (Adminer)

Adminer is available at `http://localhost:8888`, bound to `127.0.0.1` only
(it is never exposed on a non-loopback interface). Use:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `raftweave`
- Password: `raftweave_dev_password`
- Database: `raftweave_auth`
