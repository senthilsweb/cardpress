package service

// What a reply keeps besides its words, so that a conversation reopened later shows all that happened in it.

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// How a reply ended.
const (
	ReplyDone    = "done"
	ReplyFailed  = "failed"
	ReplyStopped = "stopped"
)

const (
	maxSteps = 60
	// failedInHistory is all a restarted session is told about a reply that failed.
	failedInHistory = "(That reply failed.)"
)

// SavedVersion is an item the assistant changed while writing a reply. Replies from before changes waited for the
// person to save them also hold the version it saved.
type SavedVersion struct {
	DraftID string `json:"draftId"`
	Kind    string `json:"kind"`
	Version int    `json:"version,omitempty"`
	// Fields name what the reply changed; Created says the item had no text before it.
	Fields  []string `json:"fields,omitempty"`
	Created bool     `json:"created,omitempty"`
}

// ChatDetail is what happened while a reply was written.
type ChatDetail struct {
	Steps  []string       `json:"steps,omitempty"`
	Saved  []SavedVersion `json:"saved,omitempty"`
	Checks []agent.Check  `json:"checks,omitempty"`
	// Reports are the assistant's short answers, which the screen shows in place of the message's text.
	Reports []agent.Report `json:"reports,omitempty"`
	// Error is why the reply failed, in words meant for the person.
	Error string `json:"error,omitempty"`
}

func (d ChatDetail) empty() bool {
	return len(d.Steps) == 0 && len(d.Saved) == 0 && len(d.Checks) == 0 && len(d.Reports) == 0 && d.Error == ""
}

func (d ChatDetail) stored() string {
	if d.empty() {
		return ""
	}
	b, _ := json.Marshal(d)
	return string(b)
}

// recorder gathers a reply's progress as it arrives, so it is there however the reply ends.
type recorder struct {
	mu     sync.Mutex
	detail ChatDetail
	convID string // set once the reply's changes are being recorded
}

func (r *recorder) add(e agent.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch e.Type {
	case "progress":
		s := r.detail.Steps
		if n := len(s); e.Text != "" && n < maxSteps && (n == 0 || s[n-1] != e.Text) {
			r.detail.Steps = append(s, e.Text)
		}
	case "check":
		if e.Check != nil {
			r.detail.Checks = append(r.detail.Checks, *e.Check)
		}
	}
}

// watch notes where the conversation's items stand before the assistant works on them.
func (c *Chat) watch(ctx context.Context, r *recorder, st *agent.Studio) error {
	if st == nil {
		return nil
	}
	r.convID = st.ConversationID
	return c.openChanges(ctx, st.ConversationID, []string{st.PostID, st.ArticleID})
}

// close returns what is to be kept, with the items changed since watch.
func (c *Chat) close(ctx context.Context, r *recorder) (ChatDetail, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.detail
	if r.convID == "" {
		return d, nil
	}
	var err error
	d.Saved, err = c.written(ctx, r.convID)
	return d, err
}

// keepUnfinished stores the reply that did not finish: what happened and why it ended. Text the assistant had written is
// not kept, since a reply that failed its checks must not be stored.
func (c *Chat) keepUnfinished(ctx context.Context, convID string, seq int, r *recorder, cause error) error {
	stopped := errors.Is(ctx.Err(), context.Canceled)
	ctx = context.WithoutCancel(ctx) // the person is gone or has stopped; the record is still written
	d, err := c.close(ctx, r)
	if err != nil {
		return err
	}
	status, content := ReplyStopped, stoppedReply
	if !stopped {
		status, content = ReplyFailed, ""
		d.Error = "Something went wrong while writing the reply."
		var ae *AgentError
		if errors.As(cause, &ae) {
			d.Error = ae.Msg
		}
	}
	m, err := c.addReply(ctx, convID, seq, content, status, d)
	if err != nil || r.convID == "" {
		return err
	}
	return c.settle(ctx, convID, m.ID)
}
