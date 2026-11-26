package service

// What a reply keeps besides its words, so that a conversation reopened later shows all that happened in it.

import (
	"context"
	"database/sql"
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

// SavedVersion is an item the assistant saved while writing a reply, at the last version it saved.
type SavedVersion struct {
	DraftID string `json:"draftId"`
	Kind    string `json:"kind"`
	Version int    `json:"version"`
}

// ChatDetail is what happened while a reply was written.
type ChatDetail struct {
	Steps  []string       `json:"steps,omitempty"`
	Saved  []SavedVersion `json:"saved,omitempty"`
	Checks []agent.Check  `json:"checks,omitempty"`
	// Error is why the reply failed, in words meant for the person.
	Error string `json:"error,omitempty"`
}

func (d ChatDetail) empty() bool {
	return len(d.Steps) == 0 && len(d.Saved) == 0 && len(d.Checks) == 0 && d.Error == ""
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
	// since is each item's newest version when the reply began.
	since map[string]int
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
	r.since = map[string]int{}
	for _, id := range []string{st.PostID, st.ArticleID} {
		if id == "" {
			continue
		}
		var n sql.NullInt64
		if err := c.db.QueryRowContext(ctx, `SELECT MAX(seq) FROM draft_versions WHERE draft_id = ?`, id).Scan(&n); err != nil {
			return err
		}
		r.since[id] = int(n.Int64)
	}
	return nil
}

// close returns what is to be kept, with the versions saved since watch.
func (c *Chat) close(ctx context.Context, r *recorder) (ChatDetail, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.detail
	d.Saved = nil
	for _, kind := range []string{KindPost, KindArticle} { // the post first, whatever the map's order
		for id, since := range r.since {
			v := SavedVersion{DraftID: id}
			err := c.db.QueryRowContext(ctx, `SELECT kind, seq FROM draft_versions WHERE draft_id = ? AND seq > ? AND label = ? ORDER BY seq DESC LIMIT 1`, id, since, VersionAssistant).Scan(&v.Kind, &v.Version)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return d, err
			}
			if v.Kind == kind {
				d.Saved = append(d.Saved, v)
			}
		}
	}
	return d, nil
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
	_, err = c.addReply(ctx, convID, seq, content, status, d)
	return err
}
