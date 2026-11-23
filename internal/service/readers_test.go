package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

func TestDraftTextReadsTheEditorDocument(t *testing.T) {
	doc := `{"type":"doc","content":[
	  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Title"}]},
	  {"type":"paragraph","content":[{"type":"text","text":"Line one"},{"type":"hardBreak"},{"type":"text","text":"line two","marks":[{"type":"bold"}]}]},
	  {"type":"paragraph"},
	  {"type":"bulletList","content":[
	    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"first"}]}]},
	    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"second"}]},
	      {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"nested"}]}]}]}]}]},
	  {"type":"orderedList","attrs":{"start":3},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"third"}]}]}]},
	  {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"quoted"}]}]}]}`
	want := "## Title\n\nLine one\nline two\n\n- first\n- second\n  - nested\n\n3. third\n\nquoted"
	if got := DraftText(json.RawMessage(doc)); got != want {
		t.Fatalf("got:\n%q\nwant:\n%q", got, want)
	}
	for _, bad := range []string{``, `nope`, `{"type":"doc"}`, `{"type":"doc","content":[{"type":"paragraph"}]}`} {
		if got := DraftText(json.RawMessage(bad)); got != "" {
			t.Errorf("%q -> %q, want empty", bad, got)
		}
	}
}

func TestProfilesAreSummarisedWithoutTheirImages(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	big := strings.Repeat("A", 50_000)
	prof := `{"id":"p","name":"Me","displayName":"Mee","handle":"@me","website":"me.dev","logoImage":"data:image/png;base64,` + big + `","headshot":"` + big + `",
	  "palettes":[{"id":"ink","name":"Ink","base":"#000","fade":"#111","accent":"#0f0","text":"#fff","sub":"#0f0"}]}`
	if err := s.ReplaceProfiles(ctx, []json.RawMessage{json.RawMessage(prof)}); err != nil {
		t.Fatal(err)
	}
	got, err := s.Profiles(ctx)
	if err != nil || len(got) != 1 {
		t.Fatalf("%v %+v", err, got)
	}
	b, _ := json.Marshal(got)
	if got[0].ID != "p" || got[0].Handle != "@me" || len(got[0].Palettes) != 1 || got[0].Palettes[0].Accent != "#0f0" || len(b) > 1000 {
		t.Fatalf("the summary must be small and have no images (%d bytes): %s", len(b), b)
	}
	none, _ := newStudio(t).Profiles(ctx)
	if none == nil || len(none) != 0 {
		t.Fatal("no profiles must be [] not nil")
	}
}

/* ------------------------------------------------------------ proposals from an outside agent */

func ext(profile, title string) ExternalProposal {
	return ExternalProposal{ProfileID: profile, Caller: "Claude Desktop 1.0", Proposal: agent.Proposal{Kind: "post", Title: title, Body: "Hello from outside.", Hashtags: []string{"Go"}, AltText: "alt"}}
}

