package cma

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/content"
)

// ManifestVersion is the contract version this adapter speaks. Version 5 is still accepted, so that the server and the
// agents can be deployed one after the other.
const (
	ManifestVersion = 6
	oldestManifest  = 5
)

// Outcome is how a first draft of one kind is asked for and graded.
type Outcome struct {
	Description   string `json:"description"`
	Rubric        string `json:"rubric"`
	MaxIterations int    `json:"max_iterations"`
}

// Manifest is what the agent repository publishes about its deployed agents (built by its build-manifest.sh). It holds
// ids and rubric texts, and no secret.
type Manifest struct {
	Version       int                `json:"version"`
	AgentID       string             `json:"agent_id"`
	AgentVersion  string             `json:"agent_version"` // pinned when given
	EnvironmentID string             `json:"environment_id"`
	VaultID       string             `json:"vault_id"`
	MCPServerURL  string             `json:"mcp_server_url"`
	Outcomes      map[string]Outcome `json:"outcomes"`
	// Schema is the content schema the agents were built with, and SchemaVersion its version. Required from version 6.
	Schema        json.RawMessage `json:"schema,omitempty"`
	SchemaVersion int             `json:"schema_version,omitempty"`
}

const maxManifest = 1 << 20

// LoadManifest reads the manifest from a file, an https address, or the JSON itself (handy as a deployment secret).
func LoadManifest(ctx context.Context, from string) (Manifest, error) {
	var m Manifest
	from = strings.TrimSpace(from)
	var raw []byte
	var err error
	switch {
	case from == "":
		return m, fmt.Errorf("set CARDPRESS_AGENT_MANIFEST to the agent manifest (a file, an https address or the JSON)")
	case strings.HasPrefix(from, "{"):
		raw = []byte(from)
	case strings.HasPrefix(from, "https://"):
		ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		req, rerr := http.NewRequestWithContext(ctx, http.MethodGet, from, nil)
		if rerr != nil {
			return m, fmt.Errorf("the manifest address is not valid: %w", rerr)
		}
		res, rerr := http.DefaultClient.Do(req)
		if rerr != nil {
			return m, fmt.Errorf("could not fetch the manifest: %w", rerr)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return m, fmt.Errorf("fetching the manifest answered %s", res.Status)
		}
		raw, err = io.ReadAll(io.LimitReader(res.Body, maxManifest))
	default:
		raw, err = os.ReadFile(from)
	}
	if err != nil {
		return m, fmt.Errorf("could not read the manifest: %w", err)
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("the manifest is not valid JSON: %w", err)
	}
	if m.Version < oldestManifest || m.Version > ManifestVersion {
		return m, fmt.Errorf("the manifest is version %d; this server speaks versions %d to %d", m.Version, oldestManifest, ManifestVersion)
	}
	for name, v := range map[string]string{"agent_id": m.AgentID, "environment_id": m.EnvironmentID, "vault_id": m.VaultID} {
		if v == "" {
			return m, fmt.Errorf("the manifest has no %s", name)
		}
	}
	for _, kind := range []string{"post", "article"} {
		if m.Outcomes[kind].Rubric == "" {
			return m, fmt.Errorf("the manifest has no rubric for %s", kind)
		}
	}
	if len(m.Schema) == 0 {
		if m.Version >= ManifestVersion {
			return m, fmt.Errorf("the manifest has no schema")
		}
	} else {
		if err := content.Check(m.Schema); err != nil {
			return m, fmt.Errorf("the manifest's schema is refused: %w", err)
		}
		var s struct {
			Version int `json:"x-schemaVersion"`
		}
		_ = json.Unmarshal(m.Schema, &s) // Check has parsed it
		if m.SchemaVersion != 0 && m.SchemaVersion != s.Version {
			return m, fmt.Errorf("the manifest says schema version %d but carries version %d", m.SchemaVersion, s.Version)
		}
	}
	if v := m.AgentVersion; v != "" {
		if n, err := strconv.Atoi(v); err != nil || n < 1 {
			return m, fmt.Errorf("the manifest's agent_version is not a version number: %q", v)
		}
	}
	return m, nil
}
