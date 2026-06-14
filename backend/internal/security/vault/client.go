// Package vault provides a thin wrapper around the HashiCorp Vault API
// client used by the ingestion layer to read and write secrets. No
// credential values are ever read from environment variables or config
// files; only the Vault connection parameters (VAULT_ADDR, VAULT_TOKEN) are.
package vault

import (
	"context"
	"fmt"
	"os"

	vaultapi "github.com/hashicorp/vault/api"
)

// Client wraps a Vault API client for KV v2 secret access.
type Client struct {
	api *vaultapi.Client
}

// NewClient builds a Vault client from the VAULT_ADDR and VAULT_TOKEN
// environment variables. VAULT_ADDR is required; VAULT_TOKEN may be empty
// when the process authenticates via another method (e.g. Kubernetes auth)
// configured on the underlying client.
func NewClient() (*Client, error) {
	addr := os.Getenv("VAULT_ADDR")
	if addr == "" {
		return nil, fmt.Errorf("VAULT_ADDR is required")
	}

	cfg := vaultapi.DefaultConfig()
	cfg.Address = addr

	apiClient, err := vaultapi.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("create vault client: %w", err)
	}

	if token := os.Getenv("VAULT_TOKEN"); token != "" {
		apiClient.SetToken(token)
	}

	return &Client{api: apiClient}, nil
}

// ReadKV reads a KV v2 secret at the given mount and path, returning its
// data fields.
func (c *Client) ReadKV(ctx context.Context, mountPath, secretPath string) (map[string]interface{}, error) {
	secret, err := c.api.KVv2(mountPath).Get(ctx, secretPath)
	if err != nil {
		return nil, fmt.Errorf("read vault secret %s/%s: %w", mountPath, secretPath, err)
	}
	return secret.Data, nil
}

// WriteKV writes a KV v2 secret at the given mount and path.
func (c *Client) WriteKV(ctx context.Context, mountPath, secretPath string, data map[string]interface{}) error {
	if _, err := c.api.KVv2(mountPath).Put(ctx, secretPath, data); err != nil {
		return fmt.Errorf("write vault secret %s/%s: %w", mountPath, secretPath, err)
	}
	return nil
}
