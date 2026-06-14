package webhook

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeDedupStore is an in-memory dedupStore with a manually-advanced clock,
// used to test TTL expiry without a live Redis instance.
type fakeDedupStore struct {
	now     time.Time
	entries map[string]time.Time // key -> expiry
}

func newFakeDedupStore() *fakeDedupStore {
	return &fakeDedupStore{now: time.Now(), entries: make(map[string]time.Time)}
}

func (f *fakeDedupStore) SetNX(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	if exp, ok := f.entries[key]; ok && f.now.Before(exp) {
		return false, nil
	}
	f.entries[key] = f.now.Add(ttl)
	return true, nil
}

func (f *fakeDedupStore) advance(d time.Duration) {
	f.now = f.now.Add(d)
}

func TestDedup_FirstUUID_Passes(t *testing.T) {
	store := newFakeDedupStore()
	d := &Dedup{store: store}

	if err := d.Check(context.Background(), "11111111-1111-1111-1111-111111111111"); err != nil {
		t.Fatalf("expected first delivery to pass, got: %v", err)
	}
}

func TestDedup_SameUUID_Returns_ErrDuplicate(t *testing.T) {
	store := newFakeDedupStore()
	d := &Dedup{store: store}
	ctx := context.Background()
	id := "22222222-2222-2222-2222-222222222222"

	if err := d.Check(ctx, id); err != nil {
		t.Fatalf("expected first delivery to pass, got: %v", err)
	}

	if err := d.Check(ctx, id); !errors.Is(err, ErrDuplicate) {
		t.Fatalf("expected ErrDuplicate for replayed delivery, got: %v", err)
	}
}

func TestDedup_ExpiredUUID_Passes_Again(t *testing.T) {
	store := newFakeDedupStore()
	d := &Dedup{store: store}
	ctx := context.Background()
	id := "33333333-3333-3333-3333-333333333333"

	if err := d.Check(ctx, id); err != nil {
		t.Fatalf("expected first delivery to pass, got: %v", err)
	}

	if err := d.Check(ctx, id); !errors.Is(err, ErrDuplicate) {
		t.Fatalf("expected ErrDuplicate before TTL expiry, got: %v", err)
	}

	store.advance(6 * time.Minute)

	if err := d.Check(ctx, id); err != nil {
		t.Fatalf("expected delivery to pass again after TTL expiry, got: %v", err)
	}
}
