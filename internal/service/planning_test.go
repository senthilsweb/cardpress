package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/content"
)

func str(s string) *string { return &s }

func TestTheSchemaLimitsAreTheServices(t *testing.T) {
	for name, want := range map[string]int{
		"title": maxTitle, "altText": maxAltText, "summary": maxSummary, "slug": maxSlugLen,
		"audience": maxAudience, "topic": maxTopic, "campaign": maxCampaign, "reviewNotes": maxReviewNotes, "body": maxAssistantBody,
	} {
		if got := content.Server[name].MaxLength; got != want {
			t.Errorf("%s: %d, the service allows %d", name, got, want)
		}
	}
	if content.Server["body"].ByKind["post"] != maxBodyChars || content.Server["hashtags"].MaxItems != maxHashtags {
		t.Error("body, hashtags or summary differ")
	}
	// the card's limits are enforced by the design check
	for _, f := range CardTextFields {
		name := f
		if f == "title" {
			name = "headline"
		}
		max := content.Server[name].MaxLength
		for n, ok := range map[int]bool{max: true, max + 1: false} {
			raw := `{"sizeId":"li-post","layout":"hero","background":"mesh","paletteId":"cream-emerald","titleScale":1,"` + f + `":"` + strings.Repeat("x", n) + `"}`
			if _, err := ParseCardDesign([]byte(raw)); (err == nil) != ok {
				t.Errorf("%s at %d characters: %v", f, n, err)
			}
		}
	}
}

func TestEverySchemaColumnExists(t *testing.T) {
	s := newStudio(t)
	for name, f := range content.Server {
		parts := strings.Split(f.Column, ".")
		var n int
		if err := s.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, parts[0], parts[1]).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("%s: no column %s", name, f.Column)
		}
	}
}

func TestPlanningKeepsTheStatusAndMovesTheRevision(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d := l.draft(t, "p", KindArticle, docOf(para("one")))
	if _, err := l.st.Approve(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	got, err := l.st.SetPlanning(ctx, d.ID, PlanningPatch{ReviewNotes: str("  Check the figure.\r\nThen send. ")})
	if err != nil || got.ReviewNotes != "Check the figure.\nThen send." || got.Status != StatusApproved || got.Revision != d.Revision+1 || !got.VersionIsCurrent {
		t.Fatalf("notes: %v %+v", err, got)
	}
	got, err = l.st.SetPlanning(ctx, d.ID, PlanningPatch{Audience: str("Data leads"), Campaign: str("Spring")})
	if err != nil || got.Audience != "Data leads" || got.Campaign != "Spring" || got.ReviewNotes == "" || got.Status != StatusApproved || got.VersionIsCurrent {
		t.Fatalf("fields: %v %+v", err, got)
	}
	same, err := l.st.SetPlanning(ctx, d.ID, PlanningPatch{Audience: str("Data leads")})
	if err != nil || same.Revision != got.Revision {
		t.Fatalf("the same value again: %v %+v", err, same)
	}
	for _, bad := range []PlanningPatch{{Audience: str(strings.Repeat("a", maxAudience+1))}, {Topic: str("two\nlines")}, {ReviewNotes: str(strings.Repeat("a", maxReviewNotes+1))}} {
		if _, err := l.st.SetPlanning(ctx, d.ID, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: %v", bad, err)
		}
	}
	// saving the text leaves planning as it is
	up, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: KindArticle, Doc: docOf(para("two"))})
	if err != nil || up.Audience != "Data leads" || up.ReviewNotes == "" {
		t.Fatalf("%v %+v", err, up)
	}
}

func TestOnlyAnApproverWritesReviewNotes(t *testing.T) {
	l := newLib(t)
	d := l.draft(t, "p", KindPost, docOf(para("one")))
	writer := WithPrincipal(context.Background(), Principal{User: &User{ID: "w", Roles: []string{RoleWriter}}})
	if _, err := l.st.SetPlanning(writer, d.ID, PlanningPatch{ReviewNotes: str("x")}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("a writer's notes: %v", err)
	}
	if _, err := l.st.SetPlanning(writer, d.ID, PlanningPatch{Topic: str("Go")}); err != nil {
		t.Fatal(err)
	}
}

