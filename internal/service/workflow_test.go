package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

const goodDesign = `{"sizeId":"linkedin-post","layout":"hero","background":"mesh","paletteId":"cream-emerald","seed":7,"eyebrow":"E","title":"T","subtitle":"S","footer":"","tag":"","quoteAuthor":"","statValue":"","titleScale":1,"intensity":0.9,"bottomFade":0,"showLogo":true,"showFooter":true,"photos":[]}`

func TestACardDesignIsStronglyTyped(t *testing.T) {
	d, err := ParseCardDesign([]byte(goodDesign))
	if err != nil || d.Layout != "hero" || d.Photos == nil {
		t.Fatalf("%+v %v", d, err)
	}
	// the legacy caption is accepted and dropped
	if d, err := ParseCardDesign([]byte(strings.Replace(goodDesign, `"seed":7`, `"seed":7,"caption":"old"`, 1))); err != nil || d.Caption != nil {
		t.Fatalf("%+v %v", d, err)
	}
	for name, bad := range map[string]string{
		"unknown field": strings.Replace(goodDesign, `"seed":7`, `"seed":7,"layuot":"x"`, 1),
		"bad layout":    strings.Replace(goodDesign, `"hero"`, `"wide"`, 1),
		"bad palette":   strings.Replace(goodDesign, `"cream-emerald"`, `"../x"`, 1),
		"scale":         strings.Replace(goodDesign, `"titleScale":1`, `"titleScale":9`, 1),
		"intensity":     strings.Replace(goodDesign, `"intensity":0.9`, `"intensity":2`, 1),
		"font role":     strings.Replace(goodDesign, `"photos":[]`, `"photos":[],"fonts":{"heading":"Inter"}`, 1),
		"long title":    strings.Replace(goodDesign, `"title":"T"`, `"title":"`+strings.Repeat("x", 401)+`"`, 1),
		"wrong type":    strings.Replace(goodDesign, `"seed":7`, `"seed":"seven"`, 1),
		"not json":      `[]`,
	} {
		if _, err := ParseCardDesign([]byte(bad)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestADraftKeepsItsOwnDesignAndTitle(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, err := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Hi")), Title: "  My title ", Design: json.RawMessage(goodDesign)})
	if err != nil || d.Title != "My title" || !strings.Contains(string(d.Design), `"layout":"hero"`) {
		t.Fatalf("%+v %v", d, err)
	}
	// saving without a design keeps the one saved
	up, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Hi")), Title: "My title"})
	if err != nil || len(up.Design) == 0 {
		t.Fatalf("%+v %v", up, err)
	}
	// a draft saved with no design has none
	bare, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Hi"))})
	if len(bare.Design) != 0 {
		t.Fatalf("%s", bare.Design)
	}
	if _, err := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Hi")), Design: json.RawMessage(`{"layout":"x"}`)}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a bad design should be refused: %v", err)
	}
}

func TestApprovalAndEditingAnApprovedDraft(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	empty := l.draft(t, "p", "post", docOf(`{"type":"paragraph"}`))
	if _, err := l.st.Approve(ctx, empty.ID); !errors.Is(err, ErrInvalid) {
		t.Fatalf("an empty draft cannot be approved: %v", err)
	}
	d := l.draft(t, "p", "post", docOf(para("Hello")))
	a, err := l.st.Approve(ctx, d.ID)
	if err != nil || a.Status != StatusApproved || a.ApprovedAt == "" {
		t.Fatalf("%+v %v", a, err)
	}
	if again, err := l.st.Approve(ctx, d.ID); err != nil || again.ApprovedAt != a.ApprovedAt {
		t.Fatalf("approving twice changes nothing: %+v %v", again, err)
	}
	same := DraftInput{ProfileID: "p", Kind: "post", Doc: json.RawMessage(`{ "content": [ {"content":[{"text":"Hello","type":"text"}],"type":"paragraph"} ], "type":"doc" }`)}
	if up, err := l.st.UpdateDraft(ctx, d.ID, same); err != nil || up.Status != StatusApproved {
		t.Fatalf("the same text, spaced differently, keeps the approval: %+v %v", up, err)
	}
	same.Doc = docOf(para("Hello again"))
	if up, err := l.st.UpdateDraft(ctx, d.ID, same); err != nil || up.Status != StatusDraft || up.ApprovedAt != "" {
		t.Fatalf("a changed text returns it to draft: %+v %v", up, err)
	}
	l.st.Approve(ctx, d.ID)
	un, err := l.st.Unapprove(ctx, d.ID)
	if err != nil || un.Status != StatusDraft || un.ApprovedAt != "" {
		t.Fatalf("%+v %v", un, err)
	}
	if _, err := l.st.Approve(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
}

func TestOnlyAnApprovedDraftCanBePublishedAndItsStatusFollowsTheJob(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d := l.draft(t, "p", "post", docOf(para("Hello")))
	in := JobInput{ProfileID: "p", DraftID: d.ID, Body: "Hello", AltText: "a", Image: testPNG}

	for name, mut := range map[string]func(*JobInput){
		"no draft":      func(i *JobInput) { i.DraftID = "" },
		"unknown draft": func(i *JobInput) { i.DraftID = "nope" },
		"not approved":  func(i *JobInput) {},
		"other brand":   func(i *JobInput) { i.ProfileID = "q" },
	} {
		x := in
		mut(&x)
		if _, err := l.p.Create(ctx, x); err == nil {
			t.Errorf("%s: a post was made without an approved draft", name)
		}
	}
	l.st.Approve(ctx, d.ID)
	other := in
	other.ProfileID = "q"
	if _, err := l.p.Create(ctx, other); !errors.Is(err, ErrInvalid) {
		t.Fatalf("another brand's draft: %v", err)
	}

	at := l.clk.Add(time.Hour)
	in.ScheduledAt, in.Timezone = &at, "Europe/London"
	j, err := l.p.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	status := func() string { x, _ := l.st.GetDraft(ctx, d.ID); return x.Status }
	if status() != StatusScheduled {
		t.Fatalf("a waiting post schedules its draft: %s", status())
	}
	if _, err := l.p.Create(ctx, in); !errors.Is(err, ErrConflict) {
		t.Fatalf("a second post from the same draft must be refused: %v", err)
	}
	if _, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Changed"))}); !errors.Is(err, ErrConflict) {
		t.Fatalf("a draft with a waiting post cannot be edited: %v", err)
	}
	if _, err := l.st.Unapprove(ctx, d.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
	// cancelling hands the draft back
	if _, err := l.p.Cancel(ctx, j.ID); err != nil {
		t.Fatal(err)
	}
	if status() != StatusApproved {
		t.Fatalf("a cancelled post hands the draft back: %s", status())
	}
	// publishing now marks it published, and editing it makes a new draft
	in.ScheduledAt, in.Timezone = nil, ""
	j, err = l.p.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	l.p.Execute(ctx, j.ID)
	if status() != StatusPublished {
		t.Fatalf("a posted draft is published: %s", status())
	}
	if _, err := l.p.Create(ctx, in); !errors.Is(err, ErrConflict) {
		t.Fatalf("a published draft needs editing before it is posted again: %v", err)
	}
	if up, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("A new version"))}); err != nil || up.Status != StatusDraft {
		t.Fatalf("%+v %v", up, err)
	}
}

