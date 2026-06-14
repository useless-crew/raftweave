package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/cors"

	"github.com/raftweave/backend/internal/auth"
	"github.com/raftweave/backend/internal/ingestion"
	"github.com/raftweave/backend/internal/ingestion/webhook"
	"github.com/raftweave/backend/internal/security/vault"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("[startup] %s no .env file found, relying on process environment", ts())
	} else {
		log.Printf("[startup] %s loaded .env", ts())
	}

	cfg, env, err := loadConfig()
	if err != nil {
		log.Fatalf("[startup] %s configuration error: %v", ts(), err)
	}
	log.Printf("[startup] %s configuration validated", ts())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := runMigrations(ctx, env.databaseURL); err != nil {
		log.Fatalf("[startup] %s migrations failed: %v", ts(), err)
	}
	log.Printf("[startup] %s migrations applied", ts())

	pool, err := pgxpool.New(ctx, env.databaseURL)
	if err != nil {
		log.Fatalf("[startup] %s failed to create db pool: %v", ts(), err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("[startup] %s db ping failed: %v", ts(), err)
	}
	log.Printf("[startup] %s database connection established", ts())

	redisClient := redis.NewClient(&redis.Options{Addr: env.redisAddr, Password: env.redisPassword, DB: env.redisDB})
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("[startup] %s redis ping failed: %v", ts(), err)
	}
	log.Printf("[startup] %s redis connection established", ts())

	repo := auth.NewRepository(pool)
	tokens := auth.NewTokenManager(cfg)
	service := auth.NewService(repo, tokens, cfg)
	handler := auth.NewHandler(service)
	rateLimiter := auth.NewRateLimiter(cfg.RateLimitPerMinute, cfg.RateLimitBurst)
	defer rateLimiter.Stop()

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux, rateLimiter)

	// --- OAuth providers ---
	providers := map[string]*auth.OAuthProvider{
		"github": auth.NewGitHubProvider(env.githubClientID, env.githubClientSecret, env.githubRedirectURL),
		"google": auth.NewGoogleProvider(env.googleClientID, env.googleClientSecret, env.googleRedirectURL),
	}
	oauthStates := auth.NewOAuthStateStore(redisClient)
	oauthHandler := auth.NewOAuthHandler(service, providers, oauthStates)

	// OAuth endpoints initiate external network calls, so they get stricter
	// rate limits than the general auth endpoints.
	oauthAuthorizeLimiter := auth.NewRateLimiter(10, 3)
	defer oauthAuthorizeLimiter.Stop()
	oauthCallbackLimiter := auth.NewRateLimiter(20, 5)
	defer oauthCallbackLimiter.Stop()

	oauthHandler.RegisterRoutes(mux, oauthAuthorizeLimiter, oauthCallbackLimiter)

	mux.Handle("GET /metrics", promhttp.Handler())

	corsMiddleware := cors.New(cors.Options{
		AllowedOrigins:   env.allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           86400,
	})

	var rootHandler http.Handler = mux
	rootHandler = corsMiddleware.Handler(rootHandler)
	rootHandler = auth.SecurityHeaders(rootHandler)

	srv := &http.Server{
		Addr:    ":" + env.port,
		Handler: rootHandler,
	}

	go func() {
		log.Printf("[startup] %s listening on :%s", ts(), env.port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[startup] %s server error: %v", ts(), err)
		}
	}()

	// --- Ingestion layer (System 1) ---
	// The ingestion mTLS server requires a SPIFFE Workload API socket. If
	// none is reachable (e.g. SPIRE is not deployed in this environment),
	// log a warning and continue running without it rather than failing
	// the whole process.
	var ingestionSrv *ingestion.Server
	vaultClient, err := vault.NewClient()
	if err != nil {
		log.Printf("[startup] %s ingestion layer disabled: %v", ts(), err)
	} else {
		webhookHandler := webhook.NewHandler(vaultClient, webhook.NewDedup(redisClient), webhook.NewRateLimiter())
		ingestionSrv, err = ingestion.New(ctx, ingestion.Config{
			ListenAddr:       env.ingestionListenAddr,
			SPIFFESocketPath: env.spiffeSocketPath,
		}, webhookHandler)
		if err != nil {
			log.Printf("[startup] %s ingestion layer disabled: %v", ts(), err)
			ingestionSrv = nil
		} else {
			go func() {
				log.Printf("[startup] %s ingestion mTLS listener starting on %s", ts(), env.ingestionListenAddr)
				if err := ingestionSrv.ListenAndServeTLS(); err != nil && !errors.Is(err, http.ErrServerClosed) {
					log.Printf("[startup] %s ingestion server error: %v", ts(), err)
				}
			}()
		}
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Printf("[shutdown] %s shutdown signal received", ts())
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if ingestionSrv != nil {
		if err := ingestionSrv.Shutdown(shutdownCtx); err != nil {
			log.Printf("[shutdown] %s ingestion server shutdown failed: %v", ts(), err)
		}
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[shutdown] %s graceful shutdown failed: %v", ts(), err)
	} else {
		log.Printf("[shutdown] %s server stopped cleanly", ts())
	}
}

