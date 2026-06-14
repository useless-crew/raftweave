// Package webhook implements the ingestion layer's webhook listener:
// signature verification, replay deduplication, and per-repository rate
// limiting for GitHub and GitLab push events.
package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

var (
	// ErrMissingSignature is returned when the request carries no
	// signature/token header at all.
	ErrMissingSignature = errors.New("webhook: missing signature header")

	// ErrInvalidSignature is returned when a signature/token header is
	// present but does not match the expected value.
	ErrInvalidSignature = errors.New("webhook: signature verification failed")
)

// githubSignaturePrefix is the required prefix of the
// X-Hub-Signature-256 header.
const githubSignaturePrefix = "sha256="

// VerifyGitHub validates the X-Hub-Signature-256 header value against the
// HMAC-SHA256 of body computed with secret. The comparison is
// constant-time.
func VerifyGitHub(secret, body []byte, sigHeader string) error {
	if sigHeader == "" {
		return ErrMissingSignature
	}
	if !strings.HasPrefix(sigHeader, githubSignaturePrefix) {
		return ErrInvalidSignature
	}

	expectedMAC, err := hex.DecodeString(sigHeader[len(githubSignaturePrefix):])
	if err != nil {
		return ErrInvalidSignature
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	computedMAC := mac.Sum(nil)

	if !hmac.Equal(computedMAC, expectedMAC) {
		return ErrInvalidSignature
	}
	return nil
}

// VerifyGitLab validates the X-Gitlab-Token header value against secret
// using a constant-time comparison.
func VerifyGitLab(secret []byte, tokenHeader string) error {
	if tokenHeader == "" {
		return ErrMissingSignature
	}
	if !hmac.Equal([]byte(tokenHeader), secret) {
		return ErrInvalidSignature
	}
	return nil
}
