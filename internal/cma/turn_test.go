package cma

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

func ev(t *testing.T, raw string) wireEvent {
	t.Helper()
	var e wireEvent
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatalf("%v: %s", err, raw)
	}
	return e
}

type deltas struct{ parts []string }

func (d *deltas) emit(e agent.Event) { d.parts = append(d.parts, e.Text) }
func (d *deltas) text() string       { return strings.Join(d.parts, "") }

const (
	echo      = `{"type":"user.message","id":"sevt_me","content":[{"type":"text","text":"hello"}]}`
	idleDone  = `{"type":"session.status_idle","id":"%s","stop_reason":{"type":"end_turn"}}`
	goodInput = `{"kind":"post","title":"T","body":"Hello world.\n\n- a\n- b","hashtags":["Go"],"altText":"alt","rationale":"why"}`
)

func msg(id, text string) string {
	b, _ := json.Marshal(text)
	return `{"type":"agent.message","id":"` + id + `","content":[{"type":"text","text":` + string(b) + `}]}`
}
func toolUse(id, name, input string) string {
	return `{"type":"agent.custom_tool_use","id":"` + id + `","name":"` + name + `","input":` + input + `}`
}
func idle(id, reason string) string {
	return `{"type":"session.status_idle","id":"` + id + `","stop_reason":{"type":"` + reason + `","event_ids":["x"]}}`
}

// run feeds events and returns the tool results asked for and the first error.
func run(t *testing.T, tr *turn, events ...string) (results []*toolResult, err error) {
	t.Helper()
	for _, raw := range events {
		r, e := tr.handle(ev(t, raw))
		if r != nil {
			results = append(results, r)
		}
		if e != nil {
			return results, e
		}
	}
	return results, nil
}

func TestAProposalAndAReplyEndToEnd(t *testing.T) {
	d := &deltas{}
	tr := newTurn("sevt_me", "hello", d.emit)
	res, err := run(t, tr,
		echo,
		`{"type":"session.status_running","id":"s1"}`,
		msg("m1", "Here is a draft."),
		toolUse("tu1", ToolName, goodInput),
		idle("i1", "requires_action"),
		`{"type":"user.custom_tool_result","id":"r1","custom_tool_use_id":"tu1"}`,
		msg("m2", "I kept it short."),
		idle("i2", "end_turn"),
	)
	if err != nil || !tr.done {
		t.Fatalf("done=%v err=%v", tr.done, err)
	}
	if len(res) != 1 || res[0].ToolUseID != "tu1" || res[0].IsError || res[0].Text != ToolResultOK {
		t.Fatalf("the agent must get exactly one 'recorded' result: %+v", res)
	}
	out := tr.output("sess")
	if out.Reply != "Here is a draft.\n\nI kept it short." || out.Proposal == nil || out.Proposal.Kind != "post" || out.Proposal.Title != "T" || len(out.Proposal.Hashtags) != 1 || out.SessionID != "sess" {
		t.Fatalf("%+v", out)
	}
	if d.text() != "Here is a draft.\n\nI kept it short." {
		t.Fatalf("the streamed text must equal the reply: %q", d.text())
	}
}

func TestEventsFromEarlierTurnsAreIgnored(t *testing.T) {
	d := &deltas{}
	tr := newTurn("sevt_me", "hello", d.emit)
	// the session already ran a turn before: its messages, proposal and 'finished' idle come first
	res, err := run(t, tr,
		`{"type":"user.message","id":"sevt_old","content":[{"type":"text","text":"earlier"}]}`,
		msg("old1", "OLD REPLY"),
		toolUse("oldtu", ToolName, `{"kind":"article","title":"OLD","body":"old"}`),
		idle("oldidle", "end_turn"),
		`{"type":"session.error","id":"olderr","error":{"message":"old error"}}`,
		`{"type":"session.status_terminated","id":"oldterm"}`,
	)
	if err != nil || tr.done || len(res) != 0 || tr.proposal != nil || len(tr.replies) != 0 || len(d.parts) != 0 {
		t.Fatalf("nothing before our message may count: done=%v err=%v res=%v proposal=%v replies=%v", tr.done, err, res, tr.proposal, tr.replies)
	}
	if _, err := run(t, tr, echo, msg("new1", "NEW"), idle("newidle", "end_turn")); err != nil || !tr.done {
		t.Fatalf("%v", err)
	}
	if o := tr.output("s"); o.Reply != "NEW" || o.Proposal != nil {
		t.Fatalf("%+v", o)
	}
}

