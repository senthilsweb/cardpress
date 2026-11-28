package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// meteredAgent is a spy that can also say what a session has cost.
type meteredAgent struct {
	spyAgent
	total int
}

func (m *meteredAgent) SessionUsage(context.Context, string) (agent.Usage, error) {
	return agent.Usage{TotalCents: m.total}, nil
}

func usage(cents int) *agent.Usage { return &agent.Usage{TotalCents: cents} }

// A brand's monthly amount: a reply is given what is left as its allowance, the brand is told once when it passes its
// alert and once when the amount is used up, and after that nothing is sent until the amount is raised or the month ends.
func TestABrandsBudget(t *testing.T) {
	spy := &meteredAgent{}
	spy.out = agent.Output{Reply: "Done."}
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	for _, id := range []string{"p", "other"} {
		if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES (?, '', '{"name":"Acme"}', 0, '')`, id); err != nil {
			t.Fatal(err)
		}
	}
	notices := func(ev []ChatEvent) (lines []string) {
		for _, e := range ev {
			if e.Name == "notice" {
				lines = append(lines, e.Data.(map[string]string)["text"])
			}
		}
		return lines
	}
	send := func(convID string, total int) ([]string, error) {
		t.Helper()
		spy.out.Usage = usage(total)
		ev, emit := collect()
		err := c.Send(ctx, convID, "Go on", emit)
		return notices(*ev), err
	}
	last := func() *int { return spy.inputs[len(spy.inputs)-1].Allowance }

	conv, _ := c.Start(ctx, "p", "", pasted)
	// no amount anywhere: no allowance
	if lines, err := send(conv.ID, 10); err != nil || last() != nil || len(lines) != 0 {
		t.Fatalf("%v %v %v", err, last(), lines)
	}
	if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: StandardTier, Checks: true, Rounds: 3, MonthCents: 100, AlertPercent: 80}); err != nil {
		t.Fatal(err)
	}
	// 10 spent of 100: 90 left
	if lines, err := send(conv.ID, 50); err != nil || last() == nil || *last() != 90 || len(lines) != 0 {
		t.Fatalf("%v %v %v", err, last(), lines)
	}
	// 50 spent; this reply takes it to 85: the alert, once
	lines, err := send(conv.ID, 85)
	if err != nil || *last() != 50 || len(lines) != 1 || !strings.Contains(lines[0], "85%") {
		t.Fatalf("%v %v %v", err, *last(), lines)
	}
	if lines, err := send(conv.ID, 90); err != nil || len(lines) != 0 {
		t.Fatalf("said again: %v %v", err, lines)
	}
	// used up
	if lines, err := send(conv.ID, 104); err != nil || len(lines) != 1 || !strings.Contains(lines[0], "used up") {
		t.Fatalf("%v %v", err, lines)
	}
	asked := len(spy.inputs)
	if _, err := send(conv.ID, 200); !errors.Is(err, ErrBudget) || len(spy.inputs) != asked || !strings.Contains(UserMessage(err), "This brand's assistant budget") {
		t.Fatalf("nothing is sent with nothing left: %v", err)
	}
	// another brand is not held back, and deleting the conversation does not give the money back
	other, _ := c.Start(ctx, "other", "", pasted)
	if _, err := send(other.ID, 5); err != nil || last() != nil {
		t.Fatalf("%v %v", err, last())
	}
	if err := c.Delete(ctx, conv.ID); err != nil {
		t.Fatal(err)
	}
	v, err := c.BrandAssistant(ctx, "p")
	if err != nil || v.Budget.SpentCents != 104 || v.Budget.MonthCents != 100 || v.Budget.Level != BudgetUsed {
		t.Fatalf("%v %+v", err, v.Budget)
	}
	// the log has both notices
	var n int
	if err := c.db.QueryRow(`SELECT COUNT(*) FROM security_events WHERE event IN (?, ?) AND subject = 'Acme'`, EventBudgetAlert, EventBudgetUsed).Scan(&n); err != nil || n != 2 {
		t.Fatalf("the log: %d %v", n, err)
	}
	// a raised amount takes effect at once
	if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: StandardTier, Checks: true, Rounds: 3, MonthCents: 500, AlertPercent: 80}); err != nil {
		t.Fatal(err)
	}
	again, _ := c.Start(ctx, "p", "", pasted)
	if _, err := send(again.ID, 1); err != nil || *last() != 396 {
		t.Fatalf("%v %v", err, last())
	}
	// and so does a new month
	if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: StandardTier, Checks: true, Rounds: 3, MonthCents: 100, AlertPercent: 80}); err != nil {
		t.Fatal(err)
	}
	if _, err := send(again.ID, 2); !errors.Is(err, ErrBudget) {
		t.Fatalf("%v", err)
	}
	now := c.now
	c.now = func() time.Time { return now().AddDate(0, 1, 0) }
	if _, err := send(again.ID, 3); err != nil || *last() != 100 {
		t.Fatalf("a new month: %v %v", err, last())
	}
}

// The server's amount is for every brand together, and the less of the two is what a reply may cost.
func TestTheServersBudget(t *testing.T) {
	spy := &meteredAgent{}
	spy.out = agent.Output{Reply: "Done."}
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	c.MonthCents = 1000
	for _, id := range []string{"a", "b"} {
		if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES (?, '', '{}', 0, '')`, id); err != nil {
			t.Fatal(err)
		}
	}
	_, emit := collect()
	send := func(convID string, total int) error {
		spy.out.Usage = usage(total)
		return c.Send(ctx, convID, "Go on", emit)
	}
	v, err := c.Assistant(ctx)
	if err != nil || v.Saved || v.Settings.MonthCents != 1000 || v.Defaults.MonthCents != 1000 {
		t.Fatalf("as started: %v %+v", err, v)
	}
	if v, err = c.SetAssistant(ctx, AssistantSettings{MonthCents: 60}); err != nil || !v.Saved || v.Budget.MonthCents != 60 {
		t.Fatalf("%v %+v", err, v)
	}
	if _, err := c.SetAssistant(ctx, AssistantSettings{MonthCents: -1}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("%v", err)
	}
	if _, err := c.SetBrandAssistant(ctx, "a", BrandAssistant{Tier: StandardTier, Checks: true, Rounds: 3, MonthCents: 500, AlertPercent: 80}); err != nil {
		t.Fatal(err)
	}
	a, _ := c.Start(ctx, "a", "", pasted)
	b, _ := c.Start(ctx, "b", "", pasted)
	if err := send(a.ID, 40); err != nil || *spy.inputs[0].Allowance != 60 {
		t.Fatalf("the less of the two: %v %v", err, spy.inputs[0].Allowance)
	}
	if err := send(b.ID, 25); err != nil || *spy.inputs[1].Allowance != 20 {
		t.Fatalf("what the other brand left: %v %v", err, spy.inputs[1].Allowance)
	}
	if err := send(a.ID, 41); !errors.Is(err, ErrBudget) || !strings.Contains(UserMessage(err), "The assistant's budget") {
		t.Fatalf("every brand stops: %v", err)
	}
	if v, err = c.ResetAssistant(ctx); err != nil || v.Saved || v.Settings.MonthCents != 1000 || v.Budget.SpentCents != 65 {
		t.Fatalf("%v %+v", err, v)
	}
	if err := send(a.ID, 41); err != nil {
		t.Fatalf("%v", err)
	}
}

