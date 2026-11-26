package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// writer is a chat whose assistant does what each test says while it replies.
type writer struct {
	t    *testing.T
	c    *Chat
	s    *Studio
	ctx  context.Context
	conv string
	do   func(st *agent.Studio)
}

func newWriter(t *testing.T) *writer {
	t.Helper()
	w := &writer{t: t, ctx: context.Background()}
	a := working{&spyAgent{}, func(in agent.Input, _ func(agent.Event)) (agent.Output, error) {
		w.do(in.Studio)
		return agent.Output{Reply: "Done."}, nil
	}}
	w.c = newChat(t, a, &fakeFetcher{})
	w.s = New(w.c.db)
	w.c.Studio = w.s
	if _, err := w.c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	conv, err := w.c.Start(w.ctx, "p", "", "")
	if err != nil {
		t.Fatal(err)
	}
	w.conv = conv.ID
	return w
}

// reply sends a message during which the assistant does do, and returns the conversation and the reply's id.
func (w *writer) reply(do func(st *agent.Studio)) (Conversation, string) {
	w.t.Helper()
	w.do = do
	_, emit := collect()
	if err := w.c.SendWith(w.ctx, w.conv, "go", ChatRequest{Write: []string{"post"}}, emit); err != nil {
		w.t.Fatal(err)
	}
	got, err := w.c.Get(w.ctx, w.conv)
	if err != nil {
		w.t.Fatal(err)
	}
	return got, got.Messages[len(got.Messages)-1].ID
}

func (w *writer) body(id, text string) {
	w.t.Helper()
	d := w.draft(id)
	if _, _, err := w.s.PatchDraft(w.ctx, id, DraftPatch{Revision: d.Revision, Body: &text}); err != nil {
		w.t.Fatal(err)
	}
}

func (w *writer) draft(id string) Draft {
	w.t.Helper()
	d, err := w.s.GetDraft(w.ctx, id)
	if err != nil {
		w.t.Fatal(err)
	}
	return d
}

func (w *writer) versions(id string) []Version {
	w.t.Helper()
	v, err := w.s.Versions(w.ctx, id)
	if err != nil {
		w.t.Fatal(err)
	}
	return v
}

// type_ is the person typing in the studio.
func (w *writer) typed(id, text string) {
	w.t.Helper()
	in := inputOf(w.draft(id))
	in.Doc = DocFromText(text, KindPost)
	if _, err := w.s.UpdateDraft(w.ctx, id, in); err != nil {
		w.t.Fatal(err)
	}
}

func statuses(c Conversation) string {
	var out []string
	for _, ch := range c.Changes {
		out = append(out, ch.Status)
	}
	return strings.Join(out, " ")
}

func TestAChatChangeBecomesAVersionOnlyWhenSaved(t *testing.T) {
	w := newWriter(t)
	var id string
	got, first := w.reply(func(st *agent.Studio) {
		id = st.PostID
		w.body(id, "One.")
		title := "A headline"
		if _, _, _, err := w.s.PatchCardText(w.ctx, id, CardText{Headline: &title}); err != nil {
			t.Fatal(err)
		}
	})
	before := len(w.versions(id))
	if before != 1 || statuses(got) != "pending" || DraftText(w.draft(id).Doc) != "One." {
		t.Fatal(before, statuses(got))
	}
	got, err := w.c.SaveReply(w.ctx, w.conv, first, SaveRequest{Revisions: map[string]int{id: w.draft(id).Revision}})
	if err != nil {
		t.Fatal(err)
	}
	if v := w.versions(id); len(v) != before+1 || statuses(got) != "saved" || got.Changes[0].Version != v[0].Seq || !w.draft(id).VersionIsCurrent {
		t.Fatal(v, got.Changes)
	}
	if _, err := w.c.Undo(w.ctx, w.conv, first); !errors.Is(err, ErrConflict) {
		t.Fatal("a saved reply is not undone", err)
	}
}

func TestUndoPutsBackOneReply(t *testing.T) {
	w := newWriter(t)
	var id string
	_, first := w.reply(func(st *agent.Studio) { id = st.PostID; w.body(id, "One.") })
	got, second := w.reply(func(*agent.Studio) { w.body(id, "Two."); w.body(id, "Two, again.") })
	if statuses(got) != "passed pending" || len(w.versions(id)) != 1 {
		t.Fatal(statuses(got), len(w.versions(id)))
	}
	if _, err := w.c.Undo(w.ctx, w.conv, first); !errors.Is(err, ErrConflict) {
		t.Fatal("only the latest can be undone", err)
	}
	got, err := w.c.Undo(w.ctx, w.conv, second)
	if err != nil || statuses(got) != "passed undone" || DraftText(w.draft(id).Doc) != "One." || len(w.versions(id)) != 1 {
		t.Fatal(err, statuses(got), len(w.versions(id)))
	}
	// when a version held the state put back, it is current again
	_, third := w.reply(func(*agent.Studio) { w.body(id, "Kept.") })
	if _, err := w.c.SaveReply(w.ctx, w.conv, third, SaveRequest{}); err != nil {
		t.Fatal(err)
	}
	_, fourth := w.reply(func(*agent.Studio) { w.body(id, "Dropped.") })
	if _, err := w.c.Undo(w.ctx, w.conv, fourth); err != nil || !w.draft(id).VersionIsCurrent {
		t.Fatal(err, w.draft(id).VersionIsCurrent)
	}
	// what was put back was the assistant's, so the next change keeps no version of it
	w.reply(func(*agent.Studio) { w.body(id, "Three.") })
	if n := len(w.versions(id)); n != 2 {
		t.Fatal(n)
	}
}

