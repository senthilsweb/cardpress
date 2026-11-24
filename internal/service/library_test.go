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
	in := JobInput{Hashtags: []string{"Go"}, AltText: "a card", Image: testPNG}
	if draftID == "" {
		draftID = l.approvedDraft(profile)
	} else if _, err := l.st.Approve(context.Background(), draftID); err != nil {
		t.Fatal(err)
	}
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

func TestLibraryPagesWithATotalAndNothingSkippedOrRepeated(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	for i := 0; i < 23; i++ {
		l.draft(t, "p", "post", docOf(para(fmt.Sprintf("Draft number %02d", i))))
		l.advance(time.Second)
	}
	first, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p"})
	if err != nil || first.Total != 23 || first.Pages != 2 || first.Page != 1 || first.PageSize != 20 || len(first.Items) != 20 {
		t.Fatalf("%+v %v", first, err)
	}
	second, _ := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Page: 2})
	if len(second.Items) != 3 || second.Page != 2 {
		t.Fatalf("%+v", second)
	}
	// newest first, every row once across the pages
	var seen []string
	for _, p := range []LibraryPage{first, second} {
		for _, it := range p.Items {
			seen = append(seen, it.Title)
		}
	}
	if len(seen) != 23 || seen[0] != "Draft number 22" || seen[22] != "Draft number 00" {
		t.Fatalf("%v", seen)
	}
	// a page past the end shows the last one; a page size outside 10, 20, 50 is refused
	if past, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Page: 9, PageSize: 10}); err != nil || past.Page != 3 || len(past.Items) != 3 {
		t.Fatalf("%+v %v", past, err)
	}
	if _, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", PageSize: 7}); err == nil {
		t.Fatal("an odd page size should be refused")
	}
	if empty, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Q: "nothing like this"}); err != nil || empty.Total != 0 || empty.Pages != 1 || empty.Page != 1 || len(empty.Items) != 0 {
		t.Fatalf("%+v %v", empty, err)
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

func TestLibraryReadsRichArticlesTextWithoutTheirPicturesOrMarkup(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	cell := func(s string) string {
		return `{"type":"tableCell","content":[` + para(s) + `]}`
	}
	table := `{"type":"table","content":[{"type":"tableRow","content":[` + cell("Name") + `,` + cell("Rows") + `]},{"type":"tableRow","content":[` + cell("orders") + `,` + cell("12") + `]}]}`
	image := `{"type":"image","attrs":{"src":"data:image/png;base64,AAAA","alt":"a chart"}}`
	code := `{"type":"codeBlock","content":[{"type":"text","text":"select 1"}]}`
	a := l.draft(t, "p", "article", docOf(heading("Rich article"), para("Intro text."), image, code, table, `{"type":"horizontalRule"}`))
	page, err := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Q: "orders | 12"})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != a.ID {
		t.Fatalf("%+v %v", page, err)
	}
	got := page.Items[0]
	if got.Title != "Rich article" || strings.Contains(got.Excerpt, "base64") || !strings.Contains(got.Excerpt, "Intro text.") {
		t.Fatalf("%+v", got)
	}
	if txt := DraftText(a.Doc); strings.Contains(txt, "base64") || !strings.Contains(txt, "Name | Rows") {
		t.Fatalf("%q", txt)
	}
}

func TestALibraryRowUsesTheTitleThePersonWrote(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, err := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Title: "My own title", Doc: docOf(heading("My own title"), para("First paragraph of the body."))})
	if err != nil {
		t.Fatal(err)
	}
	page, _ := l.lib.List(ctx, LibraryQuery{ProfileID: "p"})
	if len(page.Items) != 1 || page.Items[0].ID != d.ID || page.Items[0].Title != "My own title" || page.Items[0].Excerpt != "First paragraph of the body." {
		t.Fatalf("%+v", page.Items)
	}
	// the title stays searchable even though the excerpt skips the line that repeats it
	if found, _ := l.lib.List(ctx, LibraryQuery{ProfileID: "p", Q: "my own title"}); len(found.Items) != 1 {
		t.Fatalf("a title search found %d", len(found.Items))
	}
}

func TestLibraryRowsCarryTheirDesignForAThumbnailUnlessItIsLarge(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	small, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("With a card")), Design: json.RawMessage(goodDesign)})
	l.advance(time.Second)
	bare, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("No card"))})
	l.advance(time.Second)
	big := strings.Replace(goodDesign, `"photos":[]`, `"photos":["data:image/png;base64,`+strings.Repeat("A", 70<<10)+`"]`, 1)
	large, err := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Heavy card")), Design: json.RawMessage(big)})
	if err != nil {
		t.Fatal(err)
	}
	page, _ := l.lib.List(ctx, LibraryQuery{ProfileID: "p"})
	by := map[string]LibraryItem{}
	for _, it := range page.Items {
		by[it.ID] = it
	}
	if !strings.Contains(string(by[small.ID].Design), `"layout":"hero"`) {
		t.Fatalf("a small design is listed: %s", by[small.ID].Design)
	}
	if len(by[bare.ID].Design) != 0 || len(by[large.ID].Design) != 0 {
		t.Fatal("a missing or large design is left out of the list")
	}
}
