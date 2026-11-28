package cma

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/content"
)

// ManifestVersion is the contract version this adapter speaks. Version 5 is still accepted, so that the server and the
// agents can be deployed one after the other.
const (
	ManifestVersion = 7
	oldestManifest  = 5
	// schemaFrom is the first version that must carry the content schema.
	schemaFrom = 6
)

// Outcome is how a first draft of one kind is asked for and graded.
type Outcome struct {
	Description   string `json:"description"`
	Rubric        string `json:"rubric"`
	MaxIterations int    `json:"max_iterations"`
}

// Tier is one set of agents: a coordinator with its writers, the same work on other models. From version 7.
type Tier struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	AgentID      string `json:"agent_id"`
	AgentVersion string `json:"agent_version"` // pinned when given
	// Models says which model does what, for the screen.
	Models []TierModel `json:"models,omitempty"`
}

// TierModel is a role ("Coordinator", "Article writer") and the name of its model.
type TierModel struct {
	Role  string `json:"role"`
	Model string `json:"model"`
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
	// Tiers are the sets of agents on offer, the default first. A manifest without them has one: its agent_id.
	Tiers []Tier `json:"tiers,omitempty"`
	// Guides are what the writers come with, by kind: shown to someone writing a brand's own guide.
	Guides map[string]GuideBase `json:"guides,omitempty"`
}

// GuideBase is our house style for one kind of writing and the rules that stay whatever a brand's guide says.
type GuideBase struct {
	Ours  string `json:"ours"`
	Fixed string `json:"fixed"`
}

var tierID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

// tiers are the manifest's tiers; one made from agent_id when it lists none.
func (m Manifest) tiers() []Tier {
	if len(m.Tiers) > 0 {
		return m.Tiers
	}
	return []Tier{{ID: "standard", Name: "Standard", AgentID: m.AgentID, AgentVersion: m.AgentVersion}}
}

// tier finds a tier by id; the first one for an id that is empty or not on offer.
func (m Manifest) tier(id string) Tier {
	all := m.tiers()
	for _, t := range all {
		if t.ID == id {
			return t
		}
	}
	return all[0]
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
		if m.Version >= schemaFrom {
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
	if len(m.Tiers) > 8 {
		return m, fmt.Errorf("the manifest has %d tiers; at most 8", len(m.Tiers))
	}
	seen := map[string]bool{}
	for _, t := range m.Tiers {
		switch {
		case !tierID.MatchString(t.ID):
			return m, fmt.Errorf("the manifest has a tier whose id is not a short lower-case name: %q", t.ID)
		case seen[t.ID]:
			return m, fmt.Errorf("the manifest has the tier %q twice", t.ID)
		case strings.TrimSpace(t.Name) == "" || t.AgentID == "":
			return m, fmt.Errorf("the manifest's tier %q needs a name and an agent_id", t.ID)
		}
		if v := t.AgentVersion; v != "" {
			if n, err := strconv.Atoi(v); err != nil || n < 1 {
				return m, fmt.Errorf("the manifest's tier %q has an agent_version that is not a version number: %q", t.ID, v)
			}
		}
		seen[t.ID] = true
	}
	return m, nil
}
