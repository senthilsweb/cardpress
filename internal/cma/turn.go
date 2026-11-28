package cma

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// wireEvent is the small part of a session event this adapter reads. Events are decoded from their raw JSON, so the
// adapter does not depend on how the SDK models each event type.
type wireEvent struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Name    string `json:"name"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	IsError   bool   `json:"is_error"`
	AgentName string `json:"agent_name"`
	// the grader's verdict on an outcome
	Result      string `json:"result"`
	Explanation string `json:"explanation"`
	Iteration   int    `json:"iteration"`
	StopReason  *struct {
		Type     string   `json:"type"`
		EventIDs []string `json:"event_ids"`
	} `json:"stop_reason"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
	// a tool call's input, and the call a result answers
	Input        json.RawMessage `json:"input"`
	MCPToolUseID string          `json:"mcp_tool_use_id"`
}

func (e wireEvent) text() string {
	var parts []string
	for _, c := range e.Content {
		if c.Type == "text" || c.Type == "" {
			parts = append(parts, c.Text)
		}
	}
	return strings.Join(parts, "")
}

// turn follows one request: it goes in, events come out until the agent is done (and, for a graded request, the grader
// has finished). It ignores everything up to and including the echo of what was sent: those events belong to earlier
// turns, which matters because the same session is used for the whole conversation and history is replayed after a
// reconnect.
type turn struct {
	sentID   string // the id the server gave what we sent
	graded   bool   // an outcome: finished only once the grader has said so
	kind     string // what is graded, "post" or "article"
	sentSeen bool

	seen    map[string]bool         // event ids already handled (a replay must not repeat work)
	asked   map[string]agent.Report // report calls waiting for their result, by the call's id
	report  *agent.Report           // the last report the studio accepted
	last    string                  // the last thing the agent said
	verdict *agent.Check            // the grader's final word
	lastErr string
	done    bool

	emit func(agent.Event)
}

func newTurn(sentID string, graded bool, emit func(agent.Event)) *turn {
	return &turn{sentID: sentID, graded: graded, seen: map[string]bool{}, asked: map[string]agent.Report{}, emit: emit}
}

func (t *turn) isOurEcho(e wireEvent) bool {
	want := "user.message"
	if t.graded {
		want = "user.define_outcome"
	}
	return e.Type == want && (t.sentID == "" || e.ID == t.sentID)
}

// progressFor says in a few words what a studio tool call is doing.
var progressFor = map[string]string{
	"get_draft": "Reading the draft", "get_writing_guide": "Reading the writing guide", "get_design": "Reading the card", "list_drafts": "Looking at the drafts",
	"update_draft": "Saving the draft", "update_card_text": "Changing the words on the card", "create_draft": "Starting a draft",
	"set_attachment": "Changing what the post carries", "fetch_source": "Reading a page", "list_memories": "Reading your notes",
	"save_memory": "Keeping a note", "delete_memory": "Removing a note", "list_connections": "Checking connections",
}

func (t *turn) progress(text string) { t.emit(agent.Event{Type: "progress", Text: text}) }

// handle processes one event, or returns an error that ends the turn. t.done becomes true when the agent has finished.
func (t *turn) handle(e wireEvent) error {
	if e.ID != "" {
		if t.seen[e.ID] {
			return nil
		}
		t.seen[e.ID] = true
	}
	if !t.sentSeen {
		if t.isOurEcho(e) {
			t.sentSeen = true
		}
		return nil
	}

	switch e.Type {
	case "agent.message":
		// what the agent says as it works is not shown; the last of it stands in if it never reports
		if txt := e.text(); strings.TrimSpace(txt) != "" {
			t.last = txt
		}

	case "agent.mcp_tool_use":
		if e.Name == agent.ReportTool {
			var r agent.Report
			if json.Unmarshal(e.Input, &r) == nil && r.Check() == nil {
				t.asked[e.ID] = r
			}
		}
		if p := progressFor[e.Name]; p != "" {
			t.progress(p)
		}
	case "agent.mcp_tool_result":
		// only a report the studio accepted counts: it checks that the conversation is the caller's
		if r, ok := t.asked[e.MCPToolUseID]; ok && !e.IsError {
			t.report = &r
		}
	case "session.thread_created":
		switch e.AgentName {
		case "post-writer":
			t.progress("The post writer is working")
		case "article-writer":
			t.progress("The article writer is working")
		}
	case "span.outcome_evaluation_start":
		t.progress("Checking the draft")
	case "span.outcome_evaluation_end":
		switch e.Result {
		case "needs_revision":
			t.progress("Revising after the check")
		case "satisfied":
			t.judge(agent.Check{Kind: t.kind, Passed: true, Round: e.Iteration + 1})
		case "interrupted":
		default:
			t.judge(agent.Check{Kind: t.kind, Round: e.Iteration + 1, Note: shorten(e.Explanation, 600)})
		}

	case "session.error":
		if e.Error != nil && e.Error.Message != "" {
			t.lastErr = e.Error.Message
		} else {
			t.lastErr = "the agent reported an error"
		}

	case "session.status_idle":
		reason := ""
		if e.StopReason != nil {
			reason = e.StopReason.Type
		}
		switch reason {
		case "requires_action":
			// nothing this server offers needs a confirmation yet, so there is nothing to answer it with
			return errors.New("the agent asked to do something that needs your confirmation, which this app cannot give yet")
		case "retries_exhausted":
			return fmt.Errorf("the agent kept failing and gave up%s", t.errSuffix())
		case "budget_reached":
			return errBudgetReached
		default: // end_turn, or anything that means "finished"
			t.done = !t.graded || t.verdict != nil
		}

	case "session.status_terminated":
		if !t.done {
			return fmt.Errorf("the agent's session ended unexpectedly%s", t.errSuffix())
		}
	}
	return nil
}

func (t *turn) judge(c agent.Check) {
	t.verdict = &c
	t.emit(agent.Event{Type: "check", Check: &c})
}

func shorten(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

func (t *turn) errSuffix() string {
	if t.lastErr != "" {
		return " (" + t.lastErr + ")"
	}
	return ""
}

// answer is what to show for this part of the turn: the report, or else the last thing said. Nil when there is neither.
func (t *turn) answer() *agent.Report {
	if t.report != nil {
		return t.report
	}
	if strings.TrimSpace(t.last) == "" {
		return nil
	}
	r := agent.LastWords(t.last)
	return &r
}
