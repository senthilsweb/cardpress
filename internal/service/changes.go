package service

// What an assistant's reply changes in the studio, and what the person then does with it. The assistant writes into the
// item at once, so it can be read and checked; it becomes a version only when the person saves it. Until a later reply
// changes the item again, the person can also undo it.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Where a change stands.
const (
	ChangeOpen    = "open" // the reply is still being written
	ChangePending = "pending"
	ChangeSaved   = "saved"
	ChangeUndone  = "undone"
	ChangePassed  = "passed" // a later reply changed the item
)

const (
	// openFor is how long a reply's record counts as being written: longer than any reply, so one left behind by a
	// server that stopped does not hold versions back for ever.
	openFor      = 30 * time.Minute
	chatSaveNote = "saved from the chat"
)

// ChangeView is a reply's change to one item.
type ChangeView struct {
	MessageID string `json:"messageId"`
	DraftID   string `json:"draftId"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	// Revision is the item as the reply left it: undo works while it is still the current one.
	Revision int `json:"revision"`
	Version  int `json:"version,omitempty"` // set once saved
}

// snapshot is what undo puts back.
type snapshot struct {
	Doc           json.RawMessage `json:"doc"`
	Title         string          `json:"title"`
	Hashtags      []string        `json:"hashtags"`
	AltText       string          `json:"altText"`
	UnicodeStyles bool            `json:"unicodeStyles"`
	Design        json.RawMessage `json:"design,omitempty"`
	Slug          string          `json:"slug"`
	Summary       string          `json:"summary"`
	Audience      string          `json:"audience"`
	Topic         string          `json:"topic"`
}

func snapshotOf(d Draft) snapshot {
	return snapshot{Doc: d.Doc, Title: d.Title, Hashtags: d.Hashtags, AltText: d.AltText, UnicodeStyles: d.UnicodeStyles,
		Design: d.Design, Slug: d.Slug, Summary: d.Summary, Audience: d.Audience, Topic: d.Topic}
}

// openChange is the record of a reply now being written about a draft, if there is one.
func openChange(ctx context.Context, db execer, draftID string) (id, convID string, err error) {
	since := time.Now().UTC().Add(-openFor).Format(time.RFC3339)
	err = db.QueryRowContext(ctx, `SELECT id, conversation_id FROM chat_changes WHERE draft_id = ? AND status = ? AND created_at > ? ORDER BY rowid DESC LIMIT 1`,
		draftID, ChangeOpen, since).Scan(&id, &convID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return id, convID, err
}

// assistantWrite prepares for an assistant's change to a draft. In a chat reply nothing becomes a version; only what the
// person typed since the assistant last wrote is kept as one. An assistant outside the chat has no one to press Save, so
// each of its changes is a version, with what was there before. done records where the draft ended up.
func (s *Studio) assistantWrite(ctx context.Context, cur Draft) (label string, done func(revision int) error, err error) {
	open, _, err := openChange(ctx, s.db, cur.ID)
	if err != nil {
		return "", nil, err
	}
	if open == "" {
		return VersionAssistant, func(int) error { return nil }, keepCurrent(ctx, s.db, cur.ID, "before an assistant change")
	}
	var last int
	err = s.db.QueryRowContext(ctx, `SELECT after_revision FROM chat_changes WHERE draft_id = ? AND after_revision > 0 ORDER BY rowid DESC LIMIT 1`, cur.ID).Scan(&last)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", nil, err
	}
	if last != cur.Revision && s.written(ctx, cur) {
		if err := keepCurrent(ctx, s.db, cur.ID, "before an assistant change"); err != nil {
			return "", nil, err
		}
	}
	return "", func(revision int) error {
		if revision == cur.Revision {
			return nil
		}
		_, err := s.db.ExecContext(ctx, `UPDATE chat_changes SET after_revision = ? WHERE id = ?`, revision, open)
		return err
	}, nil
}

// JoinReply ties an item the assistant has just made to the reply it is writing, so that it is saved or undone like the
// others. Without a reply being written it does nothing.
func (s *Studio) JoinReply(ctx context.Context, convID, draftID string) error {
	var profile string
	err := s.db.QueryRowContext(ctx, `SELECT c.profile_id FROM conversations c WHERE c.id = ? AND EXISTS
		(SELECT 1 FROM chat_changes x WHERE x.conversation_id = c.id AND x.status = ? AND x.draft_id = '')`, convID, ChangeOpen).Scan(&profile)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	d, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return err
	}
	if d.ProfileID != profile {
		return invalid("that conversation belongs to another brand")
	}
	if err := linkDraft(ctx, s.db, convID, draftID); err != nil {
		return err
	}
	return startChange(ctx, s.db, convID, d)
}

func startChange(ctx context.Context, db execer, convID string, d Draft) error {
	b := []byte{}
	if d.ID != "" {
		var err error
		if b, err = json.Marshal(snapshotOf(d)); err != nil {
			return err
		}
	}
	_, err := db.ExecContext(ctx, `INSERT INTO chat_changes (id, conversation_id, draft_id, before, before_revision, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		newID(), convID, d.ID, string(b), d.Revision, time.Now().UTC().Format(time.RFC3339))
	return err
}