func ts() string {
	return time.Now().Format(time.RFC3339)
}

// --- Environment / config loading ---

type envConfig struct {
	port           string
	databaseURL    string
	redisAddr      string
	redisPassword  string
	redisDB        int
	allowedOrigins []string

	githubClientID     string
	githubClientSecret string
	githubRedirectURL  string
	googleClientID     string
	googleClientSecret string
	googleRedirectURL  string

	ingestionListenAddr string
	spiffeSocketPath    string
}

func loadConfig() (*auth.Config, *envConfig, error) {
	required := []string{
		"DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ALLOWED_ORIGINS",
		"GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URL",
		"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URL",
		"OAUTH_TOKEN_ENCRYPTION_KEY", "FRONTEND_URL",
	}
	for _, key := range required {
		if os.Getenv(key) == "" {
			return nil, nil, fmt.Errorf("missing required environment variable %s", key)
		}
	}

	port := getEnvDefault("PORT", "8080")

	accessExpiryMin, err := strconv.Atoi(getEnvDefault("JWT_ACCESS_EXPIRY_MINUTES", "15"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRY_MINUTES: %w", err)
	}
	refreshExpiryDays, err := strconv.Atoi(getEnvDefault("JWT_REFRESH_EXPIRY_DAYS", "7"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY_DAYS: %w", err)
	}
	maxFailedAttempts, err := strconv.Atoi(getEnvDefault("MAX_FAILED_ATTEMPTS", "5"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid MAX_FAILED_ATTEMPTS: %w", err)
	}
	lockoutMinutes, err := strconv.Atoi(getEnvDefault("LOCKOUT_DURATION_MINUTES", "15"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid LOCKOUT_DURATION_MINUTES: %w", err)
	}
	rateLimitPerMinute, err := strconv.Atoi(getEnvDefault("RATE_LIMIT_REQUESTS_PER_MINUTE", "30"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid RATE_LIMIT_REQUESTS_PER_MINUTE: %w", err)
	}
	rateLimitBurst, err := strconv.Atoi(getEnvDefault("RATE_LIMIT_BURST", "10"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid RATE_LIMIT_BURST: %w", err)
	}

	redisOpts, err := redis.ParseURL(os.Getenv("REDIS_URL"))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid REDIS_URL: %w", err)
	}

	// Fail fast if the OAuth token encryption key is missing or malformed —
	// the service must not start with a misconfigured encryption key.
	oauthEncKey, err := auth.DeriveOAuthEncryptionKey(os.Getenv("OAUTH_TOKEN_ENCRYPTION_KEY"))
	if err != nil {
		return nil, nil, err
	}

	cfg := &auth.Config{
		AccessSecret:       []byte(os.Getenv("JWT_ACCESS_SECRET")),
		RefreshSecret:      []byte(os.Getenv("JWT_REFRESH_SECRET")),
		AccessExpiry:       time.Duration(accessExpiryMin) * time.Minute,
		RefreshExpiry:      time.Duration(refreshExpiryDays) * 24 * time.Hour,
		MaxFailedAttempts:  maxFailedAttempts,
		LockoutDuration:    time.Duration(lockoutMinutes) * time.Minute,
		RateLimitPerMinute: rateLimitPerMinute,
		RateLimitBurst:     rateLimitBurst,
		OAuthEncryptionKey: oauthEncKey,
		FrontendURL:        os.Getenv("FRONTEND_URL"),
	}

	env := &envConfig{
		port:           port,
		databaseURL:    os.Getenv("DATABASE_URL"),
		redisAddr:      redisOpts.Addr,
		redisPassword:  redisOpts.Password,
		redisDB:        redisOpts.DB,
		allowedOrigins: splitAndTrim(os.Getenv("ALLOWED_ORIGINS"), ","),

		githubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		githubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		githubRedirectURL:  os.Getenv("GITHUB_REDIRECT_URL"),
		googleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		googleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		googleRedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),

		ingestionListenAddr: getEnvDefault("INGESTION_LISTEN_ADDR", ":8443"),
		spiffeSocketPath:    getEnvDefault("SPIFFE_ENDPOINT_SOCKET", "unix:///tmp/spire-agent/public/api.sock"),
	}

	return cfg, env, nil
}

func getEnvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitAndTrim(s, sep string) []string {
	var out []string
	for _, part := range strings.Split(s, sep) {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// --- Migrations ---

func runMigrations(ctx context.Context, databaseURL string) error {
	migrationsDir := "migrations"
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	pgConn, err := pgconn.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("connect for migrations: %w", err)
	}
	defer pgConn.Close(ctx)

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		path := filepath.Join(migrationsDir, entry.Name())
		sqlBytes, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}

		result := pgConn.Exec(ctx, string(sqlBytes))
		if _, err := result.ReadAll(); err != nil {
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}
		log.Printf("[startup] %s applied migration %s", ts(), entry.Name())
	}

	return nil
}
