// Package content holds this server's copy of the content schema (generated from the typed models in the agent project)
// and checks a schema against what the server itself accepts. The server's checks are always the limit: a schema may be
// stricter, never looser.
package content

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
)

// Schema is the built-in copy of content.schema.json.
//
//go:embed content.schema.json
var Schema []byte

// Tools is the built-in copy of tools.schema.json: what the studio's writing tools take.
//
//go:embed tools.schema.json
var Tools []byte

// Field is what the server accepts for one field. A zero limit means the server sets none of that sort.
type Field struct {
	Column    string
	MaxLength int
	// ByKind is the limit where it differs between a post and an article.
	ByKind   map[string]int
	MaxItems int
	// Assistant says a tool lets an assistant write it.
	Assistant bool
}

// Server is every field a schema may name. A test in the service package holds the limits to the service's own.
var Server = map[string]Field{
	"kind":          {Column: "drafts.kind"},
	"title":         {Column: "drafts.title", MaxLength: 200, Assistant: true},
	"body":          {Column: "drafts.doc", MaxLength: 100_000, ByKind: map[string]int{"post": 3000, "article": 100_000}, Assistant: true},
	"hashtags":      {Column: "drafts.hashtags", MaxItems: 30, Assistant: true},
	"summary":       {Column: "drafts.summary", MaxLength: 300, Assistant: true},
	"slug":          {Column: "drafts.slug", MaxLength: 80, Assistant: true},
	"altText":       {Column: "drafts.alt_text", MaxLength: 1000, Assistant: true},
	"unicodeStyles": {Column: "drafts.unicode_styles", Assistant: true},
	"attachment":    {Column: "drafts.attachment_kind", Assistant: true},
	"headline":      {Column: "drafts.design.title", MaxLength: 400, Assistant: true},
	"eyebrow":       {Column: "drafts.design.eyebrow", MaxLength: 200, Assistant: true},
	"subtitle":      {Column: "drafts.design.subtitle", MaxLength: 600, Assistant: true},
	"tag":           {Column: "drafts.design.tag", MaxLength: 100, Assistant: true},
	"footer":        {Column: "drafts.design.footer", MaxLength: 200, Assistant: true},
	"footerLeft":    {Column: "drafts.design.footerLeft", MaxLength: 200, Assistant: true},
	"quoteAuthor":   {Column: "drafts.design.quoteAuthor", MaxLength: 200, Assistant: true},
	"statValue":     {Column: "drafts.design.statValue", MaxLength: 60, Assistant: true},
	"audience":      {Column: "drafts.audience", MaxLength: 200, Assistant: true},
	"topic":         {Column: "drafts.topic", MaxLength: 100, Assistant: true},
	"campaign":      {Column: "drafts.campaign", MaxLength: 100},
	"reviewNotes":   {Column: "drafts.review_notes", MaxLength: 2000},
	"status":        {Column: "drafts.status"},
	"scheduledAt":   {Column: "drafts.scheduled_at"},
	"timezone":      {Column: "drafts.timezone"},
	"revision":      {Column: "drafts.revision"},
	"version":       {Column: "draft_versions.seq"},
	"createdBy":     {Column: "drafts.created_by"},
	"approvedBy":    {Column: "drafts.approved_by"},
	"approvedAt":    {Column: "drafts.approved_at"},
	"pageAt":        {Column: "drafts.page_at"},
}

type property struct {
	Column    string         `json:"x-column"`
	Writer    string         `json:"x-writer"`
	Kinds     []string       `json:"x-kinds"`
	MaxLength *int           `json:"maxLength"`
	ByKind    map[string]int `json:"x-hardMaxLength"`
	MaxItems  *int           `json:"maxItems"`
	Standard  map[string]struct {
		MinLength *int `json:"minLength"`
		MaxLength *int `json:"maxLength"`
		MaxItems  *int `json:"maxItems"`
	} `json:"x-standard"`
}

// Check refuses a schema that names a field or column the server does not have, gives an assistant a field only a person
// writes, or allows more than the server accepts. The error names the first such field.
func Check(schema []byte) error {
	var s struct {
		Version    int                 `json:"x-schemaVersion"`
		Properties map[string]property `json:"properties"`
	}
	if err := json.Unmarshal(schema, &s); err != nil {
		return fmt.Errorf("the content schema is not valid JSON: %w", err)
	}
	if s.Version < 1 || len(s.Properties) == 0 {
		return fmt.Errorf("the content schema has no version or no fields")
	}
	names := make([]string, 0, len(s.Properties))
	for n := range s.Properties {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, name := range names {
		p := s.Properties[name]
		have, ok := Server[name]
		if !ok {
			return fmt.Errorf("the content schema names %q, which this server does not have", name)
		}
		if p.Column != have.Column {
			return fmt.Errorf("the content schema keeps %q in %q; this server keeps it in %q", name, p.Column, have.Column)
		}
		if p.Writer == "agent" && !have.Assistant {
			return fmt.Errorf("the content schema lets an assistant write %q, which only a person writes", name)
		}
		if have.MaxItems > 0 && (p.MaxItems == nil || *p.MaxItems > have.MaxItems) {
			return fmt.Errorf("the content schema allows more %s than the %d this server accepts", name, have.MaxItems)
		}
		if have.MaxLength > 0 && (p.MaxLength == nil || *p.MaxLength > have.MaxLength) {
			return fmt.Errorf("the content schema allows a longer %q than the %d characters this server accepts", name, have.MaxLength)
		}
		for kind, max := range have.ByKind {
			if !slices.Contains(p.Kinds, kind) {
				continue
			}
			limit, said := p.ByKind[kind]
			if !said {
				limit = *p.MaxLength
			}
			if limit > max {
				return fmt.Errorf("the content schema allows a longer %q in a %s than the %d characters this server accepts", name, kind, max)
			}
		}
		for kind, st := range p.Standard {
			hard := have.MaxLength
			if n, ok := have.ByKind[kind]; ok {
				hard = n
			}
			for _, v := range []*int{st.MinLength, st.MaxLength} {
				if v != nil && hard > 0 && *v > hard {
					return fmt.Errorf("the %s standard for %q is looser than the server's limit of %d", kind, name, hard)
				}
			}
			if st.MaxItems != nil && have.MaxItems > 0 && *st.MaxItems > have.MaxItems {
				return fmt.Errorf("the %s standard for %q is looser than the server's limit of %d", kind, name, have.MaxItems)
			}
		}
	}
	return nil
}
