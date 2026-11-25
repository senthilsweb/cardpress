package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// forgetful loses a session once, and reports what each one has cost.
type forgetful struct {
	spyAgent
	lose  string
	cents map[string]int
}

func (a *forgetful) Respond(ctx context.Context, in agent.Input, emit func(agent.Event)) (agent.Output, error) {
	a.mu.Lock()
	lose := a.lose == in.SessionID
	a.mu.Unlock()
	if lose {
		return agent.Output{}, agent.ErrSessionGone
	}
	out, err := a.spyAgent.Respond(ctx, in, emit)
	a.cents[in.SessionID] += 10
	out.SessionID, out.Usage = in.SessionID, &agent.Usage{TotalCents: a.cents[in.SessionID], ActiveSeconds: 3}
	return out, err
}

func TestALostSessionIsContinuedFromWhatIsSaved(t *testing.T) {
	a := &forgetful{spyAgent: spyAgent{out: agent.Output{Reply: "Noted."}}, cents: map[string]int{}}
	c, ctx := newChat(t, a, &fakeFetcher{}), context.Background()
	conv, _ := c.Start(ctx, "p", "", pasted)
	_, emit := collect()
	for _, m := range []string{"", "shorter"} {
		if err := c.Send(ctx, conv.ID, m, emit); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := c.Get(ctx, conv.ID); got.CostCents == nil || *got.CostCents != 20 {
		t.Fatalf("two replies of one session: %v", got.CostCents)
	}
	a.lose = "sess-1"
	if err := c.Send(ctx, conv.ID, "longer", emit); err != nil {
		t.Fatal(err)
	}
	in := a.inputs[len(a.inputs)-1]
	if in.SessionID != "sess-2" || !in.Restarted || len(in.Sources) != 1 || !in.Sources[0].New || len(in.Messages) != 5 {
		t.Fatalf("%+v", in)
	}
	got, _ := c.Get(ctx, conv.ID)
	last := got.Messages[len(got.Messages)-1].Content
	if !strings.HasPrefix(last, restartNote) || !strings.HasSuffix(last, "Noted.") || got.CostCents == nil || *got.CostCents != 30 {
		t.Fatalf("%q %v", last, got.CostCents)
	}
	if err := c.Send(ctx, conv.ID, "and again", emit); err != nil {
		t.Fatal(err)
	}
	if in = a.inputs[len(a.inputs)-1]; in.Restarted || in.Sources[0].New {
		t.Fatalf("an ordinary turn again: %+v", in)
	}
}

func TestSearchingConversations(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{out: agent.Output{Reply: "About warehouses."}}, &fakeFetcher{}), context.Background()
	a, _ := c.Start(ctx, "p", "", "")
	_, emit := collect()
	if err := c.Send(ctx, a.ID, "A post about data contracts", emit); err != nil {
		t.Fatal(err)
	}
	b, _ := c.Start(ctx, "p", "", "")
	if _, err := c.AddSource(ctx, b.ID, SourceInput{FileName: "quarterly_50%.md", Data: []byte("numbers")}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Start(ctx, "q", "", "Another brand writes about data contracts too, at length."); err != nil {
		t.Fatal(err)
	}
	for query, want := range map[string]string{"contracts": a.ID, "WAREHOUSES": a.ID, "quarterly_50%": b.ID, "50_": "", "%": b.ID, "nothing here": ""} {
		got, err := c.Search(ctx, "p", query)
		if err != nil {
			t.Fatal(err)
		}
		ids := ""
		for _, v := range got {
			ids += v.ID
		}
		if ids != want {
			t.Errorf("%q: %d found", query, len(got))
		}
		if len(got) == 1 && got[0].CostCents != nil {
			t.Errorf("%q: a cost with none recorded", query)
		}
	}
	if all, _ := c.Search(ctx, "p", "  "); len(all) != 2 {
		t.Errorf("an empty search lists the brand's: %d", len(all))
	}
	if _, err := c.Search(ctx, "p", strings.Repeat("a", maxSearch+1)); !errors.Is(err, ErrInvalid) {
		t.Errorf("too long: %v", err)
	}
}
