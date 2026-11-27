package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/store"
)

// The figures are worked out from rows written here, so each one can be checked by hand.
func TestDashboardFigures(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+filepath.Join(t.TempDir(), "d.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	run := func(q string, args ...any) {
		t.Helper()
		if _, err := db.ExecContext(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	for i, id := range []string{"a", "b", "old"} {
		run(`INSERT INTO profiles (id, position, data, updated_at) VALUES (?, ?, '{}', '')`, id, i)
	}
	run(`UPDATE profiles SET archived_at = 'x' WHERE id = 'old'`)
	doc := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Words"}]}]}`
	draft := func(id, brand, kind, status, updated, planned, page string) {
		run(`INSERT INTO drafts (id, profile_id, kind, status, doc, created_at, updated_at, scheduled_at, page_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, brand, kind, status, doc, updated, updated, planned, page)
	}
	draft("p1", "a", "post", "draft", "2026-11-20T10:00:00.000Z", "", "")
	draft("p2", "a", "post", "approved", "2026-11-21T10:00:00.000Z", "", "")
	draft("a1", "a", "article", "approved", "2026-11-22T10:00:00.000Z", "2026-11-30T09:00:00Z", "2026-11-22T10:00:00Z")
	draft("b1", "b", "post", "draft", "2026-11-26T10:00:00.000Z", "", "")
	draft("o1", "old", "post", "draft", "2026-11-26T10:00:00.000Z", "", "")
	job := func(id, brand, status, scheduled, published string) {
		run(`INSERT INTO publish_jobs (id, profile_id, status, body, image, scheduled_at, created_at, updated_at, published_at) VALUES (?, ?, ?, 'Sent words', x'00', ?, '2026-11-01T00:00:00.000Z', '', ?)`, id, brand, status, scheduled, published)
	}
	job("j1", "a", JobScheduled, "2026-11-28T08:00:00Z", "")
	job("j2", "a", JobPublished, "", "2026-11-10T08:00:00Z")
	job("j3", "a", JobFailed, "", "")
	job("j4", "a", JobCancelled, "", "")
	conv := func(id, brand, title string) {
		run(`INSERT INTO conversations (id, profile_id, title, source_kind, source_text, created_at, updated_at) VALUES (?, ?, ?, 'text', '', '', '')`, id, brand, title)
	}
	conv("c1", "a", "First")
	conv("c2", "b", "Second")
	use := func(id, c, session string, added int, seconds float64, at string) {
		run(`INSERT INTO chat_usage (id, conversation_id, message_id, session_id, total_cents, added_cents, active_seconds, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`, id, c, "m"+id, session, added, seconds, at)
	}
	use("1", "c1", "s1", 50, 20, "2026-10-01T12:00:00.000Z") // before the last 7 and 30 days
	use("2", "c1", "s1", 30, 35, "2026-11-25T12:00:00.000Z")
	use("3", "c1", "s1", 10, 40, "2026-11-27T01:00:00.000Z") // the evening of the 26th in New York
	use("4", "c2", "s2", 100, 100, "2026-11-26T15:00:00.000Z")

	now := time.Date(2026, 11, 27, 14, 0, 0, 0, time.UTC)
	l := NewLibrary(db.DB)
	d, err := l.Dashboard(ctx, DashboardQuery{ProfileID: "a", Days: 7, Zone: "America/New_York"}, now)
	if err != nil {
		t.Fatal(err)
	}
	// the jobs were created on 1 November, before the seven days; the two post drafts on the 20th and 21st
	if want := (Counts{Total: 1, Approved: 1}); d.Posts != want {
		t.Errorf("posts: %+v", d.Posts)
	}
	if want := (Counts{Total: 1, Approved: 1, Pages: 1}); d.Articles != want {
		t.Errorf("articles: %+v", d.Articles)
	}
	if len(d.Next) != 2 || d.Next[0].ID != "j1" || d.Next[1].ID != "a1" || d.Next[1].At != "2026-11-30T09:00:00Z" {
		t.Errorf("next: %+v", d.Next)
	}
	if len(d.Recent) != 3 || d.Recent[0].ID != "a1" {
		t.Errorf("recent: %+v", d.Recent)
	}
	u := d.Usage
	if d.Period != (Period{From: "2026-11-21", To: "2026-11-27"}) || d.Totals.Brands != 2 || d.Totals.CostCents != 140 || d.Totals.Users != nil {
		t.Errorf("period and totals: %+v %+v", d.Period, d.Totals)
	}
	if u.CostCents != 40 || u.Sessions != 1 || u.Replies != 2 || u.ActiveSeconds != 20 || u.Bucket != "day" || len(u.Series) != 7 {
		t.Errorf("seven days: %+v", u)
	}
	if last, before := u.Series[6], u.Series[5]; last.Start != "2026-11-27" || last.CostCents != 0 || before.Start != "2026-11-26" || before.CostCents != 10 {
		t.Errorf("days are the person's: %+v", u.Series)
	}

	all, err := l.Dashboard(ctx, DashboardQuery{All: true, Days: 0}, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(all.Brands) != 2 || all.Posts.Total != 6 || all.Usage.CostCents != 190 || all.Usage.Sessions != 2 || all.Usage.Bucket != "week" {
		t.Errorf("all brands, all time, without the archived one: %+v %+v", all.Posts, all.Usage)
	}
	if all.Brands[1].ID != "b" || all.Brands[1].CostCents != 100 || all.Brands[1].Sessions != 1 {
		t.Errorf("by brand: %+v", all.Brands)
	}
	if all.Usage.Largest[0].Title != "Second" || all.Usage.Largest[1].CostCents != 90 || all.Usage.Largest[1].Replies != 3 {
		t.Errorf("largest: %+v", all.Usage.Largest)
	}
	if all.Usage.Series[0].Start != "2026-09-28" || all.Usage.Series[len(all.Usage.Series)-1].Start != "2026-11-23" {
		t.Errorf("weeks: %+v", all.Usage.Series)
	}
	ever, err := l.Dashboard(ctx, DashboardQuery{ProfileID: "a"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if want := (Counts{Total: 5, Draft: 1, Approved: 1, Scheduled: 1, Published: 1, Attention: 1}); ever.Posts != want || ever.Period != (Period{}) {
		t.Errorf("posts of all time: %+v %+v", ever.Posts, ever.Period)
	}
	// chosen days, both included: one draft created on the first, one on the last; cost after them is left out
	chosen, err := l.Dashboard(ctx, DashboardQuery{ProfileID: "a", From: "2026-11-20", To: "2026-11-25", Zone: "America/New_York"}, now)
	if err != nil {
		t.Fatal(err)
	}
	cu := chosen.Usage
	if chosen.Posts.Total != 2 || chosen.Articles.Total != 1 || cu.CostCents != 30 || cu.Replies != 1 || cu.ActiveSeconds != 15 || len(cu.Series) != 6 || cu.Series[5].Start != "2026-11-25" || chosen.Totals.CostCents != 30 {
		t.Errorf("chosen days: %+v %+v %+v %+v", chosen.Posts, chosen.Articles, cu, chosen.Totals)
	}
	if len(chosen.Next) != 2 || len(chosen.Recent) != 3 {
		t.Errorf("next and recent do not follow the period: %+v %+v", chosen.Next, chosen.Recent)
	}
	list, err := l.List(ctx, LibraryQuery{ProfileID: "a", CreatedFrom: "2026-11-20", CreatedTo: "2026-11-25", Zone: "America/New_York"})
	if err != nil || list.Total != chosen.Posts.Total+chosen.Articles.Total {
		t.Errorf("the library agrees: %d %v", list.Total, err)
	}
	user := func(id, role, status string) {
		run(`INSERT INTO users (id, email, first_name, last_name, password_hash, status, created_at) VALUES (?, ?, 'A', 'B', '', ?, '')`, id, id+"@example.test", status)
		run(`INSERT INTO user_roles (user_id, role) VALUES (?, ?)`, id, role)
	}
	user("boss", "admin", "active")
	user("ed", "editor", "active")
	user("gone", "writer", "disabled")
	run(`UPDATE profiles SET owner_id = 'ed' WHERE id = 'b'`)
	as := func(u User) Dashboard {
		t.Helper()
		got, err := l.Dashboard(WithPrincipal(ctx, Principal{User: &u}), DashboardQuery{All: true}, now)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	if got := as(User{ID: "boss", Roles: []string{"admin"}}).Totals; got.Users == nil || *got.Users != 2 || got.DisabledUsers != 1 || got.Brands != 2 || got.CostCents != 190 {
		t.Errorf("an admin: %+v", got)
	}
	if got := as(User{ID: "ed", Roles: []string{"editor"}}).Totals; got.Users != nil || got.DisabledUsers != 0 || got.Brands != 1 || got.CostCents != 100 {
		t.Errorf("an editor sees their own brand and no users: %+v", got)
	}
	for _, bad := range []DashboardQuery{{}, {ProfileID: "a", Days: 5}, {ProfileID: "a", Zone: "Nowhere/City"},
		{ProfileID: "a", From: "2026-11-01"}, {ProfileID: "a", From: "2026-11-02", To: "2026-11-01"},
		{ProfileID: "a", Days: 7, From: "2026-11-01", To: "2026-11-02"}, {ProfileID: "a", From: "2000-01-01", To: "2026-11-01"}} {
		if _, err := l.Dashboard(ctx, bad, now); err == nil {
			t.Errorf("%+v was accepted", bad)
		}
	}
}
