package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func para(text string) string {
	return fmt.Sprintf(`{"type":"paragraph","content":[{"type":"text","text":%q}]}`, text)
}
func heading(text string) string {
	return fmt.Sprintf(`{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":%q}]}`, text)
}
func docOf(blocks ...string) json.RawMessage {
	return json.RawMessage(`{"type":"doc","content":[` + strings.Join(blocks, ",") + `]}`)
}

type libHarness struct {
	*harness
	st  *Studio
	lib *Library
}

func newLib(t *testing.T) *libHarness {
	h := newHarness(t, nil)
	st := New(h.db.DB)
	st.now = func() time.Time { return *h.clk } // drafts and posts share one clock
	return &libHarness{harness: h, st: st, lib: NewLibrary(h.db.DB)}
}

func (l *libHarness) draft(t *testing.T, profile, kind string, doc json.RawMessage) Draft {
	t.Helper()
	d, err := l.st.CreateDraft(context.Background(), DraftInput{ProfileID: profile, Kind: kind, Doc: doc})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func (l *libHarness) post(t *testing.T, profile, draftID, body string) Job {
	t.Helper()
	in := jobInput()
	in.ProfileID, in.DraftID, in.Body = profile, draftID, body
	j, err := l.p.Create(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	l.p.Execute(context.Background(), j.ID)
	l.advance(time.Minute)
	return j
}

func ids(p LibraryPage) string {
	var s []string
	for _, i := range p.Items {
		s = append(s, i.Type+":"+i.Status)
	}
	return strings.Join(s, ",")
}

func TestLibraryMergesPostsAndDraftsNewestFirstAndListsADraftOnce(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	article := l.draft(t, "p", "article", docOf(heading("Bank statements to cash flow"), para("From PDFs to a clean pipeline.")))
	l.advance(time.Minute)
	posted := l.draft(t, "p", "post", docOf(para("Many questions, one SQL row.")))
	l.post(t, "p", posted.ID, "Many questions, one SQL row.")
	l.advance(time.Minute)
	l.draft(t, "p", "post", docOf(para("A second idea."))) // still a draft
	l.draft(t, "p", "post", docOf(`{"type":"paragraph"}`)) // empty: left out

	page, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p"})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(page); got != "draft:draft,job:published,draft:draft" {
		t.Fatalf("%s", got)
	}
	if page.Items[2].ID != article.ID || page.Items[2].Title != "Bank statements to cash flow" || page.Items[2].Excerpt != "From PDFs to a clean pipeline." || page.Items[2].Kind != "article" {
		t.Fatalf("%+v", page.Items[2])
	}
	job := page.Items[1]
	if job.Title != "Many questions, one SQL row." || job.PostURL == "" || job.DraftID != posted.ID || job.At == "" {
		t.Fatalf("%+v", job)
	}
}

func TestLibraryFiltersByBrandKindStatusAndText(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	l.draft(t, "p", "article", docOf(heading("Cash flow"), para("pipeline notes")))
	l.draft(t, "p", "post", docOf(para("Hello world")))
	l.draft(t, "q", "post", docOf(para("Other brand")))
	l.post(t, "p", "", "Posted words")

	count := func(q LibraryQuery) int {
		p, err := l.lib.List(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		return len(p.Items)
	}
	for name, tc := range map[string]struct {
		q    LibraryQuery
		want int
	}{
		"one brand":      {LibraryQuery{ProfileID: "p"}, 3},
		"all brands":     {LibraryQuery{All: true}, 4},
		"articles":       {LibraryQuery{ProfileID: "p", Kind: "article"}, 1},
		"posts":          {LibraryQuery{ProfileID: "p", Kind: "post"}, 2},
		"published":      {LibraryQuery{ProfileID: "p", Status: "published"}, 1},
		"drafts":         {LibraryQuery{ProfileID: "p", Status: "draft"}, 2},
		"search":         {LibraryQuery{ProfileID: "p", Q: "PIPELINE"}, 1},
		"search a post":  {LibraryQuery{ProfileID: "p", Q: "words"}, 1},
		"no match":       {LibraryQuery{ProfileID: "p", Q: "zzz"}, 0},
		"other brand":    {LibraryQuery{ProfileID: "q"}, 1},
		"articles never": {LibraryQuery{ProfileID: "p", Kind: "article", Status: "published"}, 0},
	} {
		if got := count(tc.q); got != tc.want {
			t.Errorf("%s: %d, want %d", name, got, tc.want)
		}
	}
	if _, err := l.lib.List(ctx, LibraryQuery{}); err == nil {
		t.Error("a query with no brand should be refused")
	}
	if _, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Kind: "video"}); err == nil {
		t.Error("an unknown kind should be refused")
	}
}

func TestLibraryPagesWithACursorAndNothingSkippedOrRepeated(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	for i := 0; i < 7; i++ {
		l.draft(t, "p", "post", docOf(para(fmt.Sprintf("Draft number %d", i))))
		l.advance(time.Second)
	}
	var seen []string
	before := ""
	for pages := 0; pages < 10; pages++ {
		p, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Limit: 3, Before: before})
		if err != nil {
			t.Fatal(err)
		}
		for _, it := range p.Items {
			seen = append(seen, it.Title)
		}
		if p.Next == "" {
			break
		}
		before = p.Next
	}
	if len(seen) != 7 || seen[0] != "Draft number 6" || seen[6] != "Draft number 0" {
		t.Fatalf("%v", seen)
	}
}

func TestLibraryTitleAndExcerptFromAnyKindOfText(t *testing.T) {
	long := strings.Repeat("word ", 40)
	title, excerpt := titleAndExcerpt([]string{long})
	if len([]rune(title)) > titleChars+1 || !strings.HasSuffix(title, "…") || excerpt == "" {
		t.Fatalf("%q / %q", title, excerpt)
	}
	if title, excerpt := titleAndExcerpt([]string{"", "  ", "Only line"}); title != "Only line" || excerpt != "" {
		t.Fatalf("%q / %q", title, excerpt)
	}
	if title, excerpt := titleAndExcerpt(nil); title != "" || excerpt != "" {
		t.Fatalf("%q / %q", title, excerpt)
	}
}
