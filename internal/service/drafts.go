package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

// ErrNotFound is returned when an id does not exist.
var ErrNotFound = errors.New("not found")

const (
	KindPost    = "post"
	KindArticle = "article"

	StatusDraft = "draft"

	maxDocBytesDraft = 2 << 20
	maxHashtags      = 30
	maxAltText       = 1000
	draftTimeLayout  = "2006-01-02T15:04:05.000Z"
)

var hashtagRe = regexp.MustCompile(`^[\p{L}\p{N}_]{1,100}$`)

// Draft is the content of one post or article.
type Draft struct {
	ID            string          `json:"id"`
	ProfileID     string          `json:"profileId"`
	Kind          string          `json:"kind"`
	Status        string          `json:"status"`
	Doc           json.RawMessage `json:"doc"` // rich-text document (TipTap/ProseMirror JSON)
	Hashtags      []string        `json:"hashtags"`
	AltText       string          `json:"altText"`
	UnicodeStyles bool            `json:"unicodeStyles"`
	CreatedAt     string          `json:"createdAt"`
	UpdatedAt     string          `json:"updatedAt"`
}

// DraftInput is what a caller may set. Status is controlled by the server.
type DraftInput struct {
	ProfileID     string          `json:"profileId"`
	Kind          string          `json:"kind"`
	Doc           json.RawMessage `json:"doc"`
	Hashtags      []string        `json:"hashtags"`
	AltText       string          `json:"altText"`
	UnicodeStyles bool            `json:"unicodeStyles"`
}

func (in *DraftInput) normalize() error {
	if in.ProfileID == "" {
		return invalid("profileId is required")
	}
	if in.Kind != KindPost && in.Kind != KindArticle {
		return invalid("kind must be %q or %q", KindPost, KindArticle)
	}
	if len(in.Doc) == 0 || len(in.Doc) > maxDocBytesDraft {
		return invalid("doc is required and must be under %d bytes", maxDocBytesDraft)
	}
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(in.Doc, &head); err != nil || head.Type != "doc" {
		return invalid(`doc must be a JSON object with "type": "doc"`)
	}
	if utf8.RuneCountInString(in.AltText) > maxAltText {
		return invalid("altText is limited to %d characters", maxAltText)
	}
	tags, err := normalizeHashtags(in.Hashtags)
	if err != nil {
		return err
	}
	in.Hashtags = tags
	return nil
}

// normalizeHashtags strips a leading #, drops duplicates (case-insensitive) and rejects anything that is not a word.
func normalizeHashtags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.TrimPrefix(strings.TrimSpace(t), "#")
		if !hashtagRe.MatchString(t) {
			return nil, invalid("%q is not a valid hashtag (letters, digits and underscores only)", t)
		}
		if k := strings.ToLower(t); !seen[k] {
			seen[k] = true
			out = append(out, t)
		}
	}
	if len(out) > maxHashtags {
		return nil, invalid("too many hashtags (max %d)", maxHashtags)
	}
	return out, nil
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Studio) draftStamp() string { return s.now().UTC().Format(draftTimeLayout) }

const draftCols = `id, profile_id, kind, status, doc, hashtags, alt_text, unicode_styles, created_at, updated_at`

type scanner interface{ Scan(...any) error }

func scanDraft(r scanner) (Draft, error) {
	var d Draft
	var doc, tags string
	var uni int
	if err := r.Scan(&d.ID, &d.ProfileID, &d.Kind, &d.Status, &doc, &tags, &d.AltText, &uni, &d.CreatedAt, &d.UpdatedAt); err != nil {
		return d, err
	}
	d.Doc = json.RawMessage(doc)
	d.UnicodeStyles = uni != 0
	if err := json.Unmarshal([]byte(tags), &d.Hashtags); err != nil || d.Hashtags == nil {
		d.Hashtags = []string{}
	}
	return d, nil
}

// CreateDraft stores a new draft.
func (s *Studio) CreateDraft(ctx context.Context, in DraftInput) (Draft, error) {
	if err := in.normalize(); err != nil {
		return Draft{}, err
	}
	tags, _ := json.Marshal(in.Hashtags)
	at := s.draftStamp()
	d := Draft{ID: newID(), ProfileID: in.ProfileID, Kind: in.Kind, Status: StatusDraft, Doc: in.Doc, Hashtags: in.Hashtags,
		AltText: in.AltText, UnicodeStyles: in.UnicodeStyles, CreatedAt: at, UpdatedAt: at}
	_, err := s.db.ExecContext(ctx, `INSERT INTO drafts (`+draftCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.ProfileID, d.Kind, d.Status, string(d.Doc), string(tags), d.AltText, boolInt(d.UnicodeStyles), at, at)
	return d, err
}

// UpdateDraft replaces a draft's content. Its profile and status do not change.
func (s *Studio) UpdateDraft(ctx context.Context, id string, in DraftInput) (Draft, error) {
	if err := in.normalize(); err != nil {
		return Draft{}, err
	}
	tags, _ := json.Marshal(in.Hashtags)
	res, err := s.db.ExecContext(ctx,
		`UPDATE drafts SET kind = ?, doc = ?, hashtags = ?, alt_text = ?, unicode_styles = ?, updated_at = ? WHERE id = ?`,
		in.Kind, string(in.Doc), string(tags), in.AltText, boolInt(in.UnicodeStyles), s.draftStamp(), id)
	if err != nil {
		return Draft{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Draft{}, ErrNotFound
	}
	return s.GetDraft(ctx, id)
}

// GetDraft returns one draft.
func (s *Studio) GetDraft(ctx context.Context, id string) (Draft, error) {
	d, err := scanDraft(s.db.QueryRowContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Draft{}, ErrNotFound
	}
	return d, err
}

// ListDrafts returns a profile's drafts, most recently changed first.
func (s *Studio) ListDrafts(ctx context.Context, profileID string) ([]Draft, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE profile_id = ? ORDER BY updated_at DESC, id`, profileID)
	if err != nil {
		return nil, err
	}
	out := []Draft{}
	for rows.Next() {
		d, err := scanDraft(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, d)
	}
	return out, closeRows(rows)
}

// DeleteDraft removes a draft.
func (s *Studio) DeleteDraft(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM drafts WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
