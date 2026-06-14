// Package ingestion wires together the ingestion layer's Connect-RPC
// server: SPIFFE mTLS transport, the webhook listener, and the shared
// metrics/audit middleware.
package ingestion

import (
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"

	ingestionv1connect "github.com/raftweave/backend/api/proto/ingestionv1connect"
	"github.com/raftweave/backend/internal/ingestion/middleware"
	"github.com/raftweave/backend/internal/ingestion/webhook"
	"github.com/raftweave/backend/internal/security/spiffe"
)

// Config holds the parameters needed to start the ingestion mTLS server.
type Config struct {
	// ListenAddr is the address the mTLS Connect-RPC server binds to,
	// e.g. ":8443".
	ListenAddr string

	// SPIFFESocketPath is the SPIFFE Workload API socket address, e.g.
	// "unix:///tmp/spire-agent/public/api.sock".
	SPIFFESocketPath string
}

// Server is the ingestion layer's mTLS Connect-RPC server. Every endpoint
// is mounted behind the SPIFFE mTLS, metrics, and audit middleware.
type Server struct {
	httpServer *http.Server
	spiffeSrc  *spiffe.Source
}

// New builds the ingestion Connect-RPC server. It connects to the SPIFFE
// Workload API to obtain the server's X.509 SVID and trust bundle, which
// are used for mTLS; no plaintext listener is created.
func New(ctx context.Context, cfg Config, webhookHandler *webhook.Handler) (*Server, error) {
	source, err := spiffe.NewSource(ctx, cfg.SPIFFESocketPath)
	if err != nil {
		return nil, fmt.Errorf("ingestion: create spiffe source: %w", err)
	}

	tlsConfig, err := source.BuildServerTLSConfig()
	if err != nil {
		_ = source.Close()
		return nil, fmt.Errorf("ingestion: build tls config: %w", err)
	}

	mux := http.NewServeMux()
	path, handler := ingestionv1connect.NewIngestionServiceHandler(
		webhookHandler,
		connect.WithInterceptors(middleware.AuditInterceptor()),
	)
	mux.Handle(path, handler)

	var rootHandler http.Handler = mux
	rootHandler = middleware.RequireMTLS(rootHandler)

	httpServer := &http.Server{
		Addr:      cfg.ListenAddr,
		Handler:   rootHandler,
		TLSConfig: tlsConfig,
	}

	return &Server{httpServer: httpServer, spiffeSrc: source}, nil
}

// ListenAndServeTLS starts the mTLS HTTP/2 listener. Certificates are
// supplied via the SPIFFE Workload API source rather than files.
func (s *Server) ListenAndServeTLS() error {
	if err := http2.ConfigureServer(s.httpServer, &http2.Server{}); err != nil {
		return fmt.Errorf("ingestion: configure http2: %w", err)
	}
	return s.httpServer.ListenAndServeTLS("", "")
}

// Shutdown gracefully shuts down the mTLS listener and releases the SPIFFE
// Workload API connection.
func (s *Server) Shutdown(ctx context.Context) error {
	err := s.httpServer.Shutdown(ctx)
	if closeErr := s.spiffeSrc.Close(); closeErr != nil && err == nil {
		err = closeErr
	}
	return err
}
