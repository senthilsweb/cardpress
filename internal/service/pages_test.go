package service

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
)

var tinyPNG = append(append([]byte{}, pngSignature...), 0, 0, 0, 13, 'I', 'H', 'D', 'R', 0, 0, 4, 176, 0, 0, 2, 115, 8, 6, 0, 0, 0)

func TestSlugify(t *testing.T) {
	for in, want := range map[string]string{
		"Bank Statements to Cash-Flow Insight — The AI Never Touches a Number": "bank-statements-to-cash-flow-insight-the-ai-never-touches-a-number",
		"  Café au lait!  ": "cafe-au-lait",
		"C++ & Go":          "c-go",
		"日本語":               "",
		"---":               "",
	} {
		if got := Slugify(in); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
	if long := Slugify(strings.Repeat("word ", 40)); len(long) > maxSlugLen || strings.HasSuffix(long, "-") {
		t.Errorf("%q", long)
	}
}

func TestAPageNeedsAnApprovedItemAndTakesItsAddressFromTheTitle(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Title: "A Fine Title", Doc: docOf(heading("A Fine Title"), para("Text."))})
	if _, err := l.st.PublishPage(ctx, d.ID, PageInput{}); !errors.Is(err, ErrConflict) {
		t.Fatalf("an unapproved item has no page: %v", err)
	}
	l.st.Approve(ctx, d.ID)
	p, err := l.st.PublishPage(ctx, d.ID, PageInput{Summary: "  A short  description "})
	if err != nil || p.Slug != "a-fine-title" || p.PageAt == "" || p.Summary != "A short description" || p.HasCover {
		t.Fatalf("%+v %v", p, err)
	}
	// publishing again keeps the address and the time it first went live
	again, err := l.st.PublishPage(ctx, d.ID, PageInput{Cover: tinyPNG})
	if err != nil || again.Slug != p.Slug || again.PageAt != p.PageAt || !again.HasCover {
		t.Fatalf("%+v %v", again, err)
	}
	off, _ := l.st.UnpublishPage(ctx, d.ID)
	if off.PageAt != "" || off.Slug != "a-fine-title" {
		t.Fatalf("taking a page down keeps its address: %+v", off)
	}
}

func TestAddressesAreUniquePerKindAndATypedOneIsRefusedNotChanged(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	mk := func(kind, title string) Draft {
		d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: kind, Title: title, Doc: docOf(para(title))})
		l.st.Approve(ctx, d.ID)
		return d
	}
	a, b := mk("article", "Same Title"), mk("article", "Same Title")
	pa, _ := l.st.PublishPage(ctx, a.ID, PageInput{})
	pb, err := l.st.PublishPage(ctx, b.ID, PageInput{})
	if err != nil || pa.Slug != "same-title" || pb.Slug != "same-title-2" {
		t.Fatalf("%q %q %v", pa.Slug, pb.Slug, err)
	}
	// a post may use an article's address: they live under different paths
	post := mk("post", "Same Title")
	if pp, err := l.st.PublishPage(ctx, post.ID, PageInput{Slug: "same-title"}); err != nil || pp.Slug != "same-title" {
		t.Fatalf("%+v %v", pp, err)
	}
	third := mk("article", "Another")
	if _, err := l.st.PublishPage(ctx, third.ID, PageInput{Slug: "same-title"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("a typed address already taken is refused: %v", err)
	}
	for _, bad := range []string{"Has Space", "UPPER", "a--b", "-a", "a-", "../x", strings.Repeat("a", maxSlugLen+1)} {
		if _, err := l.st.PublishPage(ctx, third.ID, PageInput{Slug: bad}); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q: %v", bad, err)
		}
	}
	if _, err := l.st.PublishPage(ctx, third.ID, PageInput{Cover: []byte("GIF89a")}); !errors.Is(err, ErrInvalid) {
		t.Errorf("a cover must be a PNG: %v", err)
	}
	if _, err := l.st.PublishPage(ctx, third.ID, PageInput{Summary: strings.Repeat("x", maxSummary+1)}); !errors.Is(err, ErrInvalid) {
		t.Errorf("a long description is refused: %v", err)
	}
	if _, err := l.st.PublishPage(ctx, "nope", PageInput{}); !errors.Is(err, ErrNotFound) {
		t.Errorf("%v", err)
	}
}

