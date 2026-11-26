package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

func TestTheAssistantIsToldWhereThingsStandAndOnlyWhatThePersonChanged(t *testing.T) {
	spy := &spyAgent{out: agent.Output{Reply: "Done."}}
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	s := New(c.db)
	c.Studio = s
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	conv, _ := c.Start(ctx, "p", "", "")
	_, emit := collect()
	send := func(words string, req ChatRequest) *agent.Studio {
		t.Helper()
		if err := c.SendWith(ctx, conv.ID, words, req, emit); err != nil {
			t.Fatal(err)
		}
		return spy.inputs[len(spy.inputs)-1].Studio
	}

	st := send("Write both", ChatRequest{Write: []string{"article", "post", "nonsense"}, Viewing: "post"})
	if st.PostID == "" || st.ArticleID == "" || strings.Join(st.Grade, ",") != "post,article" || len(st.Cards) != 2 || len(st.Changes) != 0 || st.Viewing != "post" {
		t.Fatalf("%+v", st)
	}
	got, _ := c.Get(ctx, conv.ID)
	if got.PostDraftID != st.PostID || got.ArticleDraftID != st.ArticleID {
		t.Fatalf("the drafts made are the conversation's: %+v", got)
	}
	// nothing changed: no cards again, nothing to report, no second grading
	again := send("Shorter please", ChatRequest{Write: []string{"post"}})
	if again.PostID != st.PostID || len(again.Grade) != 0 || len(again.Cards) != 0 || len(again.Changes) != 0 {
		t.Fatalf("%+v", again)
	}
	// the person changes the text and the card by hand
	d, _ := s.GetDraft(ctx, st.PostID)
	body := "Typed by hand."
	if _, _, err := s.PatchDraft(ctx, d.ID, DraftPatch{Revision: d.Revision, Body: &body}); err != nil {
		t.Fatal(err)
	}
	title := "Mine"
	if _, _, _, err := s.PatchCardText(ctx, d.ID, CardText{Headline: &title}); err != nil {
		t.Fatal(err)
	}
	changed := send("Carry on", ChatRequest{})
	if len(changed.Changes) != 1 || changed.Changes[0].DraftID != d.ID || strings.Join(changed.Changes[0].Lines, "; ") != `body: changed; headline: "Mine"` {
		t.Fatalf("%+v", changed.Changes)
	}
	if after := send("And again", ChatRequest{}); len(after.Changes) != 0 {
		t.Fatalf("reported once: %+v", after.Changes)
	}
	// a deleted item is no longer the conversation's, and ticking it makes a new one that is graded no more
	if err := s.DeleteDraft(ctx, st.PostID); err != nil {
		t.Fatal(err)
	}
	if next := send("A new post", ChatRequest{Write: []string{"post"}}); next.PostID == "" || next.PostID == st.PostID || len(next.Grade) != 0 || len(next.Cards) != 1 {
		t.Fatalf("%+v", next)
	}
}

func TestAServerWithNoAssistantSaysSoAndKeepsNothing(t *testing.T) {
	c, ctx := newChat(t, agent.None{}, &fakeFetcher{}), context.Background()
	conv, _ := c.Start(ctx, "p", "", pasted)
	_, emit := collect()
	err := c.Send(ctx, conv.ID, "hello", emit)
	var ae *AgentError
	if !errors.As(err, &ae) || !strings.Contains(ae.Msg, "No assistant is set up") {
		t.Fatalf("%v", err)
	}
	if got, _ := c.Get(ctx, conv.ID); len(got.Messages) != 0 || got.Agent.Ready {
		t.Fatalf("%+v", got)
	}
}

// The assistant's key sees only its owner's brands, so asking it to work elsewhere is refused before anything happens.
func TestTheAssistantWorksOnlyInTheAskersOwnBrands(t *testing.T) {
	spy := &spyAgent{out: agent.Output{Reply: "Done."}}
	c := newChat(t, spy, &fakeFetcher{})
	c.Studio, c.OwnBrandsOnly = New(c.db), true
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('mine', 'me', '{}', 0, ''), ('theirs', 'them', '{}', 1, '')`); err != nil {
		t.Fatal(err)
	}
	admin := WithPrincipal(context.Background(), Principal{User: &User{ID: "me", Roles: []string{RoleAdmin}}})
	_, emit := collect()
	for brand, allowed := range map[string]bool{"mine": true, "theirs": false} {
		conv, err := c.Start(admin, brand, "", "")
		if err != nil {
			t.Fatal(err)
		}
		err = c.SendWith(admin, conv.ID, "Write it", ChatRequest{Write: []string{"post"}}, emit)
		got, _ := c.Get(admin, conv.ID)
		if allowed && (err != nil || got.PostDraftID == "") {
			t.Errorf("own brand: %v %+v", err, got)
		}
		if !allowed && (err == nil || !strings.Contains(err.Error(), "your own brands") || len(got.Messages) != 0 || got.PostDraftID != "") {
			t.Errorf("someone else's brand: %v %+v", err, got)
		}
	}
}

// A draft made for the assistant starts empty: it does not carry the words of the last card.
func TestAnAssistantsNewDraftHasAnEmptyCard(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	s := New(c.db)
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	old := defaultCard()
	old.Title, old.Eyebrow, old.Footer, old.Photos = "Last week", "News", "@me", []string{}
	raw, _ := json.Marshal(old)
	if _, err := c.db.Exec(`INSERT INTO designs (profile_id, data, updated_at) VALUES ('p', ?, '')`, string(raw)); err != nil {
		t.Fatal(err)
	}
	d, err := s.NewAssistantDraft(ctx, "p", KindPost)
	if err != nil {
		t.Fatal(err)
	}
	card, _, err := s.Card(ctx, d.ID)
	if err != nil || card.Title != "" || card.Eyebrow != "" || card.Footer != "@me" || card.Layout != old.Layout {
		t.Fatalf("%v %+v", err, card)
	}
}
