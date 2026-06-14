package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// selfSignedSVID builds a minimal self-signed certificate carrying a single
// SPIFFE ID URI SAN, sufficient for x509svid.IDFromCert to extract an ID
// without requiring a live SPIRE agent or trust bundle.
func selfSignedSVID(t *testing.T, spiffeURI string) *x509.Certificate {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	uri, err := url.Parse(spiffeURI)
	if err != nil {
		t.Fatalf("parse spiffe uri: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test-svid"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		URIs:         []*url.URL{uri},
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}
	return cert
}

func TestRequireMTLS_NoTLS_Unauthorized(t *testing.T) {
	called := false
	handler := RequireMTLS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if called {
		t.Fatalf("handler should not be invoked without TLS")
	}
}

func TestRequireMTLS_WrongTrustDomain_Unauthorized(t *testing.T) {
	called := false
	handler := RequireMTLS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	cert := selfSignedSVID(t, "spiffe://other-domain/workload/foo")

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if called {
		t.Fatalf("handler should not be invoked for a peer outside the raftweave trust domain")
	}
}

func TestRequireMTLS_ValidTrustDomain_Allowed(t *testing.T) {
	var gotPeer bool
	handler := RequireMTLS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, gotPeer = PeerID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	cert := selfSignedSVID(t, "spiffe://raftweave/workload/ingestion")

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !gotPeer {
		t.Fatalf("expected verified peer SPIFFE ID in context")
	}
}
