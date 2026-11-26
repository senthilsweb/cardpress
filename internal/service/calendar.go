package service

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

// CalendarEntry is one thing on the calendar: a post (sent, waiting or failed) or an article's planned date.
type CalendarEntry struct {
	Type      string `json:"type"` // "job" (a post) or "plan" (an article's planned date; nothing is sent)
	ID        string `json:"id"`   // the job's id, or the draft's for a plan
	DraftID   string `json:"draftId,omitempty"`
	ProfileID string `json:"profileId"`
	Kind      string `json:"kind"`   // "post" or "article"
	Status    string `json:"status"` // a job's status, or the draft's
	Title     string `json:"title"`
	// At is UTC: when a post went out, else when it is due; an article's planned date. Timezone is the zone it was
	// chosen in, so the item can also be shown in its own time.
	At       string `json:"at"`
	Timezone string `json:"timezone,omitempty"`
	PostURL  string `json:"postUrl,omitempty"`
}

// CalendarQuery says which brand and which stretch of time.
type CalendarQuery struct {
	ProfileID string
	All       bool
	From, To  time.Time // [From, To)
}

// maxCalendarSpan keeps one request to about a month and a half (a month view with the days around it).
const maxCalendarSpan = 45 * 24 * time.Hour

// Calendar lists the posts and planned articles between From and To, oldest first. Cancelled posts are left out.
func (l *Library) Calendar(ctx context.Context, q CalendarQuery) ([]CalendarEntry, error) {
	if !q.All && q.ProfileID == "" {
		return nil, invalid("a profile id is required")
	}
	if q.From.IsZero() || q.To.IsZero() || !q.To.After(q.From) {
		return nil, invalid("from and to must be times, from before to")
	}
	if q.To.Sub(q.From) > maxCalendarSpan {
		return nil, invalid("ask for at most 45 days at a time")
	}
	if !q.All {
		if err := brandNotHidden(ctx, l.db, q.ProfileID); err != nil {
			return nil, err
		}
	}
	where, args := l.scope(ctx, q.ProfileID, q.All, "j.profile_id")
	rs, err := l.db.QueryContext(ctx, `SELECT j.id, j.draft_id, j.profile_id, j.status, j.body, COALESCE(j.scheduled_at, ''), j.timezone, j.post_url, j.created_at, j.published_at
		FROM publish_jobs j WHERE j.status != ?`+where, append([]any{JobCancelled}, args...)...)
	if err != nil {
		return nil, err
	}
	var out []CalendarEntry
	in := func(at string) (string, bool) {
		t, err := time.Parse(time.RFC3339, at)
		if err != nil || t.Before(q.From) || !t.Before(q.To) {
			return "", false
		}
		return t.UTC().Format(time.RFC3339), true
	}
	for rs.Next() {
		var id, draft, pid, status, body, sched, zone, postURL, created, published string
		if err := rs.Scan(&id, &draft, &pid, &status, &body, &sched, &zone, &postURL, &created, &published); err != nil {
			rs.Close()
			return nil, err
		}
		at := created
		switch {
		case published != "":
			at = published
		case sched != "":
			at = sched
		}
		if at, ok := in(at); ok {
			title, _ := titleAndExcerpt(strings.Split(strings.TrimSpace(body), "\n\n"))
			out = append(out, CalendarEntry{Type: "job", ID: id, DraftID: draft, ProfileID: pid, Kind: "post", Status: status, Title: title, At: at, Timezone: zone, PostURL: postURL})
		}
	}
	rs.Close()
	if err := rs.Err(); err != nil {
		return nil, err
	}

	where, args = l.scope(ctx, q.ProfileID, q.All, "d.profile_id")
	rs, err = l.db.QueryContext(ctx, `SELECT d.id, d.profile_id, d.kind, d.status, d.title, d.doc, d.scheduled_at, d.timezone FROM drafts d
		WHERE d.kind = 'article' AND d.scheduled_at != ''`+where, args...)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	for rs.Next() {
		var id, pid, kind, status, own, doc, planned, zone string
		if err := rs.Scan(&id, &pid, &kind, &status, &own, &doc, &planned, &zone); err != nil {
			return nil, err
		}
		if at, ok := in(planned); ok {
			out = append(out, CalendarEntry{Type: "plan", ID: id, DraftID: id, ProfileID: pid, Kind: kind, Status: status, Title: draftTitle(own, doc), At: at, Timezone: zone})
		}
	}
	if err := rs.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At < out[j].At
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// ReadyItem is an approved post or article with no date yet: what can be put on the calendar.
type ReadyItem struct {
	ID        string          `json:"id"`
	ProfileID string          `json:"profileId"`
	Kind      string          `json:"kind"`
	Title     string          `json:"title"`
	UpdatedAt string          `json:"updatedAt"`
	Design    json.RawMessage `json:"design,omitempty"`
}

// Ready lists the approved items with no date: posts that were never sent or scheduled, and articles with no planned date.
func (l *Library) Ready(ctx context.Context, profileID string, all bool) ([]ReadyItem, error) {
	if !all && profileID == "" {
		return nil, invalid("a profile id is required")
	}
	if !all {
		if err := brandNotHidden(ctx, l.db, profileID); err != nil {
			return nil, err
		}
	}
	where, args := l.scope(ctx, profileID, all, "d.profile_id")
	rs, err := l.db.QueryContext(ctx, `SELECT d.id, d.profile_id, d.kind, d.title, d.doc, d.updated_at, d.design, d.design_version FROM drafts d
		WHERE d.status = ? AND d.scheduled_at = '' AND NOT EXISTS (SELECT 1 FROM publish_jobs j WHERE j.draft_id = d.id)`+where+`
		ORDER BY d.updated_at DESC LIMIT 100`, append([]any{StatusApproved}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	out := []ReadyItem{}
	for rs.Next() {
		var it ReadyItem
		var own, doc, design string
		var version int
		if err := rs.Scan(&it.ID, &it.ProfileID, &it.Kind, &own, &doc, &it.UpdatedAt, &design, &version); err != nil {
			return nil, err
		}
		it.Title, it.Design = draftTitle(own, doc), listedDesign(design, version)
		out = append(out, it)
	}
	return out, rs.Err()
}

// scope narrows a query to one brand, or to every brand the caller may see.
func (l *Library) scope(ctx context.Context, profileID string, all bool, col string) (string, []any) {
	if !all {
		return ` AND ` + col + ` = ?`, []any{profileID}
	}
	if p, ok := PrincipalFrom(ctx); ok && !p.Admin() {
		return ` AND ` + col + ` IN (SELECT id FROM profiles WHERE owner_id = ?)`, []any{p.UserID()}
	}
	return "", nil
}

// draftTitle is a draft's own title, else the start of its text.
func draftTitle(own, doc string) string {
	if own = squash(own); own != "" {
		return cut(own, titleChars)
	}
	title, _ := titleAndExcerpt(docBlocks(doc))
	return title
}
