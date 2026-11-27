package service

import (
	"context"
	"sort"
	"strings"
	"time"
)

// The dashboard counts what a brand holds and what its assistant has cost, from what is already stored. Items are
// counted as the Library lists them, so a figure and the list behind it agree.

// Counts are one kind's items by where they stand. A post that became a publishing job is counted once, as the job.
type Counts struct {
	Total    int `json:"total"`
	Draft    int `json:"draft"`
	Approved int `json:"approved"`
	// Scheduled are posts waiting or being sent; Published posts that went out; Attention posts that failed, were
	// missed or need checking on the network.
	Scheduled int `json:"scheduled"`
	Published int `json:"published"`
	Attention int `json:"attention"`
	// Pages are items with a live public page.
	Pages int `json:"pages"`
}

// DashboardItem is an item that is coming up, or was edited lately.
type DashboardItem struct {
	Type      string `json:"type"` // "job" or "draft"
	ID        string `json:"id"`
	DraftID   string `json:"draftId,omitempty"`
	ProfileID string `json:"profileId"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	Title     string `json:"title"`
	At        string `json:"at"`
}

// Spend is what the assistant cost in one day or week.
type Spend struct {
	Start     string `json:"start"` // the day, or the Monday of the week, as YYYY-MM-DD in the person's time zone
	CostCents int    `json:"costCents"`
	Replies   int    `json:"replies"`
}

// SessionSpend is what one assistant session cost in the period.
type SessionSpend struct {
	ConversationID string  `json:"conversationId"`
	ProfileID      string  `json:"profileId"`
	Title          string  `json:"title"`
	CostCents      int     `json:"costCents"`
	Replies        int     `json:"replies"`
	ActiveSeconds  float64 `json:"activeSeconds"`
	LastAt         string  `json:"lastAt"`
}

// Usage is the assistant's cost and work in the period. Cost is the list price the agent service reports.
type Usage struct {
	CostCents     int            `json:"costCents"`
	Sessions      int            `json:"sessions"`
	Replies       int            `json:"replies"`
	ActiveSeconds float64        `json:"activeSeconds"`
	Bucket        string         `json:"bucket"` // "day" or "week"
	Series        []Spend        `json:"series"`
	Largest       []SessionSpend `json:"largest"`
}

// BrandSummary is one brand's line.
type BrandSummary struct {
	ID        string `json:"id"`
	Posts     Counts `json:"posts"`
	Articles  Counts `json:"articles"`
	CostCents int    `json:"costCents"`
	Sessions  int    `json:"sessions"`
}

// Dashboard is the page's figures.
type Dashboard struct {
	Brands   []BrandSummary  `json:"brands"`
	Posts    Counts          `json:"posts"`
	Articles Counts          `json:"articles"`
	Next     []DashboardItem `json:"next"`
	Recent   []DashboardItem `json:"recent"`
	Usage    Usage           `json:"usage"`
}

// DashboardQuery says whose figures and for how long. Counts are as of now; usage is of the last Days days (0: all).
type DashboardQuery struct {
	ProfileID string
	All       bool
	Days      int
	Zone      string // an IANA time zone, in which days and weeks are counted; empty is UTC
}

const dashboardList = 5

// Dashboard gives the figures of one brand, or of every brand the person may see that is not archived.
func (l *Library) Dashboard(ctx context.Context, q DashboardQuery, now time.Time) (Dashboard, error) {
	out := Dashboard{Brands: []BrandSummary{}, Next: []DashboardItem{}, Recent: []DashboardItem{}}
	if !q.All && q.ProfileID == "" {
		return out, invalid("a profile id is required")
	}
	if q.Days != 0 && q.Days != 7 && q.Days != 30 && q.Days != 90 {
		return out, invalid("days must be 7, 30, 90 or 0 for all")
	}
	zone := time.UTC
	if q.Zone != "" {
		z, err := time.LoadLocation(q.Zone)
		if err != nil || q.Zone == "Local" {
			return out, invalid("that is not a time zone")
		}
		zone = z
	}
	var ids []string
	if q.All {
		where, args := l.scope(ctx, "", true, "id")
		rs, err := l.db.QueryContext(ctx, `SELECT id FROM profiles WHERE archived_at IS NULL`+where+` ORDER BY position, id`, args...)
		if err != nil {
			return out, err
		}
		for rs.Next() {
			var id string
			if err := rs.Scan(&id); err != nil {
				rs.Close()
				return out, err
			}
			ids = append(ids, id)
		}
		if err := closeRows(rs); err != nil {
			return out, err
		}
	} else {
		if err := brandNotHidden(ctx, l.db, q.ProfileID); err != nil {
			return out, err
		}
		ids = []string{q.ProfileID}
	}

	for _, id := range ids {
		sum := BrandSummary{ID: id}
		one := LibraryQuery{ProfileID: id}
		jobs, err := l.jobRows(ctx, one)
		if err != nil {
			return out, err
		}
		drafts, err := l.draftRows(ctx, one)
		if err != nil {
			return out, err
		}
		for _, r := range append(jobs, drafts...) {
			it := r.item
			if it.Status == JobCancelled {
				continue
			}
			c := &sum.Posts
			if it.Kind == KindArticle {
				c = &sum.Articles
			}
			c.Total++
			switch it.Status {
			case StatusDraft:
				c.Draft++
			case StatusApproved:
				c.Approved++
			case JobScheduled, JobPublishing:
				c.Scheduled++
			case JobPublished:
				c.Published++
			case JobFailed, JobMissed, JobNeedsReview:
				c.Attention++
			}
			if it.PageAt != "" {
				c.Pages++
			}
			item := DashboardItem{Type: it.Type, ID: it.ID, DraftID: it.DraftID, ProfileID: id, Kind: it.Kind, Status: it.Status, Title: it.Title, At: it.At}
			if due, ok := comingUp(it, now); ok {
				next := item
				next.At = due
				out.Next = append(out.Next, next)
			}
			if it.Type == "draft" {
				out.Recent = append(out.Recent, item)
			}
		}
		add(&out.Posts, sum.Posts)
		add(&out.Articles, sum.Articles)
		out.Brands = append(out.Brands, sum)
	}
	sort.SliceStable(out.Next, func(i, j int) bool { return out.Next[i].At < out.Next[j].At })
	sort.SliceStable(out.Recent, func(i, j int) bool { return out.Recent[i].At > out.Recent[j].At })
	out.Next = out.Next[:min(len(out.Next), dashboardList)]
	out.Recent = out.Recent[:min(len(out.Recent), dashboardList)]
	return out, l.usage(ctx, &out, ids, q.Days, zone, now)
}

// comingUp is when an item is due, for a post waiting to be sent or an approved article with a planned date ahead.
func comingUp(it LibraryItem, now time.Time) (string, bool) {
	at := ""
	switch {
	case it.Type == "job" && it.Status == JobScheduled:
		at = it.At
	case it.Type == "draft" && it.Kind == KindArticle && it.Status == StatusApproved:
		at = it.PlannedAt
	}
	t, err := time.Parse(time.RFC3339, at)
	if err != nil || t.Before(now) {
		return "", false
	}
	return t.UTC().Format(time.RFC3339), true
}

func add(to *Counts, c Counts) {
	to.Total += c.Total
	to.Draft += c.Draft
	to.Approved += c.Approved
	to.Scheduled += c.Scheduled
	to.Published += c.Published
	to.Attention += c.Attention
	to.Pages += c.Pages
}

// day is the start of t's day in the zone; week the Monday that starts its week.
func day(t time.Time, zone *time.Location) time.Time {
	y, m, d := t.In(zone).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, zone)
}

func week(t time.Time, zone *time.Location) time.Time {
	d := day(t, zone)
	return d.AddDate(0, 0, -(int(d.Weekday())+6)%7)
}

// usage fills in cost and sessions from chat_usage: one row for each reply, holding what that reply added to its
// session's cost, and the session's working time so far.
func (l *Library) usage(ctx context.Context, out *Dashboard, ids []string, days int, zone *time.Location, now time.Time) error {
	u := &out.Usage
	u.Bucket, u.Series, u.Largest = "day", []Spend{}, []SessionSpend{}
	if days == 0 || days > 31 {
		u.Bucket = "week"
	}
	start := day
	if u.Bucket == "week" {
		start = week
	}
	var since time.Time // zero: everything
	if days > 0 {
		since = day(now, zone).AddDate(0, 0, -(days - 1))
	}
	if len(ids) == 0 {
		return nil
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rs, err := l.db.QueryContext(ctx, `SELECT c.profile_id, c.id, c.title, u.session_id, u.added_cents, u.active_seconds, u.created_at
		FROM chat_usage u JOIN conversations c ON c.id = u.conversation_id
		WHERE c.profile_id IN (`+strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")+`) ORDER BY u.created_at, u.rowid`, args...)
	if err != nil {
		return err
	}
	defer rs.Close()
	type session struct {
		SessionSpend
		before, upTo float64 // working time before the period, and by its end
	}
	sessions, before := map[string]*session{}, map[string]float64{}
	var order []string
	spend := map[string]*Spend{}
	brandCost, brandSessions := map[string]int{}, map[string]map[string]bool{}
	first := time.Time{}
	for rs.Next() {
		var pid, conv, title, sid, created string
		var cents int
		var seconds float64
		if err := rs.Scan(&pid, &conv, &title, &sid, &cents, &seconds, &created); err != nil {
			return err
		}
		at, err := time.Parse(time.RFC3339, created)
		if err != nil {
			continue
		}
		key := conv + " " + sid
		if at.Before(since) {
			before[key] = max(before[key], seconds)
			continue
		}
		s := sessions[key]
		if s == nil {
			s = &session{SessionSpend: SessionSpend{ConversationID: conv, ProfileID: pid, Title: title}, before: before[key]}
			sessions[key] = s
			order = append(order, key)
		}
		s.CostCents += cents
		s.Replies++
		s.upTo = max(s.upTo, seconds)
		s.LastAt = at.UTC().Format(time.RFC3339)
		u.CostCents += cents
		u.Replies++
		brandCost[pid] += cents
		if brandSessions[pid] == nil {
			brandSessions[pid] = map[string]bool{}
		}
		brandSessions[pid][key] = true
		if first.IsZero() || at.Before(first) {
			first = at
		}
		b := start(at, zone).Format(time.DateOnly)
		if spend[b] == nil {
			spend[b] = &Spend{Start: b}
		}
		spend[b].CostCents += cents
		spend[b].Replies++
	}
	if err := rs.Err(); err != nil {
		return err
	}
	for _, key := range order {
		s := sessions[key]
		s.ActiveSeconds = max(0, s.upTo-s.before)
		u.ActiveSeconds += s.ActiveSeconds
		u.Largest = append(u.Largest, s.SessionSpend)
	}
	u.Sessions = len(order)
	sort.SliceStable(u.Largest, func(i, j int) bool {
		if u.Largest[i].CostCents != u.Largest[j].CostCents {
			return u.Largest[i].CostCents > u.Largest[j].CostCents
		}
		return u.Largest[i].LastAt > u.Largest[j].LastAt
	})
	u.Largest = u.Largest[:min(len(u.Largest), dashboardList)]
	for i := range out.Brands {
		id := out.Brands[i].ID
		out.Brands[i].CostCents, out.Brands[i].Sessions = brandCost[id], len(brandSessions[id])
	}
	// every day or week of the period, empty ones too, so the chart shows time as it passed
	if days == 0 {
		if first.IsZero() {
			return nil
		}
		since = first
	}
	step := 1
	if u.Bucket == "week" {
		step = 7
	}
	for d, last := start(since, zone), start(now, zone); !d.After(last); d = d.AddDate(0, 0, step) {
		k := d.Format(time.DateOnly)
		if spend[k] == nil {
			u.Series = append(u.Series, Spend{Start: k})
		} else {
			u.Series = append(u.Series, *spend[k])
		}
	}
	return nil
}
