package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// working is an assistant that saves to the studio while it replies, and then ends as told.
type working struct {
	*spyAgent
	do func(in agent.Input, emit func(agent.Event)) (agent.Output, error)
}

func (w working) Respond(ctx context.Context, in agent.Input, emit func(agent.Event)) (agent.Output, error) {
	w.spyAgent.mu.Lock()
	w.spyAgent.inputs = append(w.spyAgent.inputs, in)
	w.spyAgent.mu.Unlock()
	return w.do(in, emit)
}

func TestAReplyKeepsWhatHappenedAlsoWhenItFails(t *testing.T) {
	spy := &spyAgent{}
	var s *Studio
	fail := false
	body := 0
	w := working{spy, func(in agent.Input, emit func(agent.Event)) (agent.Output, error) {
		emit(agent.Event{Type: "progress", Text: "Reading the draft"})
		emit(agent.Event{Type: "progress", Text: "Reading the draft"})
		emit(agent.Event{Type: "progress", Text: "Saving the draft"})
		d, err := s.GetDraft(context.Background(), in.Studio.PostID)
		if err != nil {
			return agent.Output{}, err
		}
		body++
		text := strings.Repeat("Saved. ", body)
		if _, _, err := s.PatchDraft(context.Background(), d.ID, DraftPatch{Revision: d.Revision, Body: &text}); err != nil {
			return agent.Output{}, err
		}
		if fail {
			emit(agent.Event{Type: "delta", Text: "Half a sen"})
			return agent.Output{}, errors.New("upstream is down")
		}
		emit(agent.Event{Type: "check", Check: &agent.Check{Kind: "post", Passed: true, Round: 1}})
		return agent.Output{}, nil // the check and the save are the whole reply
	}}
	c, ctx := newChat(t, w, &fakeFetcher{}), context.Background()
	s = New(c.db)
	c.Studio = s
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	conv, _ := c.Start(ctx, "p", "", "")
	_, emit := collect()
	if err := c.SendWith(ctx, conv.ID, "Write a post", ChatRequest{Write: []string{"post"}}, emit); err != nil {
		t.Fatal(err)
	}
	got, _ := c.Get(ctx, conv.ID)
	d := got.Messages[1].Detail
	if got.Messages[1].Status != ReplyDone || d == nil || strings.Join(d.Steps, "; ") != "Reading the draft; Saving the draft" ||
		len(d.Checks) != 1 || !d.Checks[0].Passed || len(d.Saved) != 1 || d.Saved[0].DraftID != got.PostDraftID || d.Saved[0].Kind != "post" || d.Saved[0].Version != 2 {
		t.Fatalf("%+v %+v", got.Messages[1], d)
	}

	fail = true
	if err := c.SendWith(ctx, conv.ID, "Shorter", ChatRequest{}, emit); err == nil {
		t.Fatal("it should have failed")
	}
	got, _ = c.Get(ctx, conv.ID)
	m := got.Messages[3]
	if m.Status != ReplyFailed || m.Content != "" || !strings.Contains(m.Detail.Error, "upstream is down") || len(m.Detail.Saved) != 1 || m.Detail.Saved[0].Version <= 2 || len(m.Detail.Checks) != 0 {
		t.Fatalf("%+v %+v", m, m.Detail)
	}

	// an assistant that is given the history again is only told that it failed
	fail = false
	if err := c.SendWith(ctx, conv.ID, "Again", ChatRequest{}, emit); err != nil {
		t.Fatal(err)
	}
	last := spy.inputs[len(spy.inputs)-1].Messages
	if last[len(last)-2].Content != failedInHistory {
		t.Fatalf("%+v", last)
	}
}

func TestAStoppedReplyIsKeptAsStopped(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	w := working{&spyAgent{}, func(_ agent.Input, emit func(agent.Event)) (agent.Output, error) {
		emit(agent.Event{Type: "progress", Text: "Saving the draft"})
		cancel()
		return agent.Output{}, context.Canceled
	}}
	c := newChat(t, w, &fakeFetcher{})
	conv, _ := c.Start(context.Background(), "p", "", pasted)
	_, emit := collect()
	if err := c.Send(ctx, conv.ID, "go", emit); err == nil {
		t.Fatal("stopped")
	}
	got, _ := c.Get(context.Background(), conv.ID)
	m := got.Messages[1]
	if m.Status != ReplyStopped || m.Content != stoppedReply || m.Detail == nil || m.Detail.Error != "" || len(m.Detail.Steps) != 1 {
		t.Fatalf("%+v", m)
	}
}

func TestOlderConversationsFollowTheLast(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	total := maxListed + 3
	for range total {
		if _, err := c.Start(ctx, "p", "", ""); err != nil {
			t.Fatal(err)
		}
	}
	// two changed at the same moment are still each listed once
	if _, err := c.db.Exec(`UPDATE conversations SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id IN (SELECT id FROM conversations ORDER BY updated_at, id LIMIT 2)`); err != nil {
		t.Fatal(err)
	}
	first, err := c.List(ctx, "p")
	if err != nil || len(first) != maxListed {
		t.Fatal(len(first), err)
	}
	rest, err := c.Older(ctx, "p", first[len(first)-1].ID)
	if err != nil || len(rest) != 3 {
		t.Fatal(len(rest), err)
	}
	seen := map[string]bool{}
	for _, v := range append(first, rest...) {
		seen[v.ID] = true
	}
	if len(seen) != total {
		t.Fatalf("%d of %d", len(seen), total)
	}
	if none, err := c.Older(ctx, "other", first[0].ID); err != nil || len(none) != 0 {
		t.Fatal("another brand's list", none, err)
	}
}
