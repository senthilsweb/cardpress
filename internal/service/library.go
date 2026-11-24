package service

import (
	"context"
	"database/sql"
	"encoding/json"
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
	Status    string `json:"status"` // a job's status, or "draft"
	Title     string `json:"title"`
	Excerpt   string `json:"excerpt"`
	// At is when the row happened: posted, else scheduled for, else created (a job); last edited (a draft).
	At      string `json:"at"`
	PostURL string `json:"postUrl,omitempty"`
	DraftID string `json:"draftId,omitempty"`
}

// LibraryQuery says what to list.
type LibraryQuery struct {
	ProfileID string // one brand, unless All
	All       bool
	Kind      string // "", "post" or "article"
	Status    string // "", a job status, or "draft"
	Q         string // text to look for, any case
	Before    string // the cursor of the last row already seen
	Limit     int
}

// LibraryPage is one page of the list. Next is empty when there is no more.
type LibraryPage struct {
	Items []LibraryItem `json:"items"`
	Next  string        `json:"next,omitempty"`
}

const (
	libraryDefaultLimit = 30
	libraryMaxLimit     = 100
	titleChars          = 80
	excerptChars        = 160
)

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
	limit := q.Limit
	if limit <= 0 {
		limit = libraryDefaultLimit
	}
	if limit > libraryMaxLimit {
		limit = libraryMaxLimit
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
	if q.Before != "" {
		at, id, _ := strings.Cut(q.Before, "|")
		i := sort.Search(len(kept), func(i int) bool { // the first row strictly after the cursor
			it := kept[i].item
			return it.At < at || (it.At == at && it.ID < id)
		})
		kept = kept[i:]
	}
	page := LibraryPage{Items: []LibraryItem{}}
	for i, r := range kept {
		if i == limit {
			last := page.Items[len(page.Items)-1]
			page.Next = last.At + "|" + last.ID
			break
		}
		page.Items = append(page.Items, r.item)
	}
	return page, nil
}

func (l *Library) jobRows(ctx context.Context, q LibraryQuery) ([]row, error) {
	query := `SELECT id, profile_id, draft_id, status, body, hashtags, scheduled_at, post_url, created_at, published_at FROM publish_jobs`
	var args []any
	if !q.All {
		query += ` WHERE profile_id = ?`
		args = append(args, q.ProfileID)
	}
	rs, err := l.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	var out []row
	for rs.Next() {
		var id, pid, draft, status, body, tags, postURL, created, published string
		var sched sql.NullString
		if err := rs.Scan(&id, &pid, &draft, &status, &body, &tags, &sched, &postURL, &created, &published); err != nil {
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
			item: LibraryItem{Type: "job", ID: id, ProfileID: pid, Kind: "post", Status: status, Title: title, Excerpt: excerpt, At: at, PostURL: postURL, DraftID: draft},
			text: strings.ToLower(body + " " + strings.Join(hs, " ")),
		})
	}
	return out, rs.Err()
}

func (l *Library) draftRows(ctx context.Context, q LibraryQuery) ([]row, error) {
	// a draft that became a post is listed once, as the post
	query := `SELECT id, profile_id, kind, doc, hashtags, updated_at FROM drafts d
	          WHERE NOT EXISTS (SELECT 1 FROM publish_jobs j WHERE j.draft_id = d.id)`
	var args []any
	if !q.All {
		query += ` AND profile_id = ?`
		args = append(args, q.ProfileID)
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
		var id, pid, kind, doc, tags, updated string
		if err := rs.Scan(&id, &pid, &kind, &doc, &tags, &updated); err != nil {
			return nil, err
		}
		blocks := docBlocks(doc)
		title, excerpt := titleAndExcerpt(blocks)
		if title == "" && excerpt == "" {
			continue // nothing written yet
		}
		var hs []string
		_ = json.Unmarshal([]byte(tags), &hs)
		out = append(out, row{
			item: LibraryItem{Type: "draft", ID: id, ProfileID: pid, Kind: kind, Status: "draft", Title: title, Excerpt: excerpt, At: updated, DraftID: id},
			text: strings.ToLower(strings.Join(blocks, " ") + " " + strings.Join(hs, " ")),
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
