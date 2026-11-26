package mcpserver

import (
	"context"
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/senthilsweb/cardpress/internal/content"
	"github.com/senthilsweb/cardpress/internal/service"
)

type shape struct {
	Type       any              `json:"type"`
	Properties map[string]shape `json:"properties"`
	Required   []string         `json:"required"`
}

// kind is a property's type, ignoring that an optional one may also be null.
func (s shape) kind() string {
	var out []string
	switch t := s.Type.(type) {
	case string:
		out = []string{t}
	case []any:
		for _, v := range t {
			if v != "null" {
				out = append(out, v.(string))
			}
		}
	}
	return strings.Join(out, ",")
}

func names(m map[string]shape) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// The tools take what the content schema says they take: the same names, types and required fields.
func TestToolInputsMatchTheContentSchema(t *testing.T) {
	var want struct {
		Tools map[string]shape `json:"tools"`
	}
	if err := json.Unmarshal(content.Tools, &want); err != nil {
		t.Fatal(err)
	}
	cs := connect(t, newRig(t, stubFetcher{}).deps)
	list, err := cs.ListTools(context.Background(), &mcp.ListToolsParams{})
	if err != nil {
		t.Fatal(err)
	}
	have := map[string]shape{}
	for _, tool := range list.Tools {
		b, _ := json.Marshal(tool.InputSchema)
		var s shape
		if err := json.Unmarshal(b, &s); err != nil {
			t.Fatal(err)
		}
		have[tool.Name] = s
	}
	for name, w := range want.Tools {
		h, ok := have[name]
		if !ok {
			t.Errorf("no tool %s", name)
			continue
		}
		if a, b := names(h.Properties), names(w.Properties); !slices.Equal(a, b) {
			t.Errorf("%s takes %v, the schema says %v", name, a, b)
		}
		sort.Strings(h.Required)
		sort.Strings(w.Required)
		if !slices.Equal(h.Required, w.Required) {
			t.Errorf("%s requires %v, the schema says %v", name, h.Required, w.Required)
		}
		for p, ws := range w.Properties {
			if got := h.Properties[p].kind(); got != ws.kind() {
				t.Errorf("%s.%s is %q, the schema says %q", name, p, got, ws.kind())
			}
		}
	}
	// the card's words are a map on this side, so that a field that must not be touched is seen and refused by name
	card := names(want.Tools["update_card_text"].Properties["changes"].Properties)
	mine := slices.Clone(service.CardTextFields)
	sort.Strings(mine)
	if !slices.Equal(card, mine) {
		t.Errorf("card text takes %v, the schema says %v", mine, card)
	}
}

func TestAnAgentWritesAudienceAndTopicAndNothingAPersonKeeps(t *testing.T) {
	r := newRig(t, stubFetcher{})
	if _, err := r.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{"id":"p","name":"P"}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	cs := connect(t, r.deps)
	_, made := call(t, cs, "create_draft", map[string]any{"profileId": "p", "kind": "post"})
	id := made["id"].(string)
	res, out := call(t, cs, "update_draft", map[string]any{"draftId": id, "audience": "Founders", "topic": "Contracts"})
	if res.IsError || out["audience"] != "Founders" || out["topic"] != "Contracts" || out["campaign"] != "" {
		t.Fatalf("%q %v", errText(res), out)
	}
	if _, err := r.studio.SetPlanning(context.Background(), id, service.PlanningPatch{ReviewNotes: ptr("Shorter.")}); err != nil {
		t.Fatal(err)
	}
	if _, got := call(t, cs, "get_draft", map[string]any{"id": id}); got["reviewNotes"] != "Shorter." {
		t.Fatalf("%v", got)
	}
	for _, field := range []string{"campaign", "reviewNotes"} {
		res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "update_draft", Arguments: map[string]any{"draftId": id, field: "x"}})
		if err == nil && !res.IsError {
			t.Errorf("an agent set %s", field)
		}
	}
	d, _ := r.studio.GetDraft(context.Background(), id)
	if d.Campaign != "" || d.ReviewNotes != "Shorter." {
		t.Fatalf("%+v", d)
	}
}
