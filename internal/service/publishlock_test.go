package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestAPublishedItemCannotChangeUntilItIsADraftAgain(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	d, _ := s.CreateDraft(ctx, input())
	title := "New"
	for name, publish := range map[string]string{
		"sent":      `UPDATE drafts SET status = 'published' WHERE id = ?`,
		"live page": `UPDATE drafts SET status = 'approved', page_at = '2026-01-01' WHERE id = ?`,
	} {
		if _, err := s.db.Exec(publish, d.ID); err != nil {
			t.Fatal(err)
		}
		cur, _ := s.GetDraft(ctx, d.ID)
		same := inputOf(cur)
		if _, err := s.UpdateDraft(ctx, d.ID, same); err != nil {
			t.Errorf("%s: saving it unchanged: %v", name, err)
		}
		edit := inputOf(cur)
		edit.AltText = "changed"
		_, e1 := s.UpdateDraft(ctx, d.ID, edit)
		_, _, e2 := s.PatchDraft(ctx, d.ID, DraftPatch{Title: &title})
		_, _, _, e3 := s.PatchCardText(ctx, d.ID, CardText{Headline: &title})
		_, e4 := s.ClearAttachment(ctx, d.ID)
		_, e5 := s.RestoreVersion(ctx, d.ID, 1)
		for i, err := range []error{e1, e2, e3, e4, e5} {
			if !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "published") {
				t.Errorf("%s: write %d: %v", name, i+1, err)
			}
		}
		if after, _ := s.GetDraft(ctx, d.ID); after.Revision != cur.Revision || after.Status != cur.Status {
			t.Errorf("%s: it changed: %+v", name, after)
		}
		if _, err := s.Unapprove(ctx, d.ID); err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.PatchDraft(ctx, d.ID, DraftPatch{Title: &name}); err != nil {
			t.Errorf("%s: back to draft: %v", name, err)
		}
	}
}

func TestEveryAssistantChangeAndEveryRestoreIsAVersion(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	d, _ := s.CreateDraft(ctx, input())
	if d.Version != 1 || !d.VersionIsCurrent {
		t.Fatalf("a new draft: %+v", d)
	}
	write := func(body string) Draft {
		t.Helper()
		cur, _ := s.GetDraft(ctx, d.ID)
		after, _, err := s.PatchDraft(ctx, d.ID, DraftPatch{Revision: cur.Revision, Body: &body})
		if err != nil {
			t.Fatal(err)
		}
		return after
	}
	if got := write("From the assistant, one."); got.Version != 2 || !got.VersionIsCurrent {
		t.Fatalf("%+v", got)
	}
	if got := write("From the assistant, two."); got.Version != 3 {
		t.Fatalf("%+v", got)
	}
	// saving an article's summary with its text is one version, and it is the current one
	summary, body, title := "One line.", "With a summary.", "Card"
	cur0, _ := s.GetDraft(ctx, d.ID)
	with, _, err := s.PatchDraft(ctx, d.ID, DraftPatch{Revision: cur0.Revision, Body: &body, Summary: &summary})
	if err != nil || with.Version != 4 || !with.VersionIsCurrent {
		t.Fatalf("%v %+v", err, with)
	}
	if _, after, _, err := s.PatchCardText(ctx, d.ID, CardText{Headline: &title}); err != nil || after.Version != 5 {
		t.Fatalf("no extra version before the next change: %v %+v", err, after)
	}
	write("From the assistant, two.")
	// a hand edit within ten minutes makes no version of its own, so the newest one is no longer what is on screen
	cur, _ := s.GetDraft(ctx, d.ID)
	hand := inputOf(cur)
	hand.Doc = DocFromText("Typed by hand.", KindPost)
	edited, err := s.UpdateDraft(ctx, d.ID, hand)
	if err != nil || edited.Version != 6 || edited.VersionIsCurrent {
		t.Fatalf("%v %+v", err, edited)
	}
	if got := write("From the assistant, three."); got.Version != 8 { // the hand edit is kept first, then the new text
		t.Fatalf("%+v", got)
	}
	back, err := s.RestoreVersion(ctx, d.ID, 2)
	if err != nil || back.Version != 9 || !back.VersionIsCurrent || !strings.Contains(DraftText(back.Doc), "one") {
		t.Fatalf("%v %+v", err, back)
	}
	list, _ := s.Versions(ctx, d.ID)
	var labels []string
	for _, v := range list {
		labels = append(labels, v.Label)
	}
	if got := strings.Join(labels, ","); got != "restored,assistant,manual,assistant,assistant,assistant,assistant,assistant,created" || list[0].Revision != back.Revision {
		t.Fatalf("%s", got)
	}
}
