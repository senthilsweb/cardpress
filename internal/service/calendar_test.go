package service

import (
	"context"
	"testing"
	"time"
)

func TestCalendarListsPostsAndPlannedArticlesInTheRangeAndWhatIsReady(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	now := *l.clk

	// a post sent now, a post waiting for tomorrow, a cancelled one (left out)
	l.post(t, "p", "", "Sent words")
	tomorrow := now.Add(24 * time.Hour)
	waiting, err := l.p.Create(ctx, JobInput{ProfileID: "p", DraftID: l.approvedDraft("p"), Body: "Waiting words", AltText: "a", Image: testPNG, ScheduledAt: &tomorrow, Timezone: "Europe/London"})
	if err != nil {
		t.Fatal(err)
	}
	later := now.Add(48 * time.Hour)
	gone, err := l.p.Create(ctx, JobInput{ProfileID: "p", DraftID: l.approvedDraft("p"), Body: "Cancelled words", AltText: "a", Image: testPNG, ScheduledAt: &later, Timezone: "Europe/London"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := l.p.Cancel(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	// an article with a planned date, and approved items with no date
	article := l.draft(t, "p", "article", docOf(heading("Planned piece"), para("text")))
	if _, err := l.st.Approve(ctx, article.ID); err != nil {
		t.Fatal(err)
	}
	plan := now.Add(72 * time.Hour)
	if _, err := l.st.Plan(ctx, article.ID, &plan, "Europe/London"); err != nil {
		t.Fatal(err)
	}
	readyPost := l.draft(t, "p", "post", docOf(para("Ready to go")))
	if _, err := l.st.Approve(ctx, readyPost.ID); err != nil {
		t.Fatal(err)
	}
	l.draft(t, "q", "post", docOf(para("Other brand")))

	got, err := l.lib.Calendar(ctx, CalendarQuery{ProfileID: "p", From: now.Add(-time.Hour), To: now.Add(7 * 24 * time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	var kinds []string
	for _, e := range got {
		kinds = append(kinds, e.Type+":"+e.Status+":"+e.Title)
	}
	want := []string{"job:published:Sent words", "job:scheduled:Waiting words", "plan:approved:Planned piece"}
	if len(kinds) != len(want) {
		t.Fatalf("got %v", kinds)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("got %v, want %v", kinds, want)
		}
	}
	if got[1].ID != waiting.ID || got[1].Timezone != "Europe/London" {
		t.Fatalf("%+v", got[1])
	}

	// a narrower range leaves out what is outside it
	got, _ = l.lib.Calendar(ctx, CalendarQuery{ProfileID: "p", From: now.Add(36 * time.Hour), To: now.Add(7 * 24 * time.Hour)})
	if len(got) != 1 || got[0].Type != "plan" {
		t.Fatalf("%+v", got)
	}

	ready, err := l.lib.Ready(ctx, "p", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(ready) != 1 || ready[0].ID != readyPost.ID || ready[0].Title != "Ready to go" {
		t.Fatalf("%+v", ready)
	}

	for name, q := range map[string]CalendarQuery{
		"no brand":  {From: now, To: now.Add(time.Hour)},
		"backwards": {ProfileID: "p", From: now, To: now.Add(-time.Hour)},
		"too long":  {ProfileID: "p", From: now, To: now.Add(60 * 24 * time.Hour)},
		"no range":  {ProfileID: "p"},
	} {
		if _, err := l.lib.Calendar(ctx, q); err == nil {
			t.Errorf("%s: should be refused", name)
		}
	}
}
