package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/senthilsweb/cardpress/internal/agent"
)

const (
	maxGuideChars = 8000
	keptGuides    = 50
)

// GuideKinds are what a brand may write a guide for.
var GuideKinds = []string{"post", "article", "greeting"}

// Guide is a brand's guide of one kind as it stands, with what our writers come with.
type Guide struct {
	Kind string `json:"kind"`
	// Body is the brand's own guide; empty means our house style is used.
	Body      string `json:"body"`
	Version   int    `json:"version"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	UpdatedBy string `json:"updatedBy,omitempty"`
	// Ours is our house style, which the brand's guide replaces; Fixed the rules that stay. Empty when the assistant
	// does not say.
	Ours  string `json:"ours,omitempty"`
	Fixed string `json:"fixed,omitempty"`
}

// GuidesView is a brand's guides and the rules for saving one.
type GuidesView struct {
	Guides   []Guide `json:"guides"`
	MaxChars int     `json:"maxChars"`
	// Checked says a saved guide is also read by a model, which may refuse it.
	Checked bool `json:"checked"`
}

// GuideVersion is one saved version.
type GuideVersion struct {
	Version   int    `json:"version"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	CreatedBy string `json:"createdBy,omitempty"`
}

var (
	htmlish = regexp.MustCompile(`<[A-Za-z/!?]`)
	// a link's address, inline or as a reference
	linkTargets = regexp.MustCompile(`(?m)\]\(\s*([^)\s]*)|^\s{0,3}\[[^\]]*\]:\s*(\S+)`)
	// the studio's tools: a guide says how to write, and has no business naming them
	toolNames = regexp.MustCompile(`(?i)\b(get_draft|update_draft|create_draft|update_card_text|set_attachment|report_reply|offer_choices|publish_post|propose_content|get_proposal|save_memory|delete_memory|list_memories|fetch_source|get_design|list_drafts|list_profiles|list_connections|list_jobs|get_job|get_writing_guide|mcp__\w+)\b`)
)

// cleanGuide tidies a guide and refuses what a writing guide never needs: HTML and anything shaped like the blocks the
// assistant is given, code blocks, pictures, links other than web addresses, and the names of the studio's tools.
func cleanGuide(body string) (string, error) {
	body = strings.TrimSpace(strings.ReplaceAll(body, "\r\n", "\n"))
	if body == "" {
		return "", nil
	}
	if !utf8.ValidString(body) || strings.IndexFunc(body, func(r rune) bool {
		// control and invisible format characters can hide text from the person who reads the guide
		return r != '\n' && r != '\t' && r != '‍' && (unicode.IsControl(r) || unicode.Is(unicode.Cf, r))
	}) >= 0 {
		return "", invalid("the guide holds characters that cannot be kept")
	}
	if n := utf8.RuneCountInString(body); n > maxGuideChars {
		return "", invalid("the guide has %d characters; at most %d", n, maxGuideChars)
	}
	switch {
	case strings.Contains(body, "```") || strings.Contains(body, "~~~"):
		return "", invalid("a guide has no code blocks")
	case htmlish.MatchString(body):
		return "", invalid("a guide is plain Markdown: no HTML or tags like <this>")
	case strings.Contains(body, "!["):
		return "", invalid("a guide has no pictures")
	}
	for _, m := range linkTargets.FindAllStringSubmatch(body, -1) {
		to := strings.ToLower(m[1] + m[2])
		if !strings.HasPrefix(to, "https://") && !strings.HasPrefix(to, "http://") {
			return "", invalid("a link in a guide must be a web address (http or https)")
		}
	}
	if m := toolNames.FindString(body); m != "" {
		return "", invalid("a guide says how to write; it cannot name the studio's tools (%s)", m)
	}
	return body, nil
}

func guideKind(kind string) error {
	for _, k := range GuideKinds {
		if k == kind {
			return nil
		}
	}
	return ErrNotFound
}

// currentGuide is the newest version of a brand's guide; version 0 when none was ever saved.
func currentGuide(ctx context.Context, db *sql.DB, profileID, kind string) (Guide, error) {
	g := Guide{Kind: kind}
	err := db.QueryRowContext(ctx, `SELECT version, body, created_by, created_at FROM brand_guides WHERE profile_id = ? AND kind = ? ORDER BY version DESC LIMIT 1`, profileID, kind).
		Scan(&g.Version, &g.Body, &g.UpdatedBy, &g.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return g, nil
	}
	return g, err
}

// Guides returns a brand's guides, for someone who may see the brand.
func (c *Chat) Guides(ctx context.Context, profileID string) (GuidesView, error) {
	_, checked := c.agent.(agent.GuideChecker)
	v := GuidesView{Guides: []Guide{}, MaxChars: maxGuideChars, Checked: checked}
	if err := brandVisible(ctx, c.db, profileID); err != nil {
		return v, err
	}
	bases := map[string]agent.GuideBase{}
	if g, ok := c.agent.(agent.Guided); ok {
		bases = g.GuideBases()
	}
	for _, kind := range GuideKinds {
		g, err := currentGuide(ctx, c.db, profileID, kind)
		if err != nil {
			return v, err
		}
		g.Ours, g.Fixed = bases[kind].Ours, bases[kind].Fixed
		v.Guides = append(v.Guides, g)
	}
	return v, nil
}