// written says whether there is anything in an item worth keeping: text, a title or words on its card.
func (s *Studio) written(ctx context.Context, d Draft) bool {
	if strings.TrimSpace(DraftText(d.Doc)) != "" || d.Title != "" || hasPictures(d.Doc) {
		return true
	}
	card, _, err := s.Card(ctx, d.ID)
	return err != nil || card.Eyebrow+card.Title+card.Subtitle+card.Tag+card.QuoteAuthor+card.StatValue+card.Signature != ""
}

// openChanges notes how the conversation's items stand as a reply begins.
func (c *Chat) openChanges(ctx context.Context, convID string, draftIDs []string) error {
	// whatever an earlier reply left unfinished is over
	for _, q := range []string{`DELETE FROM chat_changes WHERE conversation_id = ? AND status = 'open'`, `DELETE FROM choices WHERE conversation_id = ? AND message_id = ''`} {
		if _, err := c.db.ExecContext(ctx, q, convID); err != nil {
			return err
		}
	}
	// one record without an item marks that a reply is being written
	if err := startChange(ctx, c.db, convID, Draft{}); err != nil {
		return err
	}
	for _, id := range draftIDs {
		if id == "" {
			continue
		}
		d, err := c.Studio.GetDraft(ctx, id)
		if err != nil {
			return err
		}
		if err := startChange(ctx, c.db, convID, d); err != nil {
			return err
		}
	}
	return nil
}

