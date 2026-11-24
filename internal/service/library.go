package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"
)

// Library lists what a brand has written and posted: published, scheduled and failed posts together with the drafts that
// have not become a post, newest first. It reads only; nothing here sends or changes a post.
type Library struct{ db *sql.DB }

// NewLibrary returns the library over db.
func NewLibrary(db *sql.DB) *Library { return &Library{db: db} }

// LibraryItem is one row of the list.
type LibraryItem struct {
	Type      string `json:"type"` // "job" (a post sent or waiting to be) or "draft"
	ID        string `json:"id"`
	ProfileID string `json:"profileId"`
	Kind      string `json:"kind"`   // "post" or "article"
	Status    string `json:"status"` // a job's status, or the draft's: "draft" or "approved"
	Title     string `json:"title"`
	Excerpt   string `json:"excerpt"`
	// At is when the row happened: posted, else scheduled for, else created (a job); last edited (a draft).
	At      string `json:"at"`
	PostURL string `json:"postUrl,omitempty"`
	DraftID string `json:"draftId,omitempty"`
	// PlannedAt is an approved article's planned date (UTC), with the zone it was chosen in.
	PlannedAt string `json:"plannedAt,omitempty"`
	Timezone  string `json:"timezone,omitempty"`
	// Design is the card a draft was made with, so the list can draw a thumbnail. It is left out when it is large (it
	// carries pictures), and a posted item shows the image that was sent instead.
	Design json.RawMessage `json:"design,omitempty"`
	// Slug and PageAt say the item has a live public page at /articles/<slug> or /posts/<slug>.
	Slug   string `json:"slug,omitempty"`
	PageAt string `json:"pageAt,omitempty"`
}

// maxListedDesign is the largest design the list carries; a bigger one is fetched with the draft.
const maxListedDesign = 64 << 10

// LibraryQuery says what to list.
type LibraryQuery struct {
	ProfileID string // one brand, unless All
	All       bool
	Kind      string // "", "post" or "article"
	Status    string // "", a job status, or "draft"
	Q         string // text to look for, any case
	Page      int    // 1-based; 0 means the first
	PageSize  int    // 10, 20 or 50; 0 means the default
}

// LibraryPage is one page of the list, with where it sits in the whole.
type LibraryPage struct {
	Items    []LibraryItem `json:"items"`
	Total    int           `json:"total"`    // rows in the whole list (after the filters)
	Page     int           `json:"page"`     // the page returned (1-based, kept within range)
	PageSize int           `json:"pageSize"` //
	Pages    int           `json:"pages"`    // at least 1
}

const (
	libraryDefaultPageSize = 20
	titleChars             = 80
	excerptChars           = 160
)

// LibraryPageSizes are the page sizes a caller may ask for.
var LibraryPageSizes = []int{10, 20, 50}

type row struct {
	item LibraryItem
	text string // everything searchable, lower case
}

// List returns one page.
func (l *Library) List(ctx context.Context, q LibraryQuery) (LibraryPage, error) {
	if !q.All && q.ProfileID == "" {
		return LibraryPage{}, invalid("a profile id is required")
	}
	if q.Kind != "" && q.Kind != "post" && q.Kind != "article" {
		return LibraryPage{}, invalid("kind must be post or article")
	}
	if !q.All {
		if err := brandNotHidden(ctx, l.db, q.ProfileID); err != nil {
			return LibraryPage{}, err
		}
	}
	size := q.PageSize
	if size == 0 {
		size = libraryDefaultPageSize
	}
	if !slices.Contains(LibraryPageSizes, size) {
		return LibraryPage{}, invalid("pageSize must be 10, 20 or 50")
	}
	if q.Page < 0 {
		return LibraryPage{}, invalid("page must be 1 or more")
	}

	var rows []row
	if q.Kind != "article" { // an article is never sent from here, so it has no job
		jobs, err := l.jobRows(ctx, q)
		if err != nil {
			return LibraryPage{}, err
		}
		rows = append(rows, jobs...)
	}
	drafts, err := l.draftRows(ctx, q)
	if err != nil {
		return LibraryPage{}, err
	}
	rows = append(rows, drafts...)

	needle := strings.ToLower(strings.TrimSpace(q.Q))
	kept := rows[:0]
	for _, r := range rows {
		if q.Status != "" && r.item.Status != q.Status {
			continue
		}
		if needle != "" && !strings.Contains(r.text, needle) {
			continue
		}
		kept = append(kept, r)
	}
	sort.SliceStable(kept, func(i, j int) bool {
		a, b := kept[i].item, kept[j].item
		if a.At != b.At {
			return a.At > b.At
		}
		return a.ID > b.ID
	})
	pages := (len(kept) + size - 1) / size
	if pages == 0 {
		pages = 1
	}
	page := q.Page
	if page == 0 {
		page = 1
	}
	if page > pages {
		page = pages // a page past the end (after a delete, say) shows the last one
	}
	lo, hi := (page-1)*size, page*size
	if hi > len(kept) {
		hi = len(kept)
	}
	out := LibraryPage{Items: []LibraryItem{}, Total: len(kept), Page: page, PageSize: size, Pages: pages}
	for _, r := range kept[lo:hi] {
		out.Items = append(out.Items, r.item)
	}
	return out, nil
}