func TestVersionsHoldPlanningButNotReviewNotes(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d := l.draft(t, "p", KindPost, docOf(para("one")))
	// the assistant's change to planning alone is a version
	first, _, err := l.st.PatchDraft(ctx, d.ID, DraftPatch{Audience: str("Founders"), Topic: str("Contracts")})
	if err != nil || first.Audience != "Founders" || first.Revision != d.Revision+1 || !first.VersionIsCurrent || first.Version <= d.Version {
		t.Fatalf("%v %+v", err, first)
	}
	if _, _, err := l.st.PatchDraft(ctx, d.ID, DraftPatch{Audience: str("Engineers"), AltText: str("A card")}); err != nil {
		t.Fatal(err)
	}
	if _, err := l.st.SetPlanning(ctx, d.ID, PlanningPatch{ReviewNotes: str("keep me")}); err != nil {
		t.Fatal(err)
	}
	back, err := l.st.RestoreVersion(ctx, d.ID, first.Version)
	if err != nil || back.Audience != "Founders" || back.Topic != "Contracts" || back.AltText != "" || back.ReviewNotes != "keep me" || !back.VersionIsCurrent {
		t.Fatalf("restore: %v %+v", err, back)
	}
	// a version from before the fields existed leaves them alone
	if _, err := l.st.db.ExecContext(ctx, `UPDATE draft_versions SET audience = NULL, topic = NULL, campaign = NULL WHERE draft_id = ? AND seq = 1`, d.ID); err != nil {
		t.Fatal(err)
	}
	old, err := l.st.RestoreVersion(ctx, d.ID, 1)
	if err != nil || old.Audience != "Founders" {
		t.Fatalf("old version: %v %+v", err, old)
	}
	// a refused change stores nothing
	bad := []string{"not a tag"}
	if _, _, err := l.st.PatchDraft(ctx, d.ID, DraftPatch{Topic: str("Other"), Hashtags: &bad}); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if now, _ := l.st.GetDraft(ctx, d.ID); now.Topic != "Contracts" {
		t.Fatalf("stored anyway: %q", now.Topic)
	}
	long := strings.Repeat("a", maxSlugLen+1)
	if _, _, err := l.st.PatchDraft(ctx, d.ID, DraftPatch{Slug: &long}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a long address: %v", err)
	}
}

func TestAPersonWritesTheAddressAndDescription(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d := l.draft(t, "p", KindArticle, docOf(para("one")))
	other := l.draft(t, "p", KindArticle, docOf(para("two")))
	if _, err := l.st.Approve(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	approved, _ := l.st.GetDraft(ctx, d.ID)
	got, err := l.st.SetPageFields(ctx, d.ID, PageFields{Slug: str("short-contracts"), Summary: str("What to do.")})
	if err != nil || got.Slug != "short-contracts" || got.Summary != "What to do." || got.Status != StatusDraft || got.Revision != approved.Revision+1 || !got.VersionIsCurrent {
		t.Fatalf("%v %+v", err, got)
	}
	if same, err := l.st.SetPageFields(ctx, d.ID, PageFields{Slug: str("short-contracts")}); err != nil || same.Revision != got.Revision {
		t.Fatalf("the same again: %v", err)
	}
	for want, p := range map[error]PageFields{ErrInvalid: {Slug: str("Not an address")}, ErrConflict: {Slug: str("short-contracts")}} {
		if _, err := l.st.SetPageFields(ctx, other.ID, p); !errors.Is(err, want) {
			t.Errorf("%+v: %v", p, err)
		}
	}
	if _, err := l.st.Approve(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := l.st.PublishPage(ctx, d.ID, PageInput{}); err != nil {
		t.Fatal(err)
	}
	if _, err := l.st.SetPageFields(ctx, d.ID, PageFields{Summary: str("New")}); !errors.Is(err, ErrConflict) {
		t.Fatalf("a live page: %v", err)
	}
}

func TestOnlyRealPlanningChangesAreReported(t *testing.T) {
	empty := fingerprint("")
	was := sight{Text: map[string]string{"body": "a"}} // seen before the fields existed
	now := sight{Text: map[string]string{"body": "a", "audience": empty, "topic": fingerprint("Go")}}
	if got := changedSince(was, now); len(got) != 1 || got[0] != "topic: changed" {
		t.Fatalf("%v", got)
	}
	was = sight{Text: map[string]string{"topic": fingerprint("Go")}}
	if got := changedSince(was, sight{Text: map[string]string{"topic": empty}}); len(got) != 1 {
		t.Fatalf("a cleared field: %v", got)
	}
}