func TestReplayingHistoryAfterAReconnectDoesNotRepeatWork(t *testing.T) {
	d := &deltas{}
	tr := newTurn("sevt_me", "hello", d.emit)
	seq := []string{echo, msg("m1", "Once."), toolUse("tu1", ToolName, goodInput), idle("i1", "requires_action")}
	first, _ := run(t, tr, seq...)
	again, err := run(t, tr, seq...) // the same events delivered again (history list + live stream)
	if err != nil || len(first) != 1 || len(again) != 0 {
		t.Fatalf("a replayed tool call must not be answered twice: first=%d again=%d err=%v", len(first), len(again), err)
	}
	if len(tr.replies) != 1 || d.text() != "Once." {
		t.Fatalf("replies=%v streamed=%q", tr.replies, d.text())
	}
	// a tool call that already has a result (sent before the connection dropped) is not answered again
	tr2 := newTurn("sevt_me", "hello", (&deltas{}).emit)
	res, _ := run(t, tr2, echo, `{"type":"user.custom_tool_result","id":"r1","custom_tool_use_id":"tu1"}`, toolUse("tu1", ToolName, goodInput))
	if len(res) != 0 || tr2.proposal == nil {
		t.Fatalf("the proposal must still be recovered from a replayed call: res=%v proposal=%v", res, tr2.proposal)
	}
}

func TestAnInvalidProposalIsSentBackWithTheReasonAndCanBeFixed(t *testing.T) {
	tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
	res, err := run(t, tr, echo, toolUse("tu1", ToolName, `{"kind":"tweet","title":"x","body":"y"}`))
	if err != nil || len(res) != 1 || !res[0].IsError || !strings.Contains(res[0].Text, "not accepted") || !strings.Contains(res[0].Text, "kind") || tr.proposal != nil {
		t.Fatalf("%v %+v", err, res)
	}
	res, err = run(t, tr, toolUse("tu2", ToolName, goodInput))
	if err != nil || len(res) != 1 || res[0].IsError || tr.proposal == nil {
		t.Fatalf("a corrected version is accepted: %v %+v", err, res)
	}
}

func TestAnAgentThatKeepsSendingInvalidProposalsIsStopped(t *testing.T) {
	tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
	_, _ = run(t, tr, echo)
	var err error
	for i := 0; i < maxFixes+1 && err == nil; i++ {
		_, err = run(t, tr, toolUse("tu"+string(rune('a'+i)), ToolName, `{"kind":"post","title":"x","body":"  "}`))
	}
	if err == nil || !strings.Contains(err.Error(), "valid proposal") {
		t.Fatalf("%v", err)
	}
}

func TestARevisionReplacesTheEarlierProposal(t *testing.T) {
	tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
	_, _ = run(t, tr, echo, toolUse("tu1", ToolName, goodInput))
	_, _ = run(t, tr, toolUse("tu2", ToolName, `{"kind":"article","title":"Second","body":"## H\n\ntext"}`))
	if tr.proposal == nil || tr.proposal.Kind != "article" || tr.proposal.Title != "Second" {
		t.Fatalf("%+v", tr.proposal)
	}
}

func TestOnlyTheProposalToolIsAnswered(t *testing.T) {
	tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
	res, err := run(t, tr, echo, toolUse("tu1", "publish_post", `{"x":1}`))
	if err != nil || len(res) != 1 || !res[0].IsError || !strings.Contains(res[0].Text, "no tool named") || tr.proposal != nil {
		t.Fatalf("%v %+v", err, res)
	}
}