func TestAFailedPostHandsItsDraftBack(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d := l.draft(t, "p", "post", docOf(para("Hello")))
	l.st.Approve(ctx, d.ID)
	l.li.err = errors.New("LinkedIn refused this action.")
	j, err := l.p.Create(ctx, JobInput{ProfileID: "p", DraftID: d.ID, Body: "Hello", Image: testPNG})
	if err != nil {
		t.Fatal(err)
	}
	l.p.Execute(ctx, j.ID)
	if x, _ := l.st.GetDraft(ctx, d.ID); x.Status != StatusApproved {
		t.Fatalf("a post that failed leaves the draft approved: %s", x.Status)
	}
}

func TestPlanningAnArticle(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	a := l.draft(t, "p", "article", docOf(heading("Title"), para("Text")))
	at := time.Date(2027, 1, 5, 9, 0, 0, 0, time.UTC)
	if _, err := l.st.Plan(ctx, a.ID, &at, "UTC"); !errors.Is(err, ErrConflict) {
		t.Fatalf("approve before planning: %v", err)
	}
	l.st.Approve(ctx, a.ID)
	p, err := l.st.Plan(ctx, a.ID, &at, "Europe/London")
	if err != nil || p.ScheduledAt != "2027-01-05T09:00:00Z" || p.Timezone != "Europe/London" || p.Status != StatusApproved {
		t.Fatalf("%+v %v", p, err)
	}
	if _, err := l.st.Plan(ctx, a.ID, &at, "Mars/Olympus"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("%v", err)
	}
	if c, err := l.st.Plan(ctx, a.ID, nil, ""); err != nil || c.ScheduledAt != "" {
		t.Fatalf("clearing: %+v %v", c, err)
	}
	post := l.draft(t, "p", "post", docOf(para("Hi")))
	l.st.Approve(ctx, post.ID)
	if _, err := l.st.Plan(ctx, post.ID, &at, "UTC"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("only an article has a planned date: %v", err)
	}
	// unapproving drops the date
	l.st.Plan(ctx, a.ID, &at, "UTC")
	if u, _ := l.st.Unapprove(ctx, a.ID); u.ScheduledAt != "" {
		t.Fatalf("%+v", u)
	}
}
