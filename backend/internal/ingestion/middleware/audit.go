package middleware

import (
	"context"

	"connectrpc.com/connect"

	"github.com/raftweave/backend/internal/security/audit"
)

// AuditInterceptor logs every RPC invocation at AUDIT severity, recording
// the procedure name and the outcome.
func AuditInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			resp, err := next(ctx, req)

			attrs := map[string]any{"procedure": req.Spec().Procedure}
			if err != nil {
				attrs["error"] = err.Error()
				audit.Log(ctx, "ingestion.rpc.error", attrs)
			} else {
				audit.Log(ctx, "ingestion.rpc.success", attrs)
			}

			return resp, err
		}
	})
}
