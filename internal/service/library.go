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
	// CreatedBy and ApprovedBy are people's names (empty for work from before accounts); Version is the latest saved
	// version of the draft (0 when none was kept).
	CreatedBy  string `json:"createdBy,omitempty"`
	ApprovedBy string `json:"approvedBy,omitempty"`
	Version    int    `json:"version,omitempty"`
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
	Sort      string // "" or "at" (when), "title", "status", "kind", "brand"
	Order     string // "" or "desc" (newest, Z to A first), "asc"
	// CreatedFrom and CreatedTo (YYYY-MM-DD, together) keep the items created on those days of the Zone.
	CreatedFrom, CreatedTo, Zone string
}

// LibrarySorts are the columns the list can be sorted by.
var LibrarySorts = []string{"at", "title", "status", "kind", "brand"}

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
	// created is when the item was first written: a post that became a job counts from its draft.
	created string
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
	if q.Sort != "" && !slices.Contains(LibrarySorts, q.Sort) {
		return LibraryPage{}, invalid("sort must be one of at, title, status, kind, brand")
	}
	if q.Order != "" && q.Order != "asc" && q.Order != "desc" {
		return LibraryPage{}, invalid("order must be asc or desc")
	}

	zone, err := timeZone(q.Zone)
	if err != nil {
		return LibraryPage{}, err
	}
	created, err := dayRange(q.CreatedFrom, q.CreatedTo, zone)
	if err != nil {
		return LibraryPage{}, err
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
		if !created.Holds(r.created) {
			continue
		}
		if needle != "" && !strings.Contains(r.text, needle) {
			continue
		}
		kept = append(kept, r)
	}
	asc := q.Order == "asc"
	key := func(it LibraryItem) string {
		switch q.Sort {
		case "title":
			return strings.ToLower(it.Title)
		case "status":
			return it.Status
		case "kind":
			return it.Kind
		case "brand":
			return it.ProfileID
		}
		return it.At
	}
	sort.SliceStable(kept, func(i, j int) bool {
		a, b := kept[i].item, kept[j].item
		if ka, kb := key(a), key(b); ka != kb {
			return (ka < kb) == asc
		}
		if a.At != b.At { // then newest first, whatever the order
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
	                 COALESCE(d.slug, ''), COALESCE(d.page_at, ''), COALESCE(d.created_at, j.created_at), ` + namesAndVersion("j.created_by", "d.approved_by", "j.draft_id") + `
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
		var id, pid, draft, status, body, tags, postURL, created, published, slug, pageAt, first, by, approver string
		var sched sql.NullString
		var version int
		if err := rs.Scan(&id, &pid, &draft, &status, &body, &tags, &sched, &postURL, &created, &published, &slug, &pageAt, &first, &by, &approver, &version); err != nil {
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
			item: LibraryItem{Type: "job", ID: id, ProfileID: pid, Kind: "post", Status: status, Title: title, Excerpt: excerpt, At: at, PostURL: postURL, DraftID: draft, Slug: slug, PageAt: pageAt,
				CreatedBy: by, ApprovedBy: approver, Version: version},
			text:    strings.ToLower(body + " " + strings.Join(hs, " ")),
			created: first,
		})
	}
	return out, rs.Err()
}

func (l *Library) draftRows(ctx context.Context, q LibraryQuery) ([]row, error) {
	// a draft that became a post is listed once, as the post
	query := `SELECT id, profile_id, kind, status, title, doc, hashtags, updated_at, scheduled_at, timezone, design, design_version, slug, page_at, created_at,
	          ` + namesAndVersion("d.created_by", "d.approved_by", "d.id") + ` FROM drafts d
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
		var id, pid, kind, status, own, doc, tags, updated, planned, zone, design, slug, pageAt, first, by, approver string
		var designVersion, version int
		if err := rs.Scan(&id, &pid, &kind, &status, &own, &doc, &tags, &updated, &planned, &zone, &design, &designVersion, &slug, &pageAt, &first, &by, &approver, &version); err != nil {
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
			item: LibraryItem{Type: "draft", ID: id, ProfileID: pid, Kind: kind, Status: status, Title: title, Excerpt: excerpt, At: updated, DraftID: id, PlannedAt: planned, Timezone: zone, Design: listedDesign(design, designVersion), Slug: slug, PageAt: pageAt,
				CreatedBy: by, ApprovedBy: approver, Version: version},
			text:    strings.ToLower(searchable + " " + strings.Join(hs, " ")),
			created: first,
		})
	}
	return out, rs.Err()
}

// namesAndVersion selects who wrote and who approved an item, by name, and its latest version number.
func namesAndVersion(createdBy, approvedBy, draftID string) string {
	name := func(col string) string {
		return `COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = ` + col + `), '')`
	}
	return name(createdBy) + `, ` + name(approvedBy) + `, COALESCE((SELECT MAX(seq) FROM draft_versions v WHERE v.draft_id = ` + draftID + `), 0)`
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
