// Package audit provides structured logging for security-relevant events
// (signature failures, replay blocks, rate limit drops, credential access).
// These events are logged at AUDIT severity, distinct from regular INFO
// logging, so they can be routed and retained separately downstream.
package audit

import (
	"context"
	"log/slog"
	"os"
)

// SeverityAudit is the severity label applied to every event logged
// through this package.
const SeverityAudit = "AUDIT"

var logger = slog.New(slog.NewJSONHandler(os.Stdout, nil))

// Log records a security-relevant event at AUDIT severity with the given
// attributes.
func Log(ctx context.Context, event string, attrs map[string]any) {
	args := make([]any, 0, len(attrs)*2+2)
	args = append(args, "severity", SeverityAudit)
	for k, v := range attrs {
		args = append(args, k, v)
	}
	logger.InfoContext(ctx, event, args...)
}