// A reply that stops at its allowance says so, and what it cost is counted although it did not finish.
func TestAReplyStoppedByTheBudgetStillCounts(t *testing.T) {
	spy := &meteredAgent{total: 130}
	spy.err = agent.ErrBudget
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: StandardTier, Checks: true, Rounds: 3, MonthCents: 120, AlertPercent: 80}); err != nil {
		t.Fatal(err)
	}
	conv, _ := c.Start(ctx, "p", "", pasted)
	ev, emit := collect()
	err := c.Send(ctx, conv.ID, "Go on", emit)
	var ae *AgentError
	if !errors.As(err, &ae) || !strings.Contains(ae.Msg, "used up") {
		t.Fatalf("%v", err)
	}
	b, err := brandBudget(ctx, c.db, "p", c.now())
	if err != nil || b.SpentCents != 130 || b.Level != BudgetUsed {
		t.Fatalf("%v %+v", err, b)
	}
	if !strings.Contains(names(*ev), "notice") {
		t.Fatalf("the person is told: %s", names(*ev))
	}
	got, _ := c.Get(ctx, conv.ID)
	if got.CostCents == nil || *got.CostCents != 130 {
		t.Fatalf("the conversation's cost: %v", got.CostCents)
	}
}

// tieredAgent is a spy that offers tiers.
type tieredAgent struct {
	spyAgent
	tiers []agent.Tier
	on    []string // the tier of each session started
}

