package content

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTheBuiltInSchemaIsAccepted(t *testing.T) {
	if err := Check(Schema); err != nil {
		t.Fatal(err)
	}
}

func TestEveryFieldTheServerHasIsInTheSchema(t *testing.T) {
	var s struct {
		Properties map[string]any `json:"properties"`
	}
	if err := json.Unmarshal(Schema, &s); err != nil {
		t.Fatal(err)
	}
	for name := range Server {
		if _, ok := s.Properties[name]; !ok {
			t.Errorf("the schema lacks %q", name)
		}
	}
}

// changed returns the built-in schema with one thing altered.
func changed(t *testing.T, edit func(props map[string]map[string]any)) []byte {
	t.Helper()
	var s map[string]any
	if err := json.Unmarshal(Schema, &s); err != nil {
		t.Fatal(err)
	}
	props := map[string]map[string]any{}
	for k, v := range s["properties"].(map[string]any) {
		props[k] = v.(map[string]any)
	}
	edit(props)
	s["properties"] = props
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestASchemaThatIsLooserOrUnknownIsRefusedByName(t *testing.T) {
	cases := map[string]func(map[string]map[string]any){
		`"mood", which`:     func(p map[string]map[string]any) { p["mood"] = map[string]any{"x-column": "drafts.mood"} },
		`keeps "topic"`:     func(p map[string]map[string]any) { p["topic"]["x-column"] = "drafts.subject" },
		`write "campaign"`:  func(p map[string]map[string]any) { p["campaign"]["x-writer"] = "agent" },
		`longer "summary"`:  func(p map[string]map[string]any) { p["summary"]["maxLength"] = 301 },
		`longer "headline"`: func(p map[string]map[string]any) { delete(p["headline"], "maxLength") },
		`more hashtags`:     func(p map[string]map[string]any) { p["hashtags"]["maxItems"] = 31 },
		`"body" in a post`: func(p map[string]map[string]any) {
			p["body"]["x-hardMaxLength"] = map[string]any{"post": 3001, "article": 100000}
		},
		`standard for "body`: func(p map[string]map[string]any) {
			p["body"]["x-standard"] = map[string]any{"post": map[string]any{"maxLength": 3500}}
		},
	}
	for want, edit := range cases {
		if err := Check(changed(t, edit)); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v", want, err)
		}
	}
	if err := Check(changed(t, func(p map[string]map[string]any) { p["summary"]["maxLength"] = 100 })); err != nil {
		t.Errorf("a stricter schema: %v", err)
	}
	for _, bad := range []string{"", "{}", "[1]"} {
		if Check([]byte(bad)) == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}
