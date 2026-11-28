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

// Totals are the person's figures over everything they may open, whichever brand is in view.
type Totals struct {
	Brands int `json:"brands"` // without archived ones
	// Users are the active accounts and DisabledUsers the rest; told to an admin only.
	Users         *int `json:"users,omitempty"`
	DisabledUsers int  `json:"disabledUsers,omitempty"`
	CostCents     int  `json:"costCents"` // in the period
}

// Period is what the figures that follow time cover: days of the person's zone, or empty for all time.
type Period struct {
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
}

// Dashboard is the page's figures.
type Dashboard struct {
	Totals   Totals          `json:"totals"`
	Period   Period          `json:"period"`
	Brands   []BrandSummary  `json:"brands"`
	Posts    Counts          `json:"posts"`
	Articles Counts          `json:"articles"`
	Next     []DashboardItem `json:"next"`
	Recent   []DashboardItem `json:"recent"`
	Usage    Usage           `json:"usage"`
	// Budget is where the brand's monthly amount for the assistant stands, for one brand that has an amount.
	Budget *BudgetStatus `json:"budget,omitempty"`
}

// DashboardQuery says whose figures and for how long: the last Days days (0: all), or From to To. Items are counted by
// the day they were created, with their status as it is now; Next and Recent do not follow the period.
type DashboardQuery struct {
	ProfileID string
	All       bool
	Days      int
	From, To  string // YYYY-MM-DD, together, instead of Days
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
	zone, err := timeZone(q.Zone)
	if err != nil {
		return out, err
	}
	period, err := dayRange(q.From, q.To, zone)
	if err != nil {
		return out, err
	}
	today := day(now, zone)
	switch {
	case q.From != "":
		if q.Days != 0 {
			return out, invalid("give days or a first and last day, not both")
		}
		out.Period = Period{From: q.From, To: q.To}
	case q.Days > 0:
		period = Days{From: today.AddDate(0, 0, -(q.Days - 1)), Until: today.AddDate(0, 0, 1)}
		out.Period = Period{From: period.From.Format(time.DateOnly), To: today.Format(time.DateOnly)}
	}
	every, err := l.openBrands(ctx)
	if err != nil {
		return out, err
	}
	ids := every
	if !q.All {
		if err := brandNotHidden(ctx, l.db, q.ProfileID); err != nil {
			return out, err
		}
		ids = []string{q.ProfileID}
		b, err := brandBudget(ctx, l.db, q.ProfileID, now)
		if err != nil {
			return out, err
		}
		if b.MonthCents > 0 {
			out.Budget = &b
		}
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
			item := DashboardItem{Type: it.Type, ID: it.ID, DraftID: it.DraftID, ProfileID: id, Kind: it.Kind, Status: it.Status, Title: it.Title, At: it.At}
			if due, ok := comingUp(it, now); ok {
				next := item
				next.At = due
				out.Next = append(out.Next, next)
			}
			if it.Type == "draft" {
				out.Recent = append(out.Recent, item)
			}
			if !period.Holds(r.created) {
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
		}
		add(&out.Posts, sum.Posts)
		add(&out.Articles, sum.Articles)
		out.Brands = append(out.Brands, sum)
	}
	sort.SliceStable(out.Next, func(i, j int) bool { return out.Next[i].At < out.Next[j].At })
	sort.SliceStable(out.Recent, func(i, j int) bool { return out.Recent[i].At > out.Recent[j].At })
	out.Next = out.Next[:min(len(out.Next), dashboardList)]
	out.Recent = out.Recent[:min(len(out.Recent), dashboardList)]
	if err := l.usage(ctx, &out, ids, period, zone, now); err != nil {
		return out, err
	}
	return out, l.totals(ctx, &out, every, q.All, period, zone, now)
}

// openBrands are the brands the caller may open that are not archived, in their order.
func (l *Library) openBrands(ctx context.Context) ([]string, error) {
	where, args := l.scope(ctx, "", true, "id")
	rs, err := l.db.QueryContext(ctx, `SELECT id FROM profiles WHERE archived_at IS NULL`+where+` ORDER BY position, id`, args...)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rs.Next() {
		var id string
		if err := rs.Scan(&id); err != nil {
			rs.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, closeRows(rs)
}

// totals counts what the person may open, and for an admin the accounts. A server without accounts has none to count.
func (l *Library) totals(ctx context.Context, out *Dashboard, every []string, all bool, period Days, zone *time.Location, now time.Time) error {
	out.Totals.Brands = len(every)
	if all {
		out.Totals.CostCents = out.Usage.CostCents
	} else {
		var sum Dashboard
		if err := l.usage(ctx, &sum, every, period, zone, now); err != nil {
			return err
		}
		out.Totals.CostCents = sum.Usage.CostCents
	}
	if p, ok := PrincipalFrom(ctx); ok && !p.Admin() {
		return nil
	}
	var active, disabled int
	if err := l.db.QueryRowContext(ctx, `SELECT COUNT(CASE WHEN status = 'active' THEN 1 END), COUNT(CASE WHEN status <> 'active' THEN 1 END) FROM users`).Scan(&active, &disabled); err != nil {
		return err
	}
	if active+disabled > 0 {
		out.Totals.Users, out.Totals.DisabledUsers = &active, disabled
	}
	return nil
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
func (l *Library) usage(ctx context.Context, out *Dashboard, ids []string, period Days, zone *time.Location, now time.Time) error {
	u := &out.Usage
	u.Bucket, u.Series, u.Largest = "day", []Spend{}, []SessionSpend{}
	// the last day shown: the period's, but never one still to come
	last := day(now, zone)
	if !period.Until.IsZero() && period.Until.AddDate(0, 0, -1).Before(last) {
		last = period.Until.AddDate(0, 0, -1)
	}
	if period.From.IsZero() || period.From.AddDate(0, 0, 31).Before(period.Until) {
		u.Bucket = "week"
	}
	start := day
	if u.Bucket == "week" {
		start = week
	}
	since := period.From // zero: everything
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
		if !period.Until.IsZero() && !at.Before(period.Until) {
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
	if since.IsZero() {
		if first.IsZero() {
			return nil
		}
		since = first
	}
	step := 1
	if u.Bucket == "week" {
		step = 7
	}
	for d, end := start(since, zone), start(last, zone); !d.After(end); d = d.AddDate(0, 0, step) {
		k := d.Format(time.DateOnly)
		if spend[k] == nil {
			u.Series = append(u.Series, Spend{Start: k})
		} else {
			u.Series = append(u.Series, *spend[k])
		}
	}
	return nil
}
