package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	maxSummary  = 300
	maxSlugLen  = 80
	maxCoverPNG = 3 << 20
)

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Slugify makes an address-safe name from a title: lower case, accents folded, words joined by hyphens. A title with no
// letters or digits to keep (a different alphabet, say) gives "", and the caller picks another name.
func Slugify(title string) string {
	var b strings.Builder
	dash := true
	for _, r := range norm.NFKD.String(strings.ToLower(title)) {
		switch {
		case unicode.Is(unicode.Mn, r): // an accent folded off its letter
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			dash = false
		default:
			if !dash {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > maxSlugLen {
		out = strings.Trim(out[:maxSlugLen], "-")
	}
	return out
}

// PageInput is what a person gives when publishing a page. Everything is optional.
type PageInput struct {
	Slug    string // empty: made from the title (or the first line of a post), or kept if the page had one
	Summary string // empty: made from the start of the text
	Cover   []byte // the card as a PNG; empty keeps the one already saved
}

// pageTitle is the heading of an item's page: its own title, else the first line of its text.
func pageTitle(d Draft) string {
	if t := squash(d.Title); t != "" {
		return t
	}
	t, _ := titleAndExcerpt(docBlocks(string(d.Doc)))
	return t
}

func isPNG(b []byte) bool { return bytes.HasPrefix(b, pngSignature) }

// PublishPage puts an approved item on the public web. The page shows the approved text, so only an approved item can have
// one, and any later change to the item takes the page down until it is approved and published again.
func (s *Studio) PublishPage(ctx context.Context, id string, in PageInput) (Draft, error) {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Status == StatusDraft {
		return Draft{}, fmt.Errorf("%w: approve this %s before publishing its page", ErrConflict, d.Kind)
	}
	summary := squash(in.Summary)
	if utf8.RuneCountInString(summary) > maxSummary {
		return Draft{}, invalid("the description is limited to %d characters", maxSummary)
	}
	if len(in.Cover) > 0 && (!isPNG(in.Cover) || len(in.Cover) > maxCoverPNG) {
		return Draft{}, invalid("the preview image must be a PNG of at most %d MB", maxCoverPNG>>20)
	}
	slug := strings.TrimSpace(in.Slug)
	switch {
	case slug != "":
		if len(slug) > maxSlugLen || !slugRe.MatchString(slug) {
			return Draft{}, invalid("the address may use lower-case letters, digits and single hyphens (up to %d characters)", maxSlugLen)
		}
	case d.Slug != "":
		slug = d.Slug
	default:
		slug = Slugify(pageTitle(d))
		if slug == "" {
			slug = d.Kind + "-" + id[:min(6, len(id))]
		}
	}
	if slug, err = s.freeSlug(ctx, d.Kind, slug, id, in.Slug != ""); err != nil {
		return Draft{}, err
	}
	cover := in.Cover
	if len(cover) == 0 && !d.HasCover {
		cover = s.postedCard(ctx, id) // a post that was sent already has its card
	}
	at := d.PageAt
	if at == "" {
		at = s.now().UTC().Format("2006-01-02T15:04:05Z")
	}
	if len(cover) > 0 {
		_, err = s.db.ExecContext(ctx, `UPDATE drafts SET slug = ?, summary = ?, page_at = ?, cover = ? WHERE id = ?`, slug, summary, at, cover, id)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE drafts SET slug = ?, summary = ?, page_at = ? WHERE id = ?`, slug, summary, at, id)
	}
	if err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// freeSlug returns slug, or slug-2, slug-3… when another item of the same kind has it. A name the person typed is refused
// rather than changed.
func (s *Studio) freeSlug(ctx context.Context, kind, slug, id string, asked bool) (string, error) {
	try := func(c string) (bool, error) {
		var other string
		err := s.db.QueryRowContext(ctx, `SELECT id FROM drafts WHERE kind = ? AND slug = ? AND id <> ?`, kind, c, id).Scan(&other)
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		return false, err
	}
	for n := 1; n <= 99; n++ {
		c := slug
		if n > 1 {
			c = fmt.Sprintf("%s-%d", strings.TrimRight(slug[:min(len(slug), maxSlugLen-4)], "-"), n)
		}
		free, err := try(c)
		if err != nil {
			return "", err
		}
		if free {
			return c, nil
		}
		if asked {
			return "", fmt.Errorf("%w: another %s already uses the address %q", ErrConflict, kind, slug)
		}
	}
	return "", fmt.Errorf("%w: no free address near %q", ErrConflict, slug)
}

// postedCard is the picture last sent to LinkedIn for a draft, if any.
func (s *Studio) postedCard(ctx context.Context, draftID string) []byte {
	var img []byte
	err := s.db.QueryRowContext(ctx, `SELECT image FROM publish_jobs WHERE draft_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1`, draftID).Scan(&img)
	if err != nil || !isPNG(img) || len(img) > maxCoverPNG {
		return nil
	}
	return img
}

// UnpublishPage takes a page down. Its address is kept for next time.
func (s *Studio) UnpublishPage(ctx context.Context, id string) (Draft, error) {
	if _, err := s.GetDraft(ctx, id); err != nil {
		return Draft{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET page_at = '' WHERE id = ?`, id); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

/* ------------------------------------------------------------------ the public side: read only, live pages only */

// Pages reads what the public pages show. It can only see items whose page is live and that are still approved.
type Pages struct{ db *sql.DB }

// NewPages returns the public reader over db.
func NewPages(db *sql.DB) *Pages { return &Pages{db: db} }

// Brand is who an item belongs to, as shown on its page.
type Brand struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Handle      string `json:"handle"`
	Website     string `json:"website"`
}

// PublicPage is one live page.
type PublicPage struct {
	ID          string
	Kind        string
	Slug        string
	Title       string
	Description string
	Doc         json.RawMessage
	Hashtags    []string
	AltText     string
	PageAt      string
	UpdatedAt   string
	HasCover    bool
	CoverW      int
	CoverH      int
	Brand       Brand
}

const liveWhere = `page_at <> '' AND slug <> '' AND status IN ('approved', 'scheduled', 'published')`

func (p *Pages) brand(ctx context.Context, profileID string) Brand {
	var data string
	_ = p.db.QueryRowContext(ctx, `SELECT data FROM profiles WHERE id = ?`, profileID).Scan(&data)
	var b Brand
	_ = json.Unmarshal([]byte(data), &b)
	return b
}

// describe is the description for search and social previews: the one the person wrote, else the first paragraph of the
// text. A post has no title of its own (its title is its first line), so its description is what follows that line.
func describe(summary string, d Draft) string {
	if s := squash(summary); s != "" {
		return s
	}
	title, excerpt := titleAndExcerpt(docBlocks(string(d.Doc)))
	if squash(d.Title) == "" && excerpt != "" {
		return cut(excerpt, 200)
	}
	var root docNode
	if json.Unmarshal(d.Doc, &root) == nil {
		for _, n := range root.Content {
			if n.Type == "paragraph" {
				if t := squash(n.inline()); t != "" {
					return cut(t, 200)
				}
			}
		}
	}
	return cut(firstNonEmptyString(excerpt, title), 200)
}

func firstNonEmptyString(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

func coverSize(b []byte) (int, int) {
	if len(b) < 24 || !isPNG(b) {
		return 0, 0
	}
	return int(binary.BigEndian.Uint32(b[16:20])), int(binary.BigEndian.Uint32(b[20:24]))
}

// Get returns the live page of a kind and slug, or ErrNotFound.
func (p *Pages) Get(ctx context.Context, kind, slug string) (PublicPage, error) {
	if kind != KindArticle && kind != KindPost {
		return PublicPage{}, ErrNotFound
	}
	d, err := scanDraft(p.db.QueryRowContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE kind = ? AND slug = ? AND `+liveWhere, kind, slug))
	if errors.Is(err, sql.ErrNoRows) {
		return PublicPage{}, ErrNotFound
	}
	if err != nil {
		return PublicPage{}, err
	}
	pg := p.page(ctx, d)
	if d.HasCover {
		var head []byte
		if err := p.db.QueryRowContext(ctx, `SELECT substr(cover, 1, 24) FROM drafts WHERE id = ?`, d.ID).Scan(&head); err == nil {
			pg.CoverW, pg.CoverH = coverSize(head)
		}
	}
	return pg, nil
}

func (p *Pages) page(ctx context.Context, d Draft) PublicPage {
	return PublicPage{ID: d.ID, Kind: d.Kind, Slug: d.Slug, Title: pageTitle(d), Description: describe(d.Summary, d), Doc: d.Doc, Hashtags: d.Hashtags,
		AltText: d.AltText, PageAt: d.PageAt, UpdatedAt: d.UpdatedAt, HasCover: d.HasCover, Brand: p.brand(ctx, d.ProfileID)}
}

// Cover returns a live page's preview image and the time it was last changed.
func (p *Pages) Cover(ctx context.Context, kind, slug string) ([]byte, string, error) {
	var img []byte
	var updated string
	err := p.db.QueryRowContext(ctx, `SELECT cover, updated_at FROM drafts WHERE kind = ? AND slug = ? AND cover IS NOT NULL AND `+liveWhere, kind, slug).Scan(&img, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	return img, updated, err
}

// List returns one page of the live pages of a kind, newest first, and how many there are. Items carry no text.
func (p *Pages) List(ctx context.Context, kind string, page, size int) ([]PublicPage, int, error) {
	if size < 1 || size > 100 {
		size = 20
	}
	var total int
	if err := p.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM drafts WHERE kind = ? AND `+liveWhere, kind).Scan(&total); err != nil {
		return nil, 0, err
	}
	pages := max(1, (total+size-1)/size)
	page = min(max(page, 1), pages)
	rows, err := p.db.QueryContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE kind = ? AND `+liveWhere+` ORDER BY page_at DESC, rowid DESC LIMIT ? OFFSET ?`, kind, size, (page-1)*size)
	if err != nil {
		return nil, 0, err
	}
	var drafts []Draft
	for rows.Next() {
		d, err := scanDraft(rows)
		if err != nil {
			rows.Close()
			return nil, 0, err
		}
		drafts = append(drafts, d)
	}
	if err := closeRows(rows); err != nil {
		return nil, 0, err
	}
	out := make([]PublicPage, 0, len(drafts))
	for _, d := range drafts {
		out = append(out, p.page(ctx, d))
	}
	return out, total, nil
}

// Entry is one address for the sitemap.
type Entry struct{ Kind, Slug, UpdatedAt string }

// Entries lists every live page, newest first.
func (p *Pages) Entries(ctx context.Context) ([]Entry, error) {
	rows, err := p.db.QueryContext(ctx, `SELECT kind, slug, updated_at FROM drafts WHERE `+liveWhere+` ORDER BY page_at DESC, rowid DESC LIMIT 5000`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.Kind, &e.Slug, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
