# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Download dependencies first (cached layer — only re-runs if go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/server ./main.go

# ── Stage 2: Run (distroless — no shell, no package manager) ────────────────
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

# Copy only the compiled binary and migrations
COPY --from=builder /app/server /app/server
COPY --from=builder /app/migrations /app/migrations

# Run as non-root user (distroless nonroot = UID 65532)
USER nonroot:nonroot

EXPOSE 8080

ENTRYPOINT ["/app/server"]