// written lists the items the reply being written has changed.
func (c *Chat) written(ctx context.Context, convID string) ([]SavedVersion, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT d.id, d.kind FROM chat_changes x JOIN drafts d ON d.id = x.draft_id
		WHERE x.conversation_id = ? AND x.status = ? AND x.after_revision > 0 ORDER BY d.kind DESC`, convID, ChangeOpen) // the post first
	if err != nil {
		return nil, err
	}
	var out []SavedVersion
	for rows.Next() {
		var v SavedVersion
		if err := rows.Scan(&v.DraftID, &v.Kind); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

// settle hands the finished reply what was changed and offered while it was written.
func (c *Chat) settle(ctx context.Context, convID, messageID string) error {
	for _, step := range []struct {
		q    string
		args []any
	}{
		// an item the reply did not change keeps what could be done before
		{`DELETE FROM chat_changes WHERE conversation_id = ? AND status = 'open' AND after_revision = 0`, []any{convID}},
		{`UPDATE chat_changes SET status = 'passed', before = '' WHERE status = 'pending' AND draft_id IN (SELECT draft_id FROM chat_changes WHERE conversation_id = ? AND status = 'open')`, []any{convID}},
		{`UPDATE chat_changes SET status = 'pending', message_id = ? WHERE conversation_id = ? AND status = 'open'`, []any{messageID, convID}},
		{`UPDATE choices SET status = 'superseded' WHERE status IN ('pending', 'chosen') AND message_id <> '' AND EXISTS (SELECT 1 FROM choices n WHERE n.message_id = '' AND n.conversation_id = ? AND n.draft_id = choices.draft_id AND n.field = choices.field)`, []any{convID}},
		{`UPDATE choices SET message_id = ? WHERE conversation_id = ? AND message_id = ''`, []any{messageID, convID}},
	} {
		if _, err := c.db.ExecContext(ctx, step.q, step.args...); err != nil {
			return err
		}
	}
	return nil
}

func (c *Chat) changes(ctx context.Context, convID string) ([]ChangeView, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT c.message_id, c.draft_id, d.kind, c.status, c.after_revision, c.version
		FROM chat_changes c JOIN drafts d ON d.id = c.draft_id
		WHERE c.conversation_id = ? AND c.status <> 'open' ORDER BY c.rowid, d.kind DESC`, convID)
	if err != nil {
		return nil, err
	}
	out := []ChangeView{}
	for rows.Next() {
		var v ChangeView
		if err := rows.Scan(&v.MessageID, &v.DraftID, &v.Kind, &v.Status, &v.Revision, &v.Version); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

type pendingChange struct {
	id, draftID, before string
	beforeRev, afterRev int
}

func (c *Chat) pendingOf(ctx context.Context, convID, messageID string) ([]pendingChange, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT id, draft_id, before, before_revision, after_revision FROM chat_changes WHERE conversation_id = ? AND message_id = ? AND status = ? ORDER BY rowid`,
		convID, messageID, ChangePending)
	if err != nil {
		return nil, err
	}
	var out []pendingChange
	for rows.Next() {
		var p pendingChange
		if err := rows.Scan(&p.id, &p.draftID, &p.before, &p.beforeRev, &p.afterRev); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, p)
	}
	return out, closeRows(rows)
}

// Undo puts every item a reply changed back as it was before it. It is refused, changing nothing, when an item has been
// changed since or can no longer be edited.
func (c *Chat) Undo(ctx context.Context, convID, messageID string) (Conversation, error) {
	if _, err := c.load(ctx, convID); err != nil {
		return Conversation{}, err
	}
	if !c.lock(convID) {
		return Conversation{}, fmt.Errorf("%w: wait for the reply being written to finish", ErrConflict)
	}
	defer c.unlock(convID)
	pending, err := c.pendingOf(ctx, convID, messageID)
	if err != nil {
		return Conversation{}, err
	}
	if len(pending) == 0 {
		return Conversation{}, fmt.Errorf("%w: there is nothing left to undo here", ErrConflict)
	}
	for _, p := range pending { // all of them or none
		d, err := c.Studio.GetDraft(ctx, p.draftID)
		if err != nil {
			return Conversation{}, err
		}
		if err := editable(d); err != nil {
			return Conversation{}, err
		}
		if d.Revision != p.afterRev {
			return Conversation{}, fmt.Errorf("%w: this %s was changed after that reply, so it cannot be undone. Its versions are still there", ErrConflict, d.Kind)
		}
	}
	for _, p := range pending {
		var was snapshot
		if err := json.Unmarshal([]byte(p.before), &was); err != nil {
			return Conversation{}, err
		}
		d, err := c.Studio.putBack(ctx, p.draftID, p.afterRev, was)
		if err != nil {
			return Conversation{}, err
		}
		// a version that held the item before the reply holds it again
		if _, err := c.db.ExecContext(ctx, `UPDATE draft_versions SET revision = ? WHERE draft_id = ? AND revision = ?`, d.Revision, p.draftID, p.beforeRev); err != nil {
			return Conversation{}, err
		}
		// when the state put back was itself an assistant's, it still counts as one, so it is not kept as the person's work
		var theirs bool
		if err := c.db.QueryRowContext(ctx, `SELECT NOT EXISTS (SELECT 1 FROM chat_changes WHERE draft_id = ? AND after_revision = ? AND id <> ?)`, p.draftID, p.beforeRev, p.id).Scan(&theirs); err != nil {
			return Conversation{}, err
		}
		after := d.Revision
		if theirs {
			after = 0
		}
		if _, err := c.db.ExecContext(ctx, `UPDATE chat_changes SET status = ?, before = '', after_revision = ? WHERE id = ?`, ChangeUndone, after, p.id); err != nil {
			return Conversation{}, err
		}
	}
	if _, err := c.db.ExecContext(ctx, `UPDATE choices SET status = 'dismissed', decided_at = ? WHERE conversation_id = ? AND message_id = ? AND status = 'pending'`, c.stamp(), convID, messageID); err != nil {
		return Conversation{}, err
	}
	return c.Get(ctx, convID)
}

// putBack writes an earlier state of a draft over the one at revision, without making a version.
func (s *Studio) putBack(ctx context.Context, draftID string, revision int, was snapshot) (Draft, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	cur, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return cur, err
	}
	if cur.Revision != revision {
		return cur, ErrStale
	}
	in := inputOf(cur)
	in.Doc, in.Title, in.Hashtags, in.AltText, in.UnicodeStyles, in.Design = was.Doc, was.Title, was.Hashtags, was.AltText, was.UnicodeStyles, was.Design
	d, err := s.updateWithPlanning(ctx, cur, in, PlanningPatch{Audience: &was.Audience, Topic: &was.Topic}, "", "")
	if err != nil {
		return d, err
	}
	if was.Slug != d.Slug || was.Summary != d.Summary {
		return s.writePageFields(ctx, d, was.Slug, was.Summary)
	}
	return d, nil
}