// SaveGuide saves a new version of a brand's guide; an empty one goes back to our house style. A guide is held to the
// fixed rules and, where the assistant can, read by a model that refuses anything but how to write.
func (c *Chat) SaveGuide(ctx context.Context, profileID, kind, body string) (GuidesView, error) {
	name, err := c.brandName(ctx, profileID)
	if err != nil {
		return GuidesView{}, err
	}
	if err := guideKind(kind); err != nil {
		return GuidesView{}, err
	}
	if body, err = cleanGuide(body); err != nil {
		return GuidesView{}, err
	}
	now, err := currentGuide(ctx, c.db, profileID, kind)
	if err != nil {
		return GuidesView{}, err
	}
	if body == now.Body { // nothing to save, and nothing to check again
		return c.Guides(ctx, profileID)
	}
	if checker, ok := c.agent.(agent.GuideChecker); ok && body != "" {
		accepted, why, err := checker.CheckGuide(ctx, kind, body)
		if err != nil {
			log.Printf("guide check: %v", err)
			return GuidesView{}, invalid("the guide could not be checked just now, so it was not saved; try again")
		}
		if !accepted {
			if why == "" {
				why = "it does more than say how to write"
			}
			recordEvent(ctx, c.db, c.stamp(), EventGuide, name, "refused by the check: "+kind)
			return GuidesView{}, invalid("the check did not accept the guide: %s", clip(why, 300))
		}
	}
	if err := c.addGuide(ctx, profileID, kind, body); err != nil {
		return GuidesView{}, err
	}
	detail := fmt.Sprintf("%s guide saved, %d characters", kind, utf8.RuneCountInString(body))
	if body == "" {
		detail = kind + ": back to our house style"
	}
	recordEvent(ctx, c.db, c.stamp(), EventGuide, name, detail)
	return c.Guides(ctx, profileID)
}

// addGuide stores body as the newest version and forgets the oldest ones.
func (c *Chat) addGuide(ctx context.Context, profileID, kind, body string) error {
	who := ""
	if p, ok := PrincipalFrom(ctx); ok && p.User != nil {
		who = p.User.Email
	}
	// the version is worked out in the insert, so two saves at once cannot take the same one
	if _, err := c.db.ExecContext(ctx, `INSERT INTO brand_guides (profile_id, kind, version, body, created_by, created_at)
		SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ?, ? FROM brand_guides WHERE profile_id = ? AND kind = ?`,
		profileID, kind, body, who, c.stamp(), profileID, kind); err != nil {
		return err
	}
	_, err := c.db.ExecContext(ctx, `DELETE FROM brand_guides WHERE profile_id = ? AND kind = ?
		AND version <= (SELECT MAX(version) FROM brand_guides WHERE profile_id = ? AND kind = ?) - ?`, profileID, kind, profileID, kind, keptGuides)
	return err
}

// GuideVersions are the saved versions of a brand's guide, newest first.
func (c *Chat) GuideVersions(ctx context.Context, profileID, kind string) ([]GuideVersion, error) {
	if err := brandVisible(ctx, c.db, profileID); err != nil {
		return nil, err
	}
	if err := guideKind(kind); err != nil {
		return nil, err
	}
	rows, err := c.db.QueryContext(ctx, `SELECT version, body, created_at, created_by FROM brand_guides WHERE profile_id = ? AND kind = ? ORDER BY version DESC`, profileID, kind)
	if err != nil {
		return nil, err
	}
	out := []GuideVersion{}
	for rows.Next() {
		var v GuideVersion
		if err := rows.Scan(&v.Version, &v.Body, &v.CreatedAt, &v.CreatedBy); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

// RestoreGuide makes an earlier version the newest one. It was checked when it was first saved; the fixed rules are
// applied again, as they may have grown.
func (c *Chat) RestoreGuide(ctx context.Context, profileID, kind string, version int) (GuidesView, error) {
	name, err := c.brandName(ctx, profileID)
	if err != nil {
		return GuidesView{}, err
	}
	if err := guideKind(kind); err != nil {
		return GuidesView{}, err
	}
	var body string
	err = c.db.QueryRowContext(ctx, `SELECT body FROM brand_guides WHERE profile_id = ? AND kind = ? AND version = ?`, profileID, kind, version).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return GuidesView{}, ErrNotFound
	}
	if err != nil {
		return GuidesView{}, err
	}
	if body, err = cleanGuide(body); err != nil {
		return GuidesView{}, err
	}
	if err := c.addGuide(ctx, profileID, kind, body); err != nil {
		return GuidesView{}, err
	}
	recordEvent(ctx, c.db, c.stamp(), EventGuide, name, fmt.Sprintf("%s guide: version %d restored", kind, version))
	return c.Guides(ctx, profileID)
}
