package auth

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type contextKey string

const (
	ctxUserID contextKey = "user_id"
	ctxEmail  contextKey = "email"
	ctxRole   contextKey = "role"
)

// --- JWT auth middleware ---

// RequireAuth validates the Authorization header's access token and injects
// the authenticated user's id/email/role into the request context.
func (s *Service) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			writeError(w, errUnauthorized)
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			writeError(w, errUnauthorized)
			return
		}

		claims, err := s.tokens.ParseAccessToken(parts[1])
		if err != nil {
			writeError(w, errUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
		ctx = context.WithValue(ctx, ctxEmail, claims.Email)
		ctx = context.WithValue(ctx, ctxRole, claims.Role)

		next(w, r.WithContext(ctx))
	}
}

func UserIDFromContext(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(ctxUserID).(string)
	return v, ok
}

// --- IP rate limiting middleware ---

type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiter applies a per-IP token-bucket rate limit.
type RateLimiter struct {
	mu       sync.Map
	rps      rate.Limit
	burst    int
	stopOnce sync.Once
	stopCh   chan struct{}
}

func NewRateLimiter(requestsPerMinute, burst int) *RateLimiter {
	rl := &RateLimiter{
		rps:    rate.Limit(float64(requestsPerMinute) / 60.0),
		burst:  burst,
		stopCh: make(chan struct{}),
	}
	go rl.cleanupLoop()
	return rl
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			rl.mu.Range(func(key, value any) bool {
				entry := value.(*ipLimiter)
				if now.Sub(entry.lastSeen) > 5*time.Minute {
					rl.mu.Delete(key)
				}
				return true
			})
		case <-rl.stopCh:
			return
		}
	}
}

func (rl *RateLimiter) Stop() {
	rl.stopOnce.Do(func() { close(rl.stopCh) })
}

func (rl *RateLimiter) getLimiter(ip string) *rate.Limiter {
	now := time.Now()
	if v, ok := rl.mu.Load(ip); ok {
		entry := v.(*ipLimiter)
		entry.lastSeen = now
		return entry.limiter
	}

	entry := &ipLimiter{limiter: rate.NewLimiter(rl.rps, rl.burst), lastSeen: now}
	rl.mu.Store(ip, entry)
	return entry.limiter
}

// Middleware enforces the rate limit, returning 429 with Retry-After when exceeded.
func (rl *RateLimiter) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		limiter := rl.getLimiter(ip)

		if !limiter.Allow() {
			w.Header().Set("Retry-After", "60")
			writeError(w, newAPIError(429, "RATE_LIMITED", "Too many requests, please try again later"))
			return
		}

		next(w, r)
	}
}

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// --- Security headers middleware ---

// SecurityHeaders sets standard hardening headers on every response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-XSS-Protection", "0")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy", "default-src 'self'")
		next.ServeHTTP(w, r)
	})
}

// writeError writes an ErrorResponse with the appropriate status code.
func writeError(w http.ResponseWriter, e *APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.Status)
	_ = writeJSON(w, ErrorResponse{
		Error:   strconv.Itoa(e.Status),
		Code:    e.Code,
		Message: e.Message,
	})
}
