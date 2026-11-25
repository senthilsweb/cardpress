package service

// What an assistant may do to a person's work, on top of what it can read: make a draft, write its text, change the
// words on its card, and keep notes about a brand. Every write goes through the same checks as a person's.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ErrStale is a write that was based on an older state of the draft than the one stored.
var ErrStale = fmt.Errorf("%w: the draft has changed since it was read", ErrConflict)

// DraftPatch changes only the fields that are set.
type DraftPatch struct {
	// Revision is the revision the writer read. It is required with Body.
	Revision      int
	Body          *string // plain text: blank lines between paragraphs, "- " bullets, "## " headings in an article
	Title         *string
	Summary       *string
	Slug          *string
	Hashtags      *[]string
	AltText       *string
	UnicodeStyles *bool
}

// CardText is the words drawn on a card: the only part of a design an assistant may change.
type CardText struct {
	Eyebrow     *string `json:"eyebrow,omitempty"`
	Title       *string `json:"title,omitempty"`
	Subtitle    *string `json:"subtitle,omitempty"`
	Footer      *string `json:"footer,omitempty"`
	FooterLeft  *string `json:"footerLeft,omitempty"`
	Tag         *string `json:"tag,omitempty"`
	QuoteAuthor *string `json:"quoteAuthor,omitempty"`
	StatValue   *string `json:"statValue,omitempty"`
}

// CardTextFields are the names CardText accepts.
var CardTextFields = []string{"eyebrow", "title", "subtitle", "footer", "footerLeft", "tag", "quoteAuthor", "statValue"}

// Effects are the side results of a change a person should hear about.
type Effects struct {
	ReturnedToDraft  bool `json:"returnedToDraft,omitempty"`
	PageTakenOffline bool `json:"pageTakenOffline,omitempty"`
}

func effects(before, after Draft) Effects {
	return Effects{ReturnedToDraft: before.Status != StatusDraft && after.Status == StatusDraft, PageTakenOffline: before.PageAt != "" && after.PageAt == ""}
}

func defaultCard() CardDesign {
	return CardDesign{SizeID: "li-post", Layout: "hero", Background: "mesh", PaletteID: "cream-emerald", Seed: 7, TitleScale: 1, Intensity: 0.9, ShowLogo: true, ShowFooter: true, Photos: []string{}}
}

// startingCard is the card a brand's new drafts begin with, and what is shown for a draft that has none.
func (s *Studio) startingCard(ctx context.Context, profileID string) (CardDesign, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT data FROM designs WHERE profile_id = ?`, profileID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return defaultCard(), nil
	}
	if err != nil {
		return CardDesign{}, err
	}
	d, perr := ParseCardDesign([]byte(raw))
	if perr != nil {
		return defaultCard(), nil // an old saved design the editor would repair
	}
	return d, nil
}

// Card returns the card a draft is shown with.
func (s *Studio) Card(ctx context.Context, draftID string) (CardDesign, Draft, error) {
	d, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return CardDesign{}, d, err
	}
	if len(d.Design) > 0 {
		card, err := ParseCardDesign(d.Design)
		return card, d, err
	}
	card, err := s.startingCard(ctx, d.ProfileID)
	return card, d, err
}

// NewAssistantDraft makes an empty post or article with the brand's starting card.
func (s *Studio) NewAssistantDraft(ctx context.Context, profileID, kind string) (Draft, error) {
	if _, ok, err := s.BrandOwner(ctx, profileID); err != nil || !ok {
		if err != nil {
			return Draft{}, err
		}
		return Draft{}, ErrNotFound
	}
	card, err := s.startingCard(ctx, profileID)
	if err != nil {
		return Draft{}, err
	}
	raw, _ := json.Marshal(card)
	return s.CreateDraft(ctx, DraftInput{ProfileID: profileID, Kind: kind, Doc: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`), Design: raw})
}

func inputOf(d Draft) DraftInput {
	return DraftInput{ProfileID: d.ProfileID, Kind: d.Kind, Doc: d.Doc, Hashtags: d.Hashtags, AltText: d.AltText, UnicodeStyles: d.UnicodeStyles, Title: d.Title, Design: d.Design}
}