func TestALivePageCannotBeEditedAndGoesDownWithTheApproval(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Doc: docOf(para("Approved text"))})
	l.st.Approve(ctx, d.ID)
	l.st.PublishPage(ctx, d.ID, PageInput{Cover: tinyPNG})
	pages := NewPages(l.db.DB)
	if _, err := pages.Get(ctx, "article", "approved-text"); err != nil {
		t.Fatalf("the page is live: %v", err)
	}
	// saving the same text again changes nothing
	if _, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "article", Doc: docOf(para("Approved text"))}); err != nil {
		t.Fatal(err)
	}
	if _, err := pages.Get(ctx, "article", "approved-text"); err != nil {
		t.Fatalf("an unchanged save keeps the page up: %v", err)
	}
	// a published item is not edited: it comes back to draft first, which takes the page down with the stale cover
	edit := DraftInput{ProfileID: "p", Kind: "article", Doc: docOf(para("Edited text"))}
	if _, err := l.st.UpdateDraft(ctx, d.ID, edit); !errors.Is(err, ErrConflict) {
		t.Fatalf("a live page was edited: %v", err)
	}
	if _, err := pages.Get(ctx, "article", "approved-text"); err != nil {
		t.Fatalf("the refused change left the page up: %v", err)
	}
	if up, err := l.st.Unapprove(ctx, d.ID); err != nil || up.PageAt != "" || up.HasCover {
		t.Fatalf("%v %+v", err, up)
	}
	if _, err := pages.Get(ctx, "article", "approved-text"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a draft must not stay public: %v", err)
	}
	if _, err := l.st.UpdateDraft(ctx, d.ID, edit); err != nil {
		t.Fatalf("as a draft it can be edited: %v", err)
	}
	l.st.Approve(ctx, d.ID)
	l.st.PublishPage(ctx, d.ID, PageInput{})
	l.st.Unapprove(ctx, d.ID)
	if _, err := pages.Get(ctx, "article", "approved-text"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("taking approval back takes the page down: %v", err)
	}
}

func TestAPostThatWasSentLendsItsCardToItsPage(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Posted words"))})
	l.st.Approve(ctx, d.ID)
	in := JobInput{ProfileID: "p", DraftID: d.ID, Body: "Posted words", Image: append(append([]byte{}, pngSignature...), bytes.Repeat([]byte{1}, 64)...)}
	j, err := l.p.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	l.p.Execute(ctx, j.ID)
	p, err := l.st.PublishPage(ctx, d.ID, PageInput{})
	if err != nil || !p.HasCover {
		t.Fatalf("%+v %v", p, err)
	}
}

func TestOnlyLivePagesAreVisibleToThePublicReader(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	live, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Title: "Live", Doc: docOf(para("Live text"))})
	hidden, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Title: "Hidden", Doc: docOf(para("Hidden text"))})
	l.st.Approve(ctx, live.ID)
	l.st.Approve(ctx, hidden.ID)
	l.st.PublishPage(ctx, live.ID, PageInput{})
	l.st.PublishPage(ctx, hidden.ID, PageInput{})
	l.st.UnpublishPage(ctx, hidden.ID)
	pages := NewPages(l.db.DB)
	items, total, err := pages.List(ctx, "article", 1, 20)
	if err != nil || total != 1 || len(items) != 1 || items[0].Slug != "live" || items[0].Title != "Live" {
		t.Fatalf("%+v %d %v", items, total, err)
	}
	if _, err := pages.Get(ctx, "article", "hidden"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if _, err := pages.Get(ctx, "video", "live"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if e, _ := pages.Entries(ctx); len(e) != 1 {
		t.Fatalf("%+v", e)
	}
	// the draft that was never approved cannot be public even if its row were wrong
	if _, err := l.db.DB.Exec(`UPDATE drafts SET status = 'draft' WHERE id = ?`, live.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pages.Get(ctx, "article", "live"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a draft is never served: %v", err)
	}
}
