package middleware

import (
	"context"
	"net/http"

	"github.com/spiffe/go-spiffe/v2/spiffeid"

	"github.com/raftweave/backend/internal/security/audit"
	"github.com/raftweave/backend/internal/security/spiffe"
)

type contextKey string

// peerIDContextKey is the context key under which the verified SPIFFE ID
// of the calling workload is stored.
const peerIDContextKey contextKey = "ingestion.peer_spiffe_id"

// RequireMTLS wraps next so that every request must present a client
// certificate with a SPIFFE ID in the spiffe://raftweave trust domain.
// Requests that fail this check are rejected with HTTP 401, which Connect
// clients interpret as CodeUnauthenticated.
func RequireMTLS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil {
			audit.Log(r.Context(), "ingestion.mtls.no_tls", nil)
			http.Error(w, "mTLS required", http.StatusUnauthorized)
			return
		}

		id, err := spiffe.PeerIDFromConnState(*r.TLS)
		if err != nil {
			audit.Log(r.Context(), "ingestion.mtls.rejected", map[string]any{"error": err.Error()})
			http.Error(w, "mTLS peer verification failed", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), peerIDContextKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// PeerID returns the verified SPIFFE ID of the calling workload from ctx,
// as set by RequireMTLS.
func PeerID(ctx context.Context) (spiffeid.ID, bool) {
	id, ok := ctx.Value(peerIDContextKey).(spiffeid.ID)
	return id, ok
}