// PatchDraft changes the named fields of a draft and leaves the rest as they are.
func (s *Studio) PatchDraft(ctx context.Context, id string, p DraftPatch) (Draft, Effects, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	cur, err := s.GetDraft(ctx, id)
	if err != nil {
		return cur, Effects{}, err
	}
	if cur.Status == StatusScheduled {
		return cur, Effects{}, fmt.Errorf("%w: a post is waiting to be sent from this draft; cancel it before editing", ErrConflict)
	}
	if p.Revision != 0 && p.Revision != cur.Revision {
		return cur, Effects{}, ErrStale
	}
	in := inputOf(cur)
	if p.Body != nil {
		if p.Revision == 0 {
			return cur, Effects{}, invalid("give the revision you read when you change the text")
		}
		if hasPictures(cur.Doc) {
			return cur, Effects{}, fmt.Errorf("%w: this article has pictures, which rewriting its text would lose", ErrConflict)
		}
		if err := cleanText(*p.Body, maxAssistantBody); err != nil {
			return cur, Effects{}, err
		}
		if cur.Kind == KindPost && utf8.RuneCountInString(*p.Body) > maxBodyChars {
			return cur, Effects{}, invalid("a post is limited to %d characters", maxBodyChars)
		}
		in.Doc = DocFromText(*p.Body, cur.Kind)
		// the text as it was can be brought back from History, whatever the ten minutes between automatic versions
		if err := snapshotDraft(ctx, s.db, id, VersionManual, "before an assistant change"); err != nil {
			return cur, Effects{}, err
		}
	}
	if p.Title != nil {
		in.Title = *p.Title
	}
	if p.Hashtags != nil {
		in.Hashtags = *p.Hashtags
	}
	if p.AltText != nil {
		in.AltText = *p.AltText
	}
	if p.UnicodeStyles != nil {
		in.UnicodeStyles = *p.UnicodeStyles
	}
	// the summary and address belong to the public page; they are checked here and stored beside the rest
	slug, summary := cur.Slug, cur.Summary
	if p.Slug != nil {
		if slug = strings.TrimSpace(*p.Slug); slug != "" && !assistantSlug.MatchString(slug) {
			return cur, Effects{}, invalid("an address is lower-case letters, digits and single hyphens, up to 80 characters")
		}
		var other int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM drafts WHERE kind = ? AND slug = ? AND slug <> '' AND id <> ?`, cur.Kind, slug, id).Scan(&other); err != nil {
			return cur, Effects{}, err
		}
		if other > 0 {
			return cur, Effects{}, fmt.Errorf("%w: that address is already used", ErrConflict)
		}
	}
	if p.Summary != nil {
		if summary = strings.TrimSpace(*p.Summary); utf8.RuneCountInString(summary) > maxAssistantSummary {
			return cur, Effects{}, invalid("a summary is limited to %d characters", maxAssistantSummary)
		}
	}
	d, err := s.updateDraft(ctx, id, in)
	if err != nil {
		return d, Effects{}, err
	}
	if slug != cur.Slug || summary != cur.Summary {
		if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET slug = ?, summary = ?, revision = revision + 1, status = CASE WHEN status = 'scheduled' THEN status ELSE 'draft' END, approved_at = '', approved_by = '', page_at = '', cover = NULL, updated_at = ? WHERE id = ?`,
			slug, summary, s.draftStamp(), id); err != nil {
			return d, Effects{}, err
		}
		if d, err = s.GetDraft(ctx, id); err != nil {
			return d, Effects{}, err
		}
		s.changed(d)
	}
	return d, effects(cur, d), nil
}

// PatchCardText changes words on a draft's card, and nothing about how it looks.
func (s *Studio) PatchCardText(ctx context.Context, id string, t CardText) (CardDesign, Draft, Effects, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	card, cur, err := s.Card(ctx, id)
	if err != nil {
		return card, cur, Effects{}, err
	}
	for _, f := range []struct {
		to   *string
		from *string
	}{{&card.Eyebrow, t.Eyebrow}, {&card.Title, t.Title}, {&card.Subtitle, t.Subtitle}, {&card.Footer, t.Footer},
		{&card.FooterLeft, t.FooterLeft}, {&card.Tag, t.Tag}, {&card.QuoteAuthor, t.QuoteAuthor}, {&card.StatValue, t.StatValue}} {
		if f.from == nil {
			continue
		}
		if err := cleanText(*f.from, 1000); err != nil {
			return card, cur, Effects{}, err
		}
		*f.to = *f.from
	}
	raw, err := json.Marshal(card)
	if err != nil {
		return card, cur, Effects{}, err
	}
	in := inputOf(cur)
	in.Design = raw
	d, err := s.updateDraft(ctx, id, in)
	if err != nil {
		return card, d, Effects{}, err
	}
	// as in the studio, the brand's starting card follows the latest one
	if _, err := s.db.ExecContext(ctx, `INSERT INTO designs (profile_id, data, updated_at) VALUES (?, ?, ?)
		ON CONFLICT (profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, d.ProfileID, string(raw), s.stamp()); err != nil {
		return card, d, Effects{}, err
	}
	return card, d, effects(cur, d), nil
}

const (
	maxAssistantBody    = 100_000
	maxAssistantSummary = 300
)

var assistantSlug = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

/* ------------------------------------------------------------------ text to document */

type node struct {
	Type    string         `json:"type"`
	Attrs   map[string]any `json:"attrs,omitempty"`
	Text    string         `json:"text,omitempty"`
	Content []node         `json:"content,omitempty"`
}

var (
	reBullet  = regexp.MustCompile(`^\s*[-•*]\s+(.*)$`)
	reNumber  = regexp.MustCompile(`^\s*\d+[.)]\s+(.*)$`)
	reHeading = regexp.MustCompile(`^\s{0,3}(#{1,6})\s+(.*)$`)
)

// DocFromText turns plain text into the editor's document, as the web app does with an agent's proposal: paragraphs
// separated by blank lines, "- " bullets, "1." numbered lines and, in an article, "## " headings.
func DocFromText(body, kind string) json.RawMessage {
	var out []node
	var para []string
	var list *node
	paragraph := func(lines []string) node {
		p := node{Type: "paragraph"}
		for i, l := range lines {
			if i > 0 {
				p.Content = append(p.Content, node{Type: "hardBreak"})
			}
			if l != "" {
				p.Content = append(p.Content, node{Type: "text", Text: l})
			}
		}
		return p
	}
	flushPara := func() {
		if len(para) > 0 {
			out = append(out, paragraph(para))
			para = nil
		}
	}
	flushList := func() {
		if list != nil {
			out = append(out, *list)
			list = nil
		}
	}
	for _, raw := range strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n") {
		line := strings.TrimRightFunc(raw, unicode.IsSpace)
		if strings.TrimSpace(line) == "" {
			flushPara()
			flushList()
			continue
		}
		if h := reHeading.FindStringSubmatch(line); h != nil {
			flushPara()
			flushList()
			text := strings.TrimSpace(h[2])
			if kind == KindArticle {
				level := 2
				if len(h[1]) > 2 {
					level = 3
				}
				out = append(out, node{Type: "heading", Attrs: map[string]any{"level": level}, Content: []node{{Type: "text", Text: text}}})
			} else {
				out = append(out, paragraph([]string{text}))
			}
			continue
		}
		bullet, number := reBullet.FindStringSubmatch(line), reNumber.FindStringSubmatch(line)
		if bullet != nil || number != nil {
			flushPara()
			t, text := "bulletList", ""
			if bullet != nil {
				text = bullet[1]
			} else {
				t, text = "orderedList", number[1]
			}
			if list != nil && list.Type != t {
				flushList()
			}
			if list == nil {
				list = &node{Type: t}
				if t == "orderedList" {
					list.Attrs = map[string]any{"start": 1}
				}
			}
			list.Content = append(list.Content, node{Type: "listItem", Content: []node{paragraph([]string{strings.TrimSpace(text)})}})
			continue
		}
		flushList()
		para = append(para, strings.TrimSpace(line))
	}
	flushPara()
	flushList()
	if len(out) == 0 {
		out = []node{{Type: "paragraph"}}
	}
	b, _ := json.Marshal(node{Type: "doc", Content: out})
	return b
}