func TestWhatThePersonTypedIsKept(t *testing.T) {
	w := newWriter(t)
	var id string
	w.reply(func(st *agent.Studio) { id = st.PostID; w.body(id, "One.") })
	w.typed(id, "Mine.")
	held := w.draft(id).VersionIsCurrent
	n := len(w.versions(id))
	_, second := w.reply(func(*agent.Studio) { w.body(id, "Two.") })
	v := w.versions(id)
	want := n
	if !held {
		want++
	}
	full, err := w.s.Version(w.ctx, id, v[0].Seq)
	if err != nil || len(v) != want || DraftText(full.Doc) != "Mine." {
		t.Fatal(err, held, n, v)
	}
	// typing after a reply means it can no longer be undone
	w.typed(id, "Mine again.")
	if _, err := w.c.Undo(w.ctx, w.conv, second); !errors.Is(err, ErrConflict) || DraftText(w.draft(id).Doc) != "Mine again." {
		t.Fatal(err)
	}
}

func TestOptionsArePickedAndSaved(t *testing.T) {
	w := newWriter(t)
	var id string
	offer := []ChoiceSet{{Field: "headline", Options: []Option{{Value: "Short contracts"}, {Value: "From 11 to 2", Note: "the number"}}},
		{Field: "hashtags", Options: []Option{{Value: []any{"data", "contracts"}}, {Value: []any{"#Quality"}}}}}
	got, first := w.reply(func(st *agent.Studio) {
		id = st.PostID
		w.body(id, "One.")
		for _, bad := range [][]ChoiceSet{
			{{Field: "body", Options: offer[0].Options}},
			{{Field: "summary", Options: offer[0].Options}},
			{{Field: "headline", Options: offer[0].Options[:1]}},
			{{Field: "headline", Options: []Option{{Value: "Same"}, {Value: "Same"}}}},
			{{Field: "headline", Options: []Option{{Value: "Fine"}, {Value: strings.Repeat("x", 500)}}}},
		} {
			if err := w.s.OfferChoices(w.ctx, w.conv, id, bad); err == nil {
				t.Fatalf("accepted %+v", bad[0].Field)
			}
		}
		if err := w.s.OfferChoices(w.ctx, "another", id, offer); err == nil {
			t.Fatal("another conversation")
		}
		if err := w.s.OfferChoices(w.ctx, w.conv, id, offer); err != nil {
			t.Fatal(err)
		}
	})
	if len(got.Choices) != 2 || got.Choices[0].MessageID != first || got.Choices[0].Status != ChoicePending || got.Choices[0].Chosen != -1 {
		t.Fatalf("%+v", got.Choices)
	}
	picks := []Pick{{got.Choices[0].ID, 1}, {got.Choices[1].ID, 1}}
	if _, err := w.c.SaveReply(w.ctx, w.conv, first, SaveRequest{Picks: picks, Revisions: map[string]int{id: 1}}); !errors.Is(err, ErrStale) {
		t.Fatal("a stale screen", err)
	}
	before := len(w.versions(id))
	got, err := w.c.SaveReply(w.ctx, w.conv, first, SaveRequest{Picks: picks, Revisions: map[string]int{id: w.draft(id).Revision}})
	if err != nil {
		t.Fatal(err)
	}
	card, d, _ := w.s.Card(w.ctx, id)
	if card.Title != "From 11 to 2" || strings.Join(d.Hashtags, ",") != "Quality" || len(w.versions(id)) != before+1 ||
		got.Choices[0].Status != ChoiceChosen || got.Choices[0].Chosen != 1 || statuses(got) != "saved" {
		t.Fatalf("%q %v %+v %s", card.Title, d.Hashtags, got.Choices, statuses(got))
	}
	// any card text can be offered, and an empty one takes it off; a headline stays
	_, last := w.reply(func(*agent.Studio) {
		if err := w.s.OfferChoices(w.ctx, w.conv, id, []ChoiceSet{{Field: "headline", Options: []Option{{Value: "Kept"}, {Value: ""}}}}); err == nil {
			t.Fatal("a card keeps a headline")
		}
		var sets []ChoiceSet
		for _, f := range []string{"eyebrow", "subtitle", "tag", "footer", "footerLeft", "quoteAuthor", "statValue"} {
			sets = append(sets, ChoiceSet{Field: f, Options: []Option{{Value: "x " + f}, {Value: ""}}})
		}
		if err := w.s.OfferChoices(w.ctx, w.conv, id, sets); err != nil {
			t.Fatal(err)
		}
		eyebrow := "Field notes"
		if _, _, _, err := w.s.PatchCardText(w.ctx, id, CardText{Eyebrow: &eyebrow}); err != nil {
			t.Fatal(err)
		}
	})
	got, _ = w.c.Get(w.ctx, w.conv)
	var picks2 []Pick
	for _, c := range got.Choices {
		if c.MessageID == last {
			picks2 = append(picks2, Pick{c.ID, map[bool]int{true: 1, false: 0}[c.Field == "eyebrow"]})
		}
	}
	if _, err := w.c.SaveReply(w.ctx, w.conv, last, SaveRequest{Picks: picks2}); err != nil {
		t.Fatal(err)
	}
	if card, _, _ = w.s.Card(w.ctx, id); card.Eyebrow != "" || card.Subtitle != "x subtitle" || card.Footer != "x footer" || card.StatValue != "x statValue" {
		t.Fatalf("%+v", card)
	}
	// a newer offer for the same field replaces the old one
	got, _ = w.reply(func(*agent.Studio) {
		if err := w.s.OfferChoices(w.ctx, w.conv, id, offer[:1]); err != nil {
			t.Fatal(err)
		}
	})
	if len(got.Choices) != 10 || got.Choices[9].Status != ChoicePending || got.Choices[0].Status != ChoiceSuperseded {
		t.Fatalf("%+v", got.Choices)
	}
	if err := w.s.OfferChoices(w.ctx, w.conv, id, offer); err == nil {
		t.Fatal("no reply is being written")
	}
}

