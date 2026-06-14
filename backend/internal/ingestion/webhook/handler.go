package webhook

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"

	ingestionv1 "github.com/raftweave/backend/api/proto"
	"github.com/raftweave/backend/internal/ingestion/middleware"
	"github.com/raftweave/backend/internal/security/audit"
)

// githubSignatureHeader and gitlabTokenHeader are the headers used to
// identify which provider sent a webhook and to carry its signature/token.
const (
	githubSignatureHeader = "X-Hub-Signature-256"
	gitlabTokenHeader     = "X-Gitlab-Token"
)

// vaultMountPath and webhookSecretPrefix together form the Vault KV v2 path
// convention for per-repository webhook HMAC secrets:
// secret/raftweave/webhook-secrets/{org}/{repo}.
const (
	vaultMountPath      = "secret"
	webhookSecretPrefix = "raftweave/webhook-secrets/"
)

// SecretReader fetches per-repository webhook secrets from Vault. It is
// satisfied by *internal/security/vault.Client.
type SecretReader interface {
	ReadKV(ctx context.Context, mountPath, secretPath string) (map[string]interface{}, error)
}

// Handler implements the IngestionService Connect-RPC service for
// Component 1 (Webhook Listener): signature verification, replay
// deduplication, and per-repository rate limiting.
type Handler struct {
	secrets SecretReader
	dedup   *Dedup
	limiter *RateLimiter
}

// NewHandler builds a webhook Handler.
func NewHandler(secrets SecretReader, dedup *Dedup, limiter *RateLimiter) *Handler {
	return &Handler{secrets: secrets, dedup: dedup, limiter: limiter}
}

// ReceiveWebhook implements ingestionv1connect.IngestionServiceHandler.
func (h *Handler) ReceiveWebhook(ctx context.Context, req *connect.Request[ingestionv1.WebhookEvent]) (*connect.Response[ingestionv1.WebhookAck], error) {
	event := req.Msg
	header := req.Header()

	githubSig := header.Get(githubSignatureHeader)
	gitlabToken := header.Get(gitlabTokenHeader)

	var provider string
	switch {
	case githubSig != "":
		provider = "github"
	case gitlabToken != "":
		provider = "gitlab"
	default:
		middleware.WebhookRequestsTotal.WithLabelValues("unknown", "unauthenticated").Inc()
		audit.Log(ctx, "webhook.signature.missing", map[string]any{"repo_id": event.GetRepoId()})
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrMissingSignature)
	}

	secret, err := h.fetchSecret(ctx, event.GetRepoId())
	if err != nil {
		middleware.WebhookRequestsTotal.WithLabelValues(provider, "error").Inc()
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	switch provider {
	case "github":
		err = VerifyGitHub(secret, event.GetPayload(), githubSig)
	case "gitlab":
		err = VerifyGitLab(secret, gitlabToken)
	}
	if err != nil {
		middleware.WebhookRequestsTotal.WithLabelValues(provider, "unauthenticated").Inc()
		middleware.SignatureFailuresTotal.WithLabelValues(event.GetRepoId()).Inc()
		audit.Log(ctx, "webhook.signature.invalid", map[string]any{
			"repo_id":  event.GetRepoId(),
			"provider": provider,
		})
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}

	if err := h.dedup.Check(ctx, event.GetDeliveryId()); err != nil {
		if errors.Is(err, ErrDuplicate) {
			middleware.WebhookRequestsTotal.WithLabelValues(provider, "duplicate").Inc()
			middleware.ReplayBlockedTotal.Inc()
			audit.Log(ctx, "webhook.replay.blocked", map[string]any{
				"repo_id":     event.GetRepoId(),
				"delivery_id": event.GetDeliveryId(),
			})
			return nil, connect.NewError(connect.CodeAlreadyExists, err)
		}
		middleware.WebhookRequestsTotal.WithLabelValues(provider, "error").Inc()
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := h.limiter.Allow(ctx, event.GetRepoId()); err != nil {
		middleware.WebhookRequestsTotal.WithLabelValues(provider, "rate_limited").Inc()
		middleware.RateLimitDroppedTotal.WithLabelValues(event.GetRepoId()).Inc()
		audit.Log(ctx, "webhook.ratelimit.dropped", map[string]any{"repo_id": event.GetRepoId()})
		return nil, connect.NewError(connect.CodeResourceExhausted, err)
	}

	middleware.WebhookRequestsTotal.WithLabelValues(provider, "accepted").Inc()
	return connect.NewResponse(&ingestionv1.WebhookAck{
		Accepted:   true,
		DeliveryId: event.GetDeliveryId(),
	}), nil
}

// fetchSecret reads the HMAC secret for repoID from Vault at
// secret/raftweave/webhook-secrets/{repoID}.
func (h *Handler) fetchSecret(ctx context.Context, repoID string) ([]byte, error) {
	data, err := h.secrets.ReadKV(ctx, vaultMountPath, webhookSecretPrefix+repoID)
	if err != nil {
		return nil, fmt.Errorf("fetch webhook secret for %s: %w", repoID, err)
	}

	secret, ok := data["secret"].(string)
	if !ok || secret == "" {
		return nil, fmt.Errorf("webhook secret missing or invalid for %s", repoID)
	}

	return []byte(secret), nil
}
