package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
	"time"
)

func sign(secret, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return githubSignaturePrefix + hex.EncodeToString(mac.Sum(nil))
}

func TestHMACVerify_ValidSignature(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte(`{"ref":"refs/heads/main"}`)

	if err := VerifyGitHub(secret, body, sign(secret, body)); err != nil {
		t.Fatalf("expected valid signature to verify, got error: %v", err)
	}
}

func TestHMACVerify_TamperedBody(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte(`{"ref":"refs/heads/main"}`)
	sig := sign(secret, body)

	tampered := []byte(`{"ref":"refs/heads/evil"}`)

	if err := VerifyGitHub(secret, tampered, sig); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature for tampered body, got: %v", err)
	}
}

func TestHMACVerify_MissingHeader(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte(`{"ref":"refs/heads/main"}`)

	if err := VerifyGitHub(secret, body, ""); !errors.Is(err, ErrMissingSignature) {
		t.Fatalf("expected ErrMissingSignature for empty header, got: %v", err)
	}
}

func TestHMACVerify_WrongAlgorithmPrefix(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte(`{"ref":"refs/heads/main"}`)

	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	sigWithWrongPrefix := "sha1=" + hex.EncodeToString(mac.Sum(nil))

	if err := VerifyGitHub(secret, body, sigWithWrongPrefix); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature for wrong algorithm prefix, got: %v", err)
	}
}

func TestHMACVerify_EmptyBody(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte{}

	if err := VerifyGitHub(secret, body, sign(secret, body)); err != nil {
		t.Fatalf("expected valid signature over empty body to verify, got error: %v", err)
	}

	if err := VerifyGitHub(secret, body, sign(secret, []byte("not-empty"))); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature for mismatched empty body, got: %v", err)
	}
}

// TestHMACVerify_ConstantTimeProperty is a best-effort sanity check that
// verification time does not depend on whether the signature matches.
// hmac.Equal is documented as constant-time for equal-length inputs; this
// test guards against a regression to a naive byte-by-byte comparison
// (e.g. "==" or bytes.Equal with an early-exit) by comparing average
// durations for matching vs. mismatching signatures of identical length.
func TestHMACVerify_ConstantTimeProperty(t *testing.T) {
	secret := []byte("test-hmac-secret")
	body := []byte(`{"ref":"refs/heads/main","commits":[{"id":"abc123"}]}`)

	validSig := sign(secret, body)

	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	badMAC := mac.Sum(nil)
	badMAC[0] ^= 0xFF // flip the first byte: same length, different value
	invalidSig := githubSignaturePrefix + hex.EncodeToString(badMAC)

	const iterations = 2000

	measure := func(sig string) time.Duration {
		start := time.Now()
		for i := 0; i < iterations; i++ {
			_ = VerifyGitHub(secret, body, sig)
		}
		return time.Since(start)
	}

	validDur := measure(validSig)
	invalidDur := measure(invalidSig)

	// Allow generous variance (5x) -- this is a smoke test against gross
	// short-circuiting, not a precise timing-attack measurement.
	ratio := float64(validDur) / float64(invalidDur)
	if ratio > 5 || ratio < 0.2 {
		t.Fatalf("verification time differs too much between matching and mismatching signatures: valid=%v invalid=%v ratio=%f", validDur, invalidDur, ratio)
	}
}
