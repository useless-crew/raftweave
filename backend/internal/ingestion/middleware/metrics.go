// Package middleware provides cross-cutting Connect-RPC and HTTP
// middleware shared by every ingestion endpoint: SPIFFE mTLS peer
// validation, Prometheus metrics, and audit logging.
package middleware

import "github.com/prometheus/client_golang/prometheus"

// Metric names are fixed by the ingestion layer specification and must not
// change.
var (
	WebhookRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ingestion_webhook_requests_total",
		Help: "Total webhook requests received, by provider and result.",
	}, []string{"provider", "result"})

	SignatureFailuresTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ingestion_signature_failures_total",
		Help: "Total webhook signature verification failures, by repository.",
	}, []string{"repo_id"})

	RateLimitDroppedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ingestion_ratelimit_dropped_total",
		Help: "Total webhook requests dropped due to per-repository rate limiting.",
	}, []string{"repo_id"})

	ReplayBlockedTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ingestion_replay_blocked_total",
		Help: "Total webhook deliveries rejected as replays.",
	})

	DescriptorValidationDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name: "ingestion_descriptor_validation_duration_seconds",
		Help: "Duration of workload descriptor validation.",
	})

	CredentialStoreDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name: "ingestion_credential_store_duration_seconds",
		Help: "Duration of credential store operations.",
	})

	JobEnqueueTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ingestion_job_enqueue_total",
		Help: "Total jobs enqueued, by job type.",
	}, []string{"job_type"})

	JobDedupTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ingestion_job_dedup_total",
		Help: "Total duplicate job enqueue attempts suppressed, by job type.",
	}, []string{"job_type"})
)

func init() {
	prometheus.MustRegister(
		WebhookRequestsTotal,
		SignatureFailuresTotal,
		RateLimitDroppedTotal,
		ReplayBlockedTotal,
		DescriptorValidationDuration,
		CredentialStoreDuration,
		JobEnqueueTotal,
		JobDedupTotal,
	)
}