func (a *tieredAgent) Tiers() []agent.Tier { return a.tiers }
func (a *tieredAgent) CreateSessionOn(ctx context.Context, tier string) (string, error) {
	a.on = append(a.on, tier)
	return a.CreateSession(ctx)
}

// A brand's tier is the one its new conversations start on. A conversation keeps its tier when the brand's changes and
// when its session has to be started again, and a saved tier that is no longer offered gives way to the first.
func TestABrandsTier(t *testing.T) {
	spy := &tieredAgent{tiers: []agent.Tier{{ID: "standard", Name: "Standard"}, {ID: "strong", Name: "Strong"}, {ID: "best", Name: "Best"}}}
	spy.out = agent.Output{Reply: "Done."}
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	if _, err := c.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	_, emit := collect()
	set := func(tier string) {
		t.Helper()
		if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: tier, Checks: true, Rounds: 3, AlertPercent: 80}); err != nil {
			t.Fatal(err)
		}
	}
	say := func(convID string) {
		t.Helper()
		if err := c.Send(ctx, convID, "Go on", emit); err != nil {
			t.Fatal(err)
		}
	}
	tierOf := func(convID string) (tier string) {
		if err := c.db.QueryRow(`SELECT tier FROM conversations WHERE id = ?`, convID).Scan(&tier); err != nil {
			t.Fatal(err)
		}
		return tier
	}

	first, _ := c.Start(ctx, "p", "", pasted)
	say(first.ID)
	set("strong")
	second, _ := c.Start(ctx, "p", "", pasted)
	say(second.ID)
	say(first.ID) // an open conversation goes on as it began
	if got := strings.Join(spy.on, " "); got != "standard strong" || tierOf(first.ID) != "standard" || tierOf(second.ID) != "strong" {
		t.Fatalf("started on %q; %q %q", got, tierOf(first.ID), tierOf(second.ID))
	}
	// its session is lost: the new one is on the same tier, not the brand's present one
	set("best")
	if _, err := c.db.Exec(`UPDATE conversations SET session_id = '' WHERE id = ?`, second.ID); err != nil {
		t.Fatal(err)
	}
	say(second.ID)
	if got := spy.on[len(spy.on)-1]; got != "strong" {
		t.Fatalf("restarted on %q", got)
	}
	if _, err := c.SetBrandAssistant(ctx, "p", BrandAssistant{Tier: "platinum", Checks: true, Rounds: 3, AlertPercent: 80}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a tier that is not offered: %v", err)
	}
	// the assistant stops offering the brand's tier
	spy.tiers = spy.tiers[:2]
	v, err := c.BrandAssistant(ctx, "p")
	if err != nil || v.TierGone != "best" || v.Settings.Tier != "standard" || len(v.Tiers) != 2 {
		t.Fatalf("%v %+v", err, v)
	}
	third, _ := c.Start(ctx, "p", "", pasted)
	say(third.ID)
	if got := spy.on[len(spy.on)-1]; got != "standard" || tierOf(third.ID) != "standard" {
		t.Fatalf("a tier that is gone: %q", got)
	}
}
