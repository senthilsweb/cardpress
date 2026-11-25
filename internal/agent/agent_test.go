package agent

import (
	"reflect"
	"strings"
	"testing"
)

func TestParseProposalReadsOnlyContentFields(t *testing.T) {
	p, err := ParseProposal([]byte(`{
		"kind": "Post", "title": " Hello ", "body": "Body text", "hashtags": ["#Go", "go", "Data_AI"], "altText": "alt", "rationale": "why",
		"layout": "quote", "paletteId": "ink", "background": "mesh", "design": {"title": "x"}, "publish": true, "scheduledAt": "2026-12-01T09:00:00Z"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != "post" || p.Title != "Hello" || !reflect.DeepEqual(p.Hashtags, []string{"Go", "Data_AI"}) {
		t.Fatalf("%+v", p)
	}
	// the struct has no field a design or publish instruction could land in
	typ := reflect.TypeOf(p)
	for i := 0; i < typ.NumField(); i++ {
		switch typ.Field(i).Name {
		case "Kind", "Title", "Body", "Hashtags", "AltText", "Rationale":
		default:
			t.Errorf("unexpected proposal field %s", typ.Field(i).Name)
		}
	}
}

func TestInvalidProposalsAreRejected(t *testing.T) {
	long := strings.Repeat("a", maxPostChars)
	for name, in := range map[string]string{
		"not json":       `nope`,
		"unknown kind":   `{"kind":"tweet","body":"x"}`,
		"missing kind":   `{"body":"x"}`,
		"empty body":     `{"kind":"post","body":"   "}`,
		"bad hashtag":    `{"kind":"post","body":"x","hashtags":["two words"]}`,
		"over the limit": `{"kind":"post","body":"` + long + `","hashtags":["x"]}`,
		"control chars":  "{\"kind\":\"post\",\"body\":\"a\\u0000b\"}",
		"long title":     `{"kind":"post","body":"x","title":"` + strings.Repeat("t", maxTitle+1) + `"}`,
		"long alt":       `{"kind":"post","body":"x","altText":"` + strings.Repeat("t", maxAlt+1) + `"}`,
		"huge article":   `{"kind":"article","body":"` + strings.Repeat("a", maxArticle+1) + `"}`,
	} {
		if _, err := ParseProposal([]byte(in)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestLimitsCountTheHashtagLine(t *testing.T) {
	fits := Proposal{Kind: "post", Body: strings.Repeat("a", maxPostChars-2-1-3), Hashtags: []string{"tag"}} // "\n\n#tag"
	if err := fits.Normalize(); err != nil {
		t.Fatalf("exactly at the limit should be accepted: %v", err)
	}
	over := Proposal{Kind: "post", Body: strings.Repeat("a", maxPostChars-2-1-3+1), Hashtags: []string{"tag"}}
	if err := over.Normalize(); err == nil {
		t.Fatal("one character over should be refused")
	}
}

func TestArticlesCarryNoHashtags(t *testing.T) {
	p := Proposal{Kind: "article", Body: "## T\n\ntext", Hashtags: []string{"x"}}
	if err := p.Normalize(); err != nil || len(p.Hashtags) != 0 || p.Hashtags == nil {
		t.Fatalf("%v %+v", err, p)
	}
}
