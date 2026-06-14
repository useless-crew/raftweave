// Package spiffe wraps the go-spiffe v2 Workload API client to build mTLS
// server configurations and to validate the SPIFFE trust domain of inbound
// peer certificates. All ingestion endpoints are required to use mTLS
// configured through this package; TLS logic is not duplicated elsewhere.
package spiffe

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"

	"github.com/spiffe/go-spiffe/v2/spiffeid"
	"github.com/spiffe/go-spiffe/v2/spiffetls/tlsconfig"
	"github.com/spiffe/go-spiffe/v2/svid/x509svid"
	"github.com/spiffe/go-spiffe/v2/workloadapi"
)

// TrustDomainName is the only SPIFFE trust domain accepted by the
// ingestion layer.
const TrustDomainName = "raftweave"

var (
	// ErrNoPeerCertificate is returned when a TLS connection has no peer
	// certificate to evaluate.
	ErrNoPeerCertificate = errors.New("spiffe: no peer certificate presented")

	// ErrUntrustedDomain is returned when a peer SVID belongs to a trust
	// domain other than spiffe://raftweave.
	ErrUntrustedDomain = errors.New("spiffe: peer is not a member of the raftweave trust domain")
)

// Source holds an X.509 SVID source obtained from the SPIFFE Workload API.
// Callers must call Close when the source is no longer needed.
type Source struct {
	x509Source *workloadapi.X509Source
}

// NewSource connects to the SPIFFE Workload API at socketPath and fetches
// the workload's X.509 SVID and trust bundles.
func NewSource(ctx context.Context, socketPath string) (*Source, error) {
	x509Source, err := workloadapi.NewX509Source(ctx, workloadapi.WithClientOptions(workloadapi.WithAddr(socketPath)))
	if err != nil {
		return nil, fmt.Errorf("create x509 source: %w", err)
	}
	return &Source{x509Source: x509Source}, nil
}

// Close releases the underlying Workload API connection.
func (s *Source) Close() error {
	return s.x509Source.Close()
}

// BuildServerTLSConfig returns a TLS config that requires and verifies
// client certificates, accepting only SVIDs issued within the
// spiffe://raftweave trust domain.
func (s *Source) BuildServerTLSConfig() (*tls.Config, error) {
	td, err := spiffeid.TrustDomainFromString(TrustDomainName)
	if err != nil {
		return nil, fmt.Errorf("parse trust domain: %w", err)
	}
	return tlsconfig.MTLSServerConfig(s.x509Source, s.x509Source, tlsconfig.AuthorizeMemberOf(td)), nil
}

// PeerIDFromConnState extracts the SPIFFE ID of the peer certificate
// presented on state and verifies it belongs to the spiffe://raftweave
// trust domain.
func PeerIDFromConnState(state tls.ConnectionState) (spiffeid.ID, error) {
	if len(state.PeerCertificates) == 0 {
		return spiffeid.ID{}, ErrNoPeerCertificate
	}

	id, err := x509svid.IDFromCert(state.PeerCertificates[0])
	if err != nil {
		return spiffeid.ID{}, fmt.Errorf("extract spiffe id: %w", err)
	}

	td, err := spiffeid.TrustDomainFromString(TrustDomainName)
	if err != nil {
		return spiffeid.ID{}, fmt.Errorf("parse trust domain: %w", err)
	}

	if !id.MemberOf(td) {
		return spiffeid.ID{}, ErrUntrustedDomain
	}

	return id, nil
}