func TestEveryWayTheSessionCanEnd(t *testing.T) {
	cases := map[string]struct {
		events  []string
		wantErr string
		done    bool
	}{
		"finished":          {[]string{echo, idle("i", "end_turn")}, "", true},
		"unknown stop":      {[]string{echo, idle("i", "something_new")}, "", true},
		"waiting on a tool": {[]string{echo, idle("i", "requires_action")}, "", false},
		"gave up":           {[]string{echo, `{"type":"session.error","id":"e","error":{"message":"overloaded"}}`, idle("i", "retries_exhausted")}, "gave up (overloaded)", false},
		"budget":            {[]string{echo, idle("i", "budget_reached")}, "spending limit", false},
		"terminated early":  {[]string{echo, `{"type":"session.status_terminated","id":"t"}`}, "ended unexpectedly", false},
		"error then fine":   {[]string{echo, `{"type":"session.error","id":"e","error":{"message":"blip"}}`, `{"type":"session.status_rescheduled","id":"r"}`, idle("i", "end_turn")}, "", true},
		"terminated after":  {[]string{echo, idle("i", "end_turn"), `{"type":"session.status_terminated","id":"t"}`}, "", true},
	}
	for name, c := range cases {
		tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
		_, err := run(t, tr, c.events...)
		if (err == nil) != (c.wantErr == "") || (err != nil && !strings.Contains(err.Error(), c.wantErr)) || tr.done != c.done {
			t.Errorf("%s: err=%v done=%v, want err~%q done=%v", name, err, tr.done, c.wantErr, c.done)
		}
	}
}

func TestLivePreviewsStreamTextAndTheFinalMessageAddsOnlyTheRest(t *testing.T) {
	d := &deltas{}
	tr := newTurn("sevt_me", "hello", d.emit)
	_, err := run(t, tr, echo,
		`{"type":"event_start","event":{"type":"agent.message","id":"m1"}}`,
		`{"type":"event_delta","event_id":"m1","delta":{"content":{"text":"Hello, "}}}`,
		`{"type":"event_delta","event_id":"m1","delta":{"content":{"text":"wor"}}}`,
		msg("m1", "Hello, world!"), // deltas are best-effort: the real message is complete
		`{"type":"event_start","event":{"type":"agent.message","id":"m2"}}`,
		`{"type":"event_delta","event_id":"m2","delta":{"content":{"text":"Second."}}}`,
		msg("m2", "Second."),
		idle("i", "end_turn"))
	if err != nil || d.text() != "Hello, world!\n\nSecond." {
		t.Fatalf("%v streamed %q", err, d.text())
	}
	if o := tr.output("s"); o.Reply != "Hello, world!\n\nSecond." {
		t.Fatalf("the stored reply comes from the complete messages: %q", o.Reply)
	}
}

func TestPreviewsFromBeforeOurMessageAreIgnored(t *testing.T) {
	d := &deltas{}
	tr := newTurn("sevt_me", "hello", d.emit)
	_, _ = run(t, tr,
		`{"type":"event_start","event":{"type":"agent.message","id":"old"}}`,
		`{"type":"event_delta","event_id":"old","delta":{"content":{"text":"STALE"}}}`, echo, msg("m1", "Fresh."), idle("i", "end_turn"))
	if d.text() != "Fresh." {
		t.Fatalf("%q", d.text())
	}
}

func TestBlankMessagesAreSkippedAndTheEchoCanBeMatchedByText(t *testing.T) {
	d := &deltas{}
	tr := newTurn("", "  hello ", d.emit) // no id from the server
	_, err := run(t, tr, `{"type":"user.message","id":"u0","content":[{"type":"text","text":"something else"}]}`,
		`{"type":"user.message","id":"u1","content":[{"type":"text","text":"hello"}]}`, msg("m0", "   "), msg("m1", "Answer."), idle("i", "end_turn"))
	if err != nil || !tr.done || tr.output("s").Reply != "Answer." || d.text() != "Answer." {
		t.Fatalf("%v %+v %q", err, tr.output("s"), d.text())
	}
}

func TestLongRepliesAreBounded(t *testing.T) {
	tr := newTurn("sevt_me", "hello", (&deltas{}).emit)
	_, _ = run(t, tr, echo, msg("m1", strings.Repeat("x", 9000)), idle("i", "end_turn"))
	if n := len([]rune(tr.output("s").Reply)); n > 4000 {
		t.Fatalf("reply is %d characters", n)
	}
}
