package cma

import (
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
	// stream-only previews of an agent message being written
	EventID string `json:"event_id"`
	Event   *struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"event"`
	Delta *struct {
		Content *struct {
			Text string `json:"text"`
		} `json:"content"`
	} `json:"delta"`
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

	seen     map[string]bool   // event ids already handled (a replay must not repeat work)
	streamed map[string]string // agent message id -> text already passed on through live previews
	replies  []string
	verdict  string // the grader's final word
	lastErr  string
	done     bool

	emit func(agent.Event)
}

func newTurn(sentID string, graded bool, emit func(agent.Event)) *turn {
	return &turn{sentID: sentID, graded: graded, seen: map[string]bool{}, streamed: map[string]string{}, emit: emit}
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
	"get_draft": "Reading the draft", "get_design": "Reading the card", "list_drafts": "Looking at the drafts",
	"update_draft": "Saving the draft", "update_card_text": "Changing the words on the card", "create_draft": "Starting a draft",
	"set_attachment": "Changing what the post carries", "fetch_source": "Reading a page", "list_memories": "Reading your notes",
	"save_memory": "Keeping a note", "delete_memory": "Removing a note", "list_connections": "Checking connections",
}

func (t *turn) progress(text string) { t.emit(agent.Event{Type: "progress", Text: text}) }

// handle processes one event, or returns an error that ends the turn. t.done becomes true when the agent has finished.
func (t *turn) handle(e wireEvent) error {
	// live previews have no id of their own, so they are not de-duplicated
	switch e.Type {
	case "event_start":
		if t.sentSeen && e.Event != nil && e.Event.Type == "agent.message" {
			if _, ok := t.streamed[e.Event.ID]; !ok {
				t.streamed[e.Event.ID] = ""
				if len(t.replies) > 0 || t.hasStreamedBefore(e.Event.ID) {
					t.emit(agent.Event{Type: "delta", Text: "\n\n"}) // a new paragraph after an earlier message in the same turn
				}
			}
		}
		return nil
	case "event_delta":
		if t.sentSeen && e.Delta != nil && e.Delta.Content != nil && e.Delta.Content.Text != "" {
			if _, ok := t.streamed[e.EventID]; ok {
				t.streamed[e.EventID] += e.Delta.Content.Text
				t.emit(agent.Event{Type: "delta", Text: e.Delta.Content.Text})
			}
		}
		return nil
	}

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
		txt := e.text()
		if strings.TrimSpace(txt) == "" {
			return nil
		}
		already := t.streamed[e.ID]
		switch {
		case already != "" && strings.HasPrefix(txt, already):
			if rest := txt[len(already):]; rest != "" {
				t.emit(agent.Event{Type: "delta", Text: rest})
			}
		case already == "": // no preview: pass the whole message on, after a paragraph break from an earlier one
			if len(t.replies) > 0 {
				t.emit(agent.Event{Type: "delta", Text: "\n\n"})
			}
			t.emit(agent.Event{Type: "delta", Text: txt})
		}
		t.replies = append(t.replies, txt)

	case "agent.mcp_tool_use":
		if p := progressFor[e.Name]; p != "" {
			t.progress(p)
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
			t.verdict = fmt.Sprintf("%s check passed (round %d).", t.label(), e.Iteration+1)
		case "interrupted":
		default:
			t.verdict = t.label() + " check not passed: " + shorten(e.Explanation, 600)
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
			return errors.New("this conversation reached its spending limit, so the agent stopped. Start a new conversation")
		default: // end_turn, or anything that means "finished"
			t.done = !t.graded || t.verdict != ""
		}

	case "session.status_terminated":
		if !t.done {
			return fmt.Errorf("the agent's session ended unexpectedly%s", t.errSuffix())
		}
	}
	return nil
}

func (t *turn) label() string {
	if t.kind == "article" {
		return "Article"
	}
	return "Post"
}

func shorten(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

func (t *turn) hasStreamedBefore(id string) bool {
	for k := range t.streamed {
		if k != id {
			return true
		}
	}
	return false
}

func (t *turn) errSuffix() string {
	if t.lastErr != "" {
		return " (" + t.lastErr + ")"
	}
	return ""
}

// reply is what the agent said, with the grader's word after it.
func (t *turn) reply() string {
	parts := append([]string(nil), t.replies...)
	if t.verdict != "" {
		parts = append(parts, t.verdict)
	}
	return strings.Join(parts, "\n\n")
}