// hasPictures reports whether a document holds an image anywhere.
func hasPictures(doc json.RawMessage) bool {
	var n node
	if json.Unmarshal(doc, &n) != nil {
		return false
	}
	var walk func(node) bool
	walk = func(x node) bool {
		if x.Type == "image" {
			return true
		}
		for _, c := range x.Content {
			if walk(c) {
				return true
			}
		}
		return false
	}
	return walk(n)
}

// HasPictures reports whether an article holds pictures, which an assistant must not rewrite away.
func HasPictures(doc json.RawMessage) bool { return hasPictures(doc) }

/* ------------------------------------------------------------------ notes about a brand */

const (
	maxMemories     = 50
	maxMemoryLength = 2000
)

var memoryKey = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,59}$`)

// Memory is one note about a brand.
type Memory struct {
	Key       string `json:"key"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt"`
}

// ListMemories returns a brand's notes by key.
func (s *Studio) ListMemories(ctx context.Context, profileID string) ([]Memory, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT key, content, updated_at FROM agent_memories WHERE profile_id = ? ORDER BY key`, profileID)
	if err != nil {
		return nil, err
	}
	out := []Memory{}
	for rows.Next() {
		var m Memory
		if err := rows.Scan(&m.Key, &m.Content, &m.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, m)
	}
	return out, closeRows(rows)
}

// SaveMemory adds a note or replaces the one with the same key.
func (s *Studio) SaveMemory(ctx context.Context, profileID, key, content string) (Memory, error) {
	content = strings.TrimSpace(content)
	if !memoryKey.MatchString(key) {
		return Memory{}, invalid("a note's key is a short name in lower-case letters, digits and hyphens")
	}
	if content == "" || utf8.RuneCountInString(content) > maxMemoryLength {
		return Memory{}, invalid("a note is between 1 and %d characters", maxMemoryLength)
	}
	if err := cleanText(content, maxMemoryLength); err != nil {
		return Memory{}, err
	}
	if _, ok, err := s.BrandOwner(ctx, profileID); err != nil || !ok {
		if err != nil {
			return Memory{}, err
		}
		return Memory{}, ErrNotFound
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_memories WHERE profile_id = ? AND key <> ?`, profileID, key).Scan(&n); err != nil {
		return Memory{}, err
	}
	if n >= maxMemories {
		return Memory{}, fmt.Errorf("%w: a brand keeps at most %d notes; remove one first", ErrConflict, maxMemories)
	}
	at := s.stamp()
	_, err := s.db.ExecContext(ctx, `INSERT INTO agent_memories (profile_id, key, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (profile_id, key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`, profileID, key, content, actorID(ctx), at, at)
	return Memory{Key: key, Content: content, UpdatedAt: at}, err
}

// DeleteMemory removes a note.
func (s *Studio) DeleteMemory(ctx context.Context, profileID, key string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM agent_memories WHERE profile_id = ? AND key = ?`, profileID, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
