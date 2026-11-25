package service

import (
	"context"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// A conversation points at one post and one article, only ever of its own brand, and forgets a deleted one.
func TestConversationLinksItsPostAndArticle(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{out: agent.Output{Reply: "Here.", Proposal: goodProposal()}}, &fakeFetcher{}), context.Background()
	s := New(c.db)
	mk := func(brand, kind string) Draft {
		t.Helper()
		in := input()
		in.ProfileID, in.Kind = brand, kind
		d, err := s.CreateDraft(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		return d
	}
	post, article, other := mk("p", KindPost), mk("p", KindArticle), mk("q", KindPost)
	conv, err := c.Start(ctx, "p", "", pasted)
	if err != nil {
		t.Fatal(err)
	}
	links := func() (string, string) {
		t.Helper()
		v, err := c.Get(ctx, conv.ID)
		if err != nil {
			t.Fatal(err)
		}
		return v.PostDraftID, v.ArticleDraftID
	}

	if v, err := c.Link(ctx, conv.ID, post.ID); err != nil || v.PostDraftID != post.ID || v.ArticleDraftID != "" {
		t.Fatalf("link post: %v %+v", err, v)
	}
	for _, id := range []string{other.ID, "missing", ""} { // another brand's, or nothing
		if _, err := c.Link(ctx, conv.ID, id); err != nil {
			t.Fatal(err)
		}
	}
	if p, a := links(); p != post.ID || a != "" {
		t.Fatalf("a foreign draft changed the links: %q %q", p, a)
	}

	// approving a proposal into a draft links it, by the draft's kind
	ev, emit := collect()
	if err := c.Send(ctx, conv.ID, "", emit); err != nil {
		t.Fatalf("%v %v", err, ev)
	}
	got, _ := c.Get(ctx, conv.ID)
	if _, err := c.Decide(ctx, got.Proposals[0].ID, Decision{Status: ProposalApproved, DraftID: article.ID}); err != nil {
		t.Fatal(err)
	}
	if p, a := links(); p != post.ID || a != article.ID {
		t.Fatalf("after approval: %q %q", p, a)
	}
	list, err := c.List(ctx, "p")
	if err != nil || list[0].PostDraftID != post.ID || list[0].ArticleDraftID != article.ID {
		t.Fatalf("the list carries the links: %v %+v", err, list)
	}

	if err := s.DeleteDraft(ctx, post.ID); err != nil {
		t.Fatal(err)
	}
	if p, a := links(); p != "" || a != article.ID {
		t.Fatalf("after delete: %q %q", p, a)
	}
}