func (l *Library) jobRows(ctx context.Context, q LibraryQuery) ([]row, error) {
	query := `SELECT j.id, j.profile_id, j.draft_id, j.status, j.body, j.hashtags, j.scheduled_at, j.post_url, j.created_at, j.published_at,
	                 COALESCE(d.slug, ''), COALESCE(d.page_at, '')
	          FROM publish_jobs j LEFT JOIN drafts d ON d.id = j.draft_id`
	var args []any
	if !q.All {
		query += ` WHERE j.profile_id = ?`
		args = append(args, q.ProfileID)
	} else if p, ok := PrincipalFrom(ctx); ok && !p.Admin() { // everything, but only what is theirs
		query += ` WHERE j.profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)`
		args = append(args, p.UserID())
	}
	rs, err := l.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	var out []row
	for rs.Next() {
		var id, pid, draft, status, body, tags, postURL, created, published, slug, pageAt string
		var sched sql.NullString
		if err := rs.Scan(&id, &pid, &draft, &status, &body, &tags, &sched, &postURL, &created, &published, &slug, &pageAt); err != nil {
			return nil, err
		}
		at := created
		switch {
		case published != "":
			at = published
		case sched.String != "":
			at = sched.String
		}
		title, excerpt := titleAndExcerpt(strings.Split(strings.TrimSpace(body), "\n\n"))
		var hs []string
		_ = json.Unmarshal([]byte(tags), &hs)
		out = append(out, row{
			item: LibraryItem{Type: "job", ID: id, ProfileID: pid, Kind: "post", Status: status, Title: title, Excerpt: excerpt, At: at, PostURL: postURL, DraftID: draft, Slug: slug, PageAt: pageAt},
			text: strings.ToLower(body + " " + strings.Join(hs, " ")),
		})
	}
	return out, rs.Err()
}

func (l *Library) draftRows(ctx context.Context, q LibraryQuery) ([]row, error) {
	// a draft that became a post is listed once, as the post
	query := `SELECT id, profile_id, kind, status, title, doc, hashtags, updated_at, scheduled_at, timezone, design, design_version, slug, page_at FROM drafts d
	          WHERE NOT EXISTS (SELECT 1 FROM publish_jobs j WHERE j.draft_id = d.id)`
	var args []any
	if !q.All {
		query += ` AND profile_id = ?`
		args = append(args, q.ProfileID)
	} else if p, ok := PrincipalFrom(ctx); ok && !p.Admin() {
		query += ` AND profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)`
		args = append(args, p.UserID())
	}
	if q.Kind != "" {
		query += ` AND kind = ?`
		args = append(args, q.Kind)
	}
	rs, err := l.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	var out []row
	for rs.Next() {
		var id, pid, kind, status, own, doc, tags, updated, planned, zone, design, slug, pageAt string
		var designVersion int
		if err := rs.Scan(&id, &pid, &kind, &status, &own, &doc, &tags, &updated, &planned, &zone, &design, &designVersion, &slug, &pageAt); err != nil {
			return nil, err
		}
		blocks := docBlocks(doc)
		title, excerpt := titleAndExcerpt(blocks)
		if title == "" && excerpt == "" {
			continue // nothing written yet
		}
		searchable := strings.Join(blocks, " ") + " " + own // the whole text and the title, before anything is dropped for the excerpt
		if own = squash(own); own != "" {
			// a title the person wrote is used as it is; the text then starts the excerpt unless it only repeats the title
			if len(blocks) > 0 && squash(blocks[0]) == own {
				blocks = blocks[1:]
			}
			_, excerpt = titleAndExcerpt(append([]string{own}, blocks...))
			title = cut(own, titleChars)
		}
		var hs []string
		_ = json.Unmarshal([]byte(tags), &hs)
		out = append(out, row{
			item: LibraryItem{Type: "draft", ID: id, ProfileID: pid, Kind: kind, Status: status, Title: title, Excerpt: excerpt, At: updated, DraftID: id, PlannedAt: planned, Timezone: zone, Design: listedDesign(design, designVersion), Slug: slug, PageAt: pageAt},
			text: strings.ToLower(searchable + " " + strings.Join(hs, " ")),
		})
	}
	return out, rs.Err()
}

// titleAndExcerpt takes the first block as the title and the next ones as the excerpt. A post has no title of its own, so a
// long first paragraph is cut at a word and the rest of it becomes the excerpt.
func titleAndExcerpt(blocks []string) (string, string) {
	var clean []string
	for _, b := range blocks {
		if b = squash(b); b != "" {
			clean = append(clean, b)
		}
	}
	if len(clean) == 0 {
		return "", ""
	}
	title, rest := clean[0], strings.Join(clean[1:], " ")
	if rest == "" && utf8.RuneCountInString(title) > titleChars {
		// one long paragraph: its start is the title and the rest of it the excerpt
		t := cut(title, titleChars)
		rest = strings.TrimSpace(strings.TrimPrefix(title, strings.TrimSuffix(t, "…")))
		title = t
	} else {
		title = cut(title, titleChars)
	}
	return title, cut(rest, excerptChars)
}

// listedDesign is the design to put in a list row: none if there is none, or if it is too large to carry along.
func listedDesign(design string, version int) json.RawMessage {
	if version == 0 || len(design) > maxListedDesign {
		return nil
	}
	return json.RawMessage(design)
}

func squash(s string) string { return strings.Join(strings.Fields(s), " ") }

// cut shortens s to n characters at a word edge and marks the cut.
func cut(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)[:n]
	out := string(r)
	if i := strings.LastIndexByte(out, ' '); i > n/2 {
		out = out[:i]
	}
	return strings.TrimRight(out, " ,.;:") + "…"
}

// docBlocks returns the text of each top-level block of a saved document, headings without their # marks.
func docBlocks(raw string) []string {
	var root docNode
	if json.Unmarshal([]byte(raw), &root) != nil {
		return nil
	}
	out := root.blocks("")
	for i, b := range out {
		if strings.HasPrefix(b, "#") {
			out[i] = strings.TrimLeft(b, "# ")
		}
	}
	return out
}
