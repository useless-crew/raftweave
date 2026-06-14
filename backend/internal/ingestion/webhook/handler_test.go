package webhook

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	ingestionv1 "github.com/raftweave/backend/api/proto"
)

// fakeSecretReader returns a fixed secret for every repo.
type fakeSecretReader struct {
	secret string
}

func (f *fakeSecretReader) ReadKV(ctx context.Context, mountPath, secretPath string) (map[string]interface{}, error) {
	return map[string]interface{}{"secret": f.secret}, nil
}

func newTestHandler(secret string) *Handler {
	return NewHandler(
		&fakeSecretReader{secret: secret},
		&Dedup{store: newFakeDedupStore()},
		NewRateLimiter(),
	)
}

func newRequest(payload []byte, repoID, deliveryID string) *connect.Request[ingestionv1.WebhookEvent] {
	return connect.NewRequest(&ingestionv1.WebhookEvent{
		Provider:   "github",
		RepoId:     repoID,
		DeliveryId: deliveryID,
		Payload:    payload,
	})
}

func TestReceiveWebhook_ValidGitHubSignature_Accepted(t *testing.T) {
	secret := "test-hmac-secret"
	payload := []byte(`{"ref":"refs/heads/main"}`)

	req := newRequest(payload, "org/repo", "delivery-1")
	req.Header().Set(githubSignatureHeader, sign([]byte(secret), payload))

	resp, err := newTestHandler(secret).ReceiveWebhook(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Msg.GetAccepted() {
		t.Fatalf("expected ack to be accepted")
	}
	if resp.Msg.GetDeliveryId() != "delivery-1" {
		t.Fatalf("unexpected delivery id: %s", resp.Msg.GetDeliveryId())
	}
}

func TestReceiveWebhook_MissingSignature_Unauthenticated(t *testing.T) {
	req := newRequest([]byte("{}"), "org/repo", "delivery-2")

	_, err := newTestHandler("secret").ReceiveWebhook(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got: %v", err)
	}
}

func TestReceiveWebhook_InvalidSignature_Unauthenticated(t *testing.T) {
	payload := []byte(`{"ref":"refs/heads/main"}`)
	req := newRequest(payload, "org/repo", "delivery-3")
	req.Header().Set(githubSignatureHeader, sign([]byte("wrong-secret"), payload))

	_, err := newTestHandler("test-hmac-secret").ReceiveWebhook(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got: %v", err)
	}
}

func TestReceiveWebhook_ReplayedDelivery_AlreadyExists(t *testing.T) {
	secret := "test-hmac-secret"
	payload := []byte(`{"ref":"refs/heads/main"}`)
	h := newTestHandler(secret)

	req := func() *connect.Request[ingestionv1.WebhookEvent] {
		r := newRequest(payload, "org/repo", "delivery-4")
		r.Header().Set(githubSignatureHeader, sign([]byte(secret), payload))
		return r
	}

	if _, err := h.ReceiveWebhook(context.Background(), req()); err != nil {
		t.Fatalf("unexpected error on first delivery: %v", err)
	}

	_, err := h.ReceiveWebhook(context.Background(), req())
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Fatalf("expected CodeAlreadyExists for replayed delivery, got: %v", err)
	}
}