func TestAnOutsideProposalWaitsForApprovalAndChangesNoDraft(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	studio := New(c.db)
	d, err := studio.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"my own words"}]}]}`)})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := studio.GetDraft(ctx, d.ID)

	v, err := c.Propose(ctx, ext("p", "An idea"))
	if err != nil || v.Status != ProposalPending || v.Title != "An idea" || v.Body != "Hello from outside." {
		t.Fatalf("%v %+v", err, v)
	}
	after, _ := studio.GetDraft(ctx, d.ID)
	if string(after.Doc) != string(before.Doc) || after.UpdatedAt != before.UpdatedAt {
		t.Fatal("a proposal must not change any draft")
	}
	conv, err := c.Get(ctx, v.ConversationID)
	if err != nil || conv.SourceKind != "mcp" || conv.SourceTitle != "Claude Desktop 1.0" || conv.Pending != 1 || len(conv.Messages) != 1 || !strings.Contains(conv.Messages[0].Content, "Nothing changes until you approve it") {
		t.Fatalf("%v %+v", err, conv)
	}
	got, err := c.Proposal(ctx, v.ID)
	if err != nil || got.Status != ProposalPending {
		t.Fatalf("%v %+v", err, got)
	}
	// the person approves it the same way as a chat proposal, and the agent can see the outcome
	if _, err := c.Decide(ctx, v.ID, Decision{Status: ProposalApproved, DraftID: "d9"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := c.Proposal(ctx, v.ID); got.Status != ProposalApproved || got.DraftID != "d9" {
		t.Fatalf("%+v", got)
	}
	if _, err := c.Proposal(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
}

func TestOutsideProposalsAreValidatedLikeAgentOutput(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	for name, mut := range map[string]func(*ExternalProposal){
		"no profile": func(e *ExternalProposal) { e.ProfileID = "" },
		"bad kind":   func(e *ExternalProposal) { e.Proposal.Kind = "tweet" },
		"no body":    func(e *ExternalProposal) { e.Proposal.Body = " " },
		"bad tag":    func(e *ExternalProposal) { e.Proposal.Hashtags = []string{"two words"} },
		"too long":   func(e *ExternalProposal) { e.Proposal.Body = strings.Repeat("a", 3001) },
	} {
		e := ext("p", "t")
		mut(&e)
		if _, err := c.Propose(ctx, e); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", name, err)
		}
	}
}

func TestAnAgentCannotBuryThePersonInProposals(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	for i := 0; i < maxPendingExternal; i++ {
		if _, err := c.Propose(ctx, ext("p", "t")); err != nil {
			t.Fatalf("proposal %d: %v", i, err)
		}
	}
	if _, err := c.Propose(ctx, ext("p", "one too many")); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "review") {
		t.Fatalf("%v", err)
	}
	if _, err := c.Propose(ctx, ext("other-profile", "fine")); err != nil {
		t.Fatalf("the cap is per profile: %v", err)
	}
}

func TestFollowUpProposalsStayInTheAgentsOwnConversation(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{out: agent.Output{Reply: "ok"}}, &fakeFetcher{}), context.Background()
	first, _ := c.Propose(ctx, ext("p", "v1"))
	e := ext("p", "v2")
	e.ConversationID = first.ConversationID
	second, err := c.Propose(ctx, e)
	if err != nil || second.ConversationID != first.ConversationID {
		t.Fatalf("%v %+v", err, second)
	}
	conv, _ := c.Get(ctx, first.ConversationID)
	if len(conv.Messages) != 2 || len(conv.Proposals) != 2 || conv.Proposals[0].Status != ProposalSuperseded || conv.Proposals[1].Status != ProposalPending {
		t.Fatalf("%+v", conv)
	}
	// it may not write into somebody else's conversation, or a person's own chat
	own, _ := c.Start(ctx, "p", "", pasted)
	e.ConversationID = own.ID
	if _, err := c.Propose(ctx, e); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a person's own chat is off limits: %v", err)
	}
	e.ConversationID, e.ProfileID = first.ConversationID, "different"
	if _, err := c.Propose(ctx, e); !errors.Is(err, ErrInvalid) {
		t.Fatalf("another profile's conversation: %v", err)
	}
	e.ConversationID, e.ProfileID = "nope", "p"
	if _, err := c.Propose(ctx, e); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	// and the person cannot "chat" into an outside agent's thread: there is no agent here to answer
	if err := c.Send(ctx, first.ConversationID, "hello", func(ChatEvent) {}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("%v", err)
	}
}

func TestCallerLabelsAreCleaned(t *testing.T) {
	for in, want := range map[string]string{"": "An outside agent", "  \n\t": "An outside agent", "Claude\x00 \nDesktop   1.0": "Claude Desktop 1.0", strings.Repeat("x", 200): strings.Repeat("x", 80)} {
		if got := callerLabel(in); got != want {
			t.Errorf("callerLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPendingCountsShowInTheList(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	v, _ := c.Propose(ctx, ext("p", "t"))
	list, err := c.List(ctx, "p")
	if err != nil || len(list) != 1 || list[0].Pending != 1 {
		t.Fatalf("%v %+v", err, list)
	}
	_, _ = c.Decide(ctx, v.ID, Decision{Status: ProposalRejected})
	if list, _ = c.List(ctx, "p"); list[0].Pending != 0 {
		t.Fatalf("a decided proposal is no longer pending: %+v", list)
	}
}
