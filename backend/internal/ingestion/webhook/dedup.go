package webhook

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ErrDuplicate is returned when a webhook delivery ID has already been
// seen within the dedup window.
var ErrDuplicate = errors.New("webhook: duplicate delivery")

// dedupTTL is the replay-detection window for webhook delivery IDs.
const dedupTTL = 5 * time.Minute

// dedupStore is the minimal storage operation Dedup depends on, allowing
// tests to substitute an in-memory fake with a controllable clock instead
// of a live Redis instance.
type dedupStore interface {
	// SetNX atomically records key if absent, with the given TTL. It
	// returns true if key was newly recorded, false if it already existed.
	SetNX(ctx context.Context, key string, ttl time.Duration) (bool, error)
}

type redisDedupStore struct {
	rdb *redis.Client
}

func (s *redisDedupStore) SetNX(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return s.rdb.SetNX(ctx, key, "1", ttl).Result()
}

// Dedup provides replay protection for webhook deliveries using a
// Redis-backed SETNX with a 5-minute TTL.
type Dedup struct {
	store dedupStore
}

// NewDedup builds a Dedup backed by the given Redis client.
func NewDedup(rdb *redis.Client) *Dedup {
	return &Dedup{store: &redisDedupStore{rdb: rdb}}
}

// Check records deliveryID as seen. It returns ErrDuplicate if the same
// delivery ID was already seen within the dedup window.
func (d *Dedup) Check(ctx context.Context, deliveryID string) error {
	ok, err := d.store.SetNX(ctx, dedupKey(deliveryID), dedupTTL)
	if err != nil {
		return fmt.Errorf("dedup check: %w", err)
	}
	if !ok {
		return ErrDuplicate
	}
	return nil
}

func dedupKey(deliveryID string) string {
	return "ingestion:webhook:dedup:" + deliveryID
}
