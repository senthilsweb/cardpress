package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

const emptyDoc = `{"type":"doc","content":[{"type":"paragraph"}]}`

func input() DraftInput {
	return DraftInput{ProfileID: "p", Kind: KindPost, Doc: json.RawMessage(emptyDoc), Hashtags: []string{"#Go", "go", "data_ai"}}
}

func TestDraftLifecycle(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	d, err := s.CreateDraft(ctx, input())
	if err != nil {
		t.Fatal(err)
	}
	if d.ID == "" || d.Status != StatusDraft || len(d.Hashtags) != 2 || d.Hashtags[0] != "Go" {
		t.Fatalf("hashtags should be stripped and de-duplicated: %+v", d)
	}
	in := input()
	in.Kind, in.AltText, in.UnicodeStyles, in.Hashtags = KindArticle, "alt", true, nil
	up, err := s.UpdateDraft(ctx, d.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if up.Kind != KindArticle || up.AltText != "alt" || !up.UnicodeStyles || len(up.Hashtags) != 0 || up.ProfileID != "p" || up.CreatedAt != d.CreatedAt {
		t.Fatalf("%+v", up)
	}
	if err := s.DeleteDraft(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetDraft(ctx, d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after delete: %v", err)
	}
	if err := s.DeleteDraft(ctx, d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete: %v", err)
	}
	if _, err := s.UpdateDraft(ctx, "missing", input()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
}

func TestDraftListIsPerProfileNewestFirst(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	tick := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	s.now = func() time.Time { tick = tick.Add(time.Second); return tick }
	a, _ := s.CreateDraft(ctx, input())
	b, _ := s.CreateDraft(ctx, input())
	other := input()
	other.ProfileID = "q"
	if _, err := s.CreateDraft(ctx, other); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateDraft(ctx, a.ID, input()); err != nil { // a is now the newest
		t.Fatal(err)
	}
	list, err := s.ListDrafts(ctx, "p")
	if err != nil || len(list) != 2 || list[0].ID != a.ID || list[1].ID != b.ID {
		t.Fatalf("%v %+v", err, list)
	}
	if list, _ = s.ListDrafts(ctx, "none"); list == nil || len(list) != 0 {
		t.Fatalf("empty list must be [] not nil: %#v", list)
	}
}

func TestDraftValidation(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	bad := map[string]func(*DraftInput){
		"no profile":  func(i *DraftInput) { i.ProfileID = "" },
		"bad kind":    func(i *DraftInput) { i.Kind = "tweet" },
		"no doc":      func(i *DraftInput) { i.Doc = nil },
		"wrong doc":   func(i *DraftInput) { i.Doc = json.RawMessage(`{"type":"paragraph"}`) },
		"bad hashtag": func(i *DraftInput) { i.Hashtags = []string{"two words"} },
		"empty tag":   func(i *DraftInput) { i.Hashtags = []string{"#"} },
		"long alt text": func(i *DraftInput) {
			b := make([]rune, maxAltText+1)
			for k := range b {
				b[k] = 'a'
			}
			i.AltText = string(b)
		},
	}
	for name, mutate := range bad {
		in := input()
		mutate(&in)
		if _, err := s.CreateDraft(ctx, in); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}
