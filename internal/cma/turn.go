package cma

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// maxFixes is how many times the agent may send an invalid proposal in one turn before the turn fails.
const maxFixes = 3

// wireEvent is the small part of a session event this adapter reads. Events are decoded from their raw JSON, so the
// adapter does not depend on how the SDK models each event type.
type wireEvent struct {
	Type    string          `json:"type"`
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Input   json.RawMessage `json:"input"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason *struct {
		Type     string   `json:"type"`
		EventIDs []string `json:"event_ids"`
	} `json:"stop_reason"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
	CustomToolUseID string `json:"custom_tool_use_id"`
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

// toolResult is what to send back for a custom tool call.
type toolResult struct {
	ToolUseID string
	Text      string
	IsError   bool
}

// turn follows one exchange: the person's message goes in, events come out until the agent is done. It ignores everything
// up to and including the echo of the message that was sent (those events belong to earlier turns, which matters because
// the same session is used for the whole conversation and the history is replayed after a reconnect).
type turn struct {
	sentID   string // the id the server gave our user.message
	sentText string // used to recognise the echo if ids ever differ
	sentSeen bool

	seen     map[string]bool   // event ids already handled (a replay must not repeat work)
	answered map[string]bool   // custom tool calls that already have a result
	streamed map[string]string // agent message id -> text already passed on through live previews
	replies  []string
	proposal *agent.Proposal
	fixes    int
	lastErr  string
	done     bool

	emit func(agent.Event)
}

func newTurn(sentID, sentText string, emit func(agent.Event)) *turn {
	return &turn{sentID: sentID, sentText: sentText, seen: map[string]bool{}, answered: map[string]bool{}, streamed: map[string]string{}, emit: emit}
}

func (t *turn) isOurEcho(e wireEvent) bool {
	if e.Type != "user.message" {
		return false
	}
	if t.sentID != "" {
		return e.ID == t.sentID
	}
	return strings.TrimSpace(e.text()) == strings.TrimSpace(t.sentText)
}

// handle processes one event. It returns a tool result to send, if the agent is waiting for one, or an error that ends
// the turn. t.done becomes true when the agent has finished.
func (t *turn) handle(e wireEvent) (*toolResult, error) {
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
		return nil, nil
	case "event_delta":
		if t.sentSeen && e.Delta != nil && e.Delta.Content != nil && e.Delta.Content.Text != "" {
			if _, ok := t.streamed[e.EventID]; ok {
				t.streamed[e.EventID] += e.Delta.Content.Text
				t.emit(agent.Event{Type: "delta", Text: e.Delta.Content.Text})
			}
		}
		return nil, nil
	}

	if e.ID != "" {
		if t.seen[e.ID] {
			return nil, nil
		}
		t.seen[e.ID] = true
	}
	if !t.sentSeen {
		if t.isOurEcho(e) {
			t.sentSeen = true
		}
		return nil, nil
	}

	switch e.Type {
	case "user.custom_tool_result":
		t.answered[e.CustomToolUseID] = true

	case "agent.message":
		txt := e.text()
		if strings.TrimSpace(txt) == "" {
			return nil, nil
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

	case "agent.custom_tool_use":
		return t.toolUse(e)

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
			// waiting on us: the tool result was already returned when the call arrived
		case "retries_exhausted":
			return nil, fmt.Errorf("the agent kept failing and gave up%s", t.errSuffix())
		case "budget_reached":
			return nil, errors.New("this conversation reached its spending limit, so the agent stopped. Start a new conversation")
		default: // end_turn, or anything that means "finished"
			t.done = true
		}

	case "session.status_terminated":
		if !t.done {
			return nil, fmt.Errorf("the agent's session ended unexpectedly%s", t.errSuffix())
		}
	}
	return nil, nil
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

// toolUse validates the agent's proposal. A valid one is kept (a later one replaces it: that is a revision). An invalid one
// is answered with an error that says what is wrong, so the agent can send a corrected version, a few times at most.
func (t *turn) toolUse(e wireEvent) (*toolResult, error) {
	if e.Name != ToolName {
		return t.answer(e.ID, toolResult{ToolUseID: e.ID, Text: "There is no tool named " + e.Name + ". Use propose_content.", IsError: true}), nil
	}
	p, err := agent.ParseProposal(e.Input)
	if err != nil {
		if t.answered[e.ID] {
			return nil, nil // replayed, and already handled before
		}
		t.fixes++
		if t.fixes > maxFixes {
			return nil, fmt.Errorf("the agent could not produce a valid proposal after %d tries (%v)", maxFixes, err)
		}
		return t.answer(e.ID, toolResult{ToolUseID: e.ID, Text: ToolResultInvalid(err), IsError: true}), nil
	}
	t.proposal = &p
	return t.answer(e.ID, toolResult{ToolUseID: e.ID, Text: ToolResultOK}), nil
}

// answer returns the result to send unless that call already has one.
func (t *turn) answer(id string, r toolResult) *toolResult {
	if t.answered[id] {
		return nil
	}
	t.answered[id] = true
	return &r
}

// output is the finished turn.
func (t *turn) output(sessionID string) agent.Output {
	return agent.Output{SessionID: sessionID, Reply: agent.CleanReply(strings.Join(t.replies, "\n\n")), Proposal: t.proposal}
}