func TestAnItemMadeDuringAReplyWaitsToBeSavedToo(t *testing.T) {
	w := newWriter(t)
	var article string
	got, last := w.reply(func(*agent.Studio) {
		d, err := w.s.NewAssistantDraft(w.ctx, "p", KindArticle)
		if err != nil {
			t.Fatal(err)
		}
		article = d.ID
		if err := w.s.JoinReply(w.ctx, w.conv, article); err != nil {
			t.Fatal(err)
		}
		w.body(article, "An article.")
	})
	if got.ArticleDraftID != article || len(w.versions(article)) != 1 || statuses(got) != "pending" {
		t.Fatal(got.ArticleDraftID, len(w.versions(article)), statuses(got))
	}
	if _, err := w.c.Undo(w.ctx, w.conv, last); err != nil || DraftText(w.draft(article).Doc) != "" {
		t.Fatal(err)
	}
	// outside a reply, an assistant's change is still a version
	w.body(article, "From outside.")
	if len(w.versions(article)) < 2 {
		t.Fatal(w.versions(article))
	}
}

// Asked to clear a field, the assistant clears that one, whoever filled it; what was there is kept as a version.
func TestClearingOneFieldLeavesTheOthersAsThePersonTypedThem(t *testing.T) {
	w := newWriter(t)
	var id string
	w.reply(func(st *agent.Studio) { id = st.PostID; w.body(id, "One.") })
	card, d, err := w.s.Card(w.ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	card.Eyebrow, card.Title, card.Subtitle, card.Footer = "Typed eyebrow", "Typed headline", "Typed subtitle", "Typed footer"
	in := inputOf(d)
	in.Design, _ = json.Marshal(card)
	if _, err := w.s.UpdateDraft(w.ctx, id, in); err != nil {
		t.Fatal(err)
	}
	_, last := w.reply(func(*agent.Studio) {
		empty := ""
		if _, _, _, err := w.s.PatchCardText(w.ctx, id, CardText{Eyebrow: &empty}); err != nil {
			t.Fatal(err)
		}
	})
	if card, _, _ = w.s.Card(w.ctx, id); card.Eyebrow != "" || card.Title != "Typed headline" || card.Subtitle != "Typed subtitle" || card.Footer != "Typed footer" {
		t.Fatalf("%+v", card)
	}
	if _, err := w.c.Undo(w.ctx, w.conv, last); err != nil {
		t.Fatal(err)
	}
	if card, _, _ = w.s.Card(w.ctx, id); card.Eyebrow != "Typed eyebrow" {
		t.Fatalf("%+v", card)
	}
}

func TestEmptiedFooterStaysEmpty(t *testing.T) {
	c := defaultCard()
	c.emptied("footerLeft", "")
	c.emptied("footer", "me")
	raw, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ParseCardDesign(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !got.NoFooterLeft || got.NoFooter || !strings.Contains(string(raw), `"footerLeft":""`) {
		t.Fatalf("got %s", raw)
	}
}
