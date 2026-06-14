package webhook

import (
	"context"
	"errors"
	"sync"

	"golang.org/x/time/rate"
)

// ErrRateLimited is returned when a repository has exceeded its webhook
// request budget.
var ErrRateLimited = errors.New("webhook: rate limit exceeded")

const (
	// ratePerMinute is the sustained request rate allowed per repository.
	ratePerMinute = 60
	// rateBurst is the maximum burst size allowed per repository.
	rateBurst = 10
)

// RateLimiter enforces a per-repository token-bucket rate limit of 60
// requests/minute with a burst of 10.
type RateLimiter struct {
	limiters sync.Map // repoID (string) -> *rate.Limiter
}

// NewRateLimiter builds a RateLimiter.
func NewRateLimiter() *RateLimiter {
	return &RateLimiter{}
}

// Allow reports whether a request for repoID is permitted under the
// per-repository token bucket. It returns ErrRateLimited if the bucket is
// exhausted.
func (r *RateLimiter) Allow(ctx context.Context, repoID string) error {
	limiterAny, _ := r.limiters.LoadOrStore(repoID, rate.NewLimiter(rate.Limit(ratePerMinute)/60, rateBurst))
	limiter := limiterAny.(*rate.Limiter)

	if !limiter.Allow() {
		return ErrRateLimited
	}
	return nil
}
