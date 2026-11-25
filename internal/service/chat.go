package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/senthilsweb/cardpress/internal/agent"
	"github.com/senthilsweb/cardpress/internal/source"
	"github.com/senthilsweb/cardpress/internal/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const (
	maxPastedChars   = 100_000
	minPastedChars   = 40
	maxChatMessage   = 20_000
	historyLimit     = 30
	defaultFirstTurn = "Draft a LinkedIn post from this source."

	ProposalPending    = "pending"
	ProposalApproved   = "approved"
	ProposalRejected   = "rejected"
	ProposalSuperseded = "superseded" // a newer proposal replaced it; it stays in the history
)

// SourceFetcher reads a page. *source.Fetcher implements it.
type SourceFetcher interface {
	Fetch(ctx context.Context, url string) (source.Source, error)
}

// AgentInfo says what answers in the chat, so the screen can be honest about whether a model is behind it.
type AgentInfo struct {
	Name string `json:"name"`
	AI   bool   `json:"ai"`
}

// ChatMessage is one turn.
type ChatMessage struct {
	ID        string `json:"id"`
	Seq       int    `json:"seq"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

// ProposalView is content the agent suggested. It reaches a draft only when a person approves it.
type ProposalView struct {
	ID             string   `json:"id"`
	ConversationID string   `json:"conversationId"`
	MessageID      string   `json:"messageId"`
	Kind           string   `json:"kind"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Hashtags       []string `json:"hashtags"`
	AltText        string   `json:"altText"`
	Rationale      string   `json:"rationale"`
	Status         string   `json:"status"`
	Edited         bool     `json:"edited"`
	DraftID        string   `json:"draftId,omitempty"`
	CreatedAt      string   `json:"createdAt"`
	DecidedAt      string   `json:"decidedAt,omitempty"`
}

// Conversation is a chat about one source. Messages and Proposals are filled in by Get.
type Conversation struct {
	ID              string `json:"id"`
	ProfileID       string `json:"profileId"`
	Title           string `json:"title"`
	SourceKind      string `json:"sourceKind"` // "url", "text", or "mcp" (started by an outside agent)
	SourceURL       string `json:"sourceUrl,omitempty"`
	SourceTitle     string `json:"sourceTitle,omitempty"`
	SourceChars     int    `json:"sourceChars"`
	SourceTruncated bool   `json:"sourceTruncated"`
	Pending         int    `json:"pending"` // proposals waiting for a decision
	// PostDraftID and ArticleDraftID are the items this conversation is about, empty when it has none.
	PostDraftID    string         `json:"postDraftId,omitempty"`
	ArticleDraftID string         `json:"articleDraftId,omitempty"`
	Agent          AgentInfo      `json:"agent"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
	Messages       []ChatMessage  `json:"messages,omitempty"`
	Proposals      []ProposalView `json:"proposals,omitempty"`
}

// ChatEvent is progress while a reply is written. Name is "user", "delta", "proposal" or "message".
type ChatEvent struct {
	Name string
	Data any
}

// Decision is a person's answer to a proposal.
type Decision struct {
	Status  string        // approved or rejected
	DraftID string        // where an approved proposal was applied
	Edited  *ProposalEdit // changes made before approving
}

// ProposalEdit is what a person changed before approving. Only content fields exist.
type ProposalEdit struct {
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Body     string   `json:"body"`
	Hashtags []string `json:"hashtags"`
	AltText  string   `json:"altText"`
}

// AgentError is a problem with what the agent did (it failed, answered with nothing, or sent an invalid proposal). Its
// message is meant for the person and is safe to show.
type AgentError struct{ Msg string }

func (e *AgentError) Error() string { return e.Msg }

func agentErr(format string, a ...any) error { return &AgentError{fmt.Sprintf(format, a...)} }

// Chat prepares post content with an agent. It never saves, publishes or schedules: a proposal ends at a person's
// approval, and applying it to a draft is done by the person's browser.
type Chat struct {
	db    *sql.DB
	agent agent.Client
	fetch SourceFetcher
	now   func() time.Time

	mu   sync.Mutex
	busy map[string]bool
}

// NewChat returns a Chat.
func NewChat(db *sql.DB, a agent.Client, f SourceFetcher) *Chat {
	return &Chat{db: db, agent: a, fetch: f, now: time.Now, busy: map[string]bool{}}
}

// Agent describes what answers.
func (c *Chat) Agent() AgentInfo { return AgentInfo{Name: c.agent.Name(), AI: c.agent.IsAI()} }

func (c *Chat) stamp() string { return c.now().UTC().Format(draftTimeLayout) }

func cleanText(s string, max int) error {
	if utf8.RuneCountInString(s) > max {
		return invalid("that is too long (the limit is %d characters)", max)
	}
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\t' && r != '\r' {
			return invalid("that contains a control character")
		}
	}
	return nil
}

func firstLine(s string, n int) string {
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(strings.TrimLeft(l, "#-• ")); l != "" {
			r := []rune(l)
			if len(r) > n {
				return strings.TrimSpace(string(r[:n])) + "…"
			}
			return l
		}
	}
	return "Untitled"
}

/* ------------------------------------------------------------------ start, list, get, delete */

// Start begins a conversation from a web address or pasted text (exactly one).
func (c *Chat) Start(ctx context.Context, profileID, rawURL, text string) (Conversation, error) {
	rawURL, text = strings.TrimSpace(rawURL), strings.TrimSpace(text)
	if profileID == "" {
		return Conversation{}, invalid("profileId is required")
	}
	if (rawURL == "") == (text == "") {
		return Conversation{}, invalid("give either a web address or some text to work from, not both and not neither")
	}
	var kind, srcURL, srcTitle, srcText string
	var truncated bool
	if rawURL != "" {
		s, err := c.fetch.Fetch(ctx, rawURL)
		if err != nil {
			var se *source.Error
			if errors.As(err, &se) {
				return Conversation{}, invalid("%s", se.Message)
			}
			return Conversation{}, err
		}
		kind, srcURL, srcTitle, srcText, truncated = "url", s.URL, s.Title, s.Text, s.Truncated
	} else {
		if err := cleanText(text, maxPastedChars); err != nil {
			return Conversation{}, err
		}
		if utf8.RuneCountInString(text) < minPastedChars {
			return Conversation{}, invalid("paste at least %d characters of text to work from", minPastedChars)
		}
		kind, srcText = "text", text
	}
	title := srcTitle
	if title == "" {
		title = firstLine(srcText, 60)
	}
	at := c.stamp()
	id := newID()
	_, err := c.db.ExecContext(ctx,
		`INSERT INTO conversations (id, user_id, profile_id, title, source_kind, source_url, source_title, source_text, source_truncated, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, actorID(ctx), profileID, title, kind, srcURL, srcTitle, srcText, boolInt(truncated), at, at)
	if err != nil {
		return Conversation{}, err
	}
	return c.Get(ctx, id)
}

const convCols = `id, profile_id, title, source_kind, source_url, source_title, source_text, source_truncated, created_at, updated_at, post_draft_id, article_draft_id, (SELECT COUNT(*) FROM proposals p WHERE p.conversation_id = conversations.id AND p.status = 'pending')`

func (c *Chat) scanConv(r scanner) (Conversation, string, error) {
	var v Conversation
	var text string
	var tr int
	if err := r.Scan(&v.ID, &v.ProfileID, &v.Title, &v.SourceKind, &v.SourceURL, &v.SourceTitle, &text, &tr, &v.CreatedAt, &v.UpdatedAt, &v.PostDraftID, &v.ArticleDraftID, &v.Pending); err != nil {
		return v, "", err
	}
	v.SourceChars, v.SourceTruncated, v.Agent = utf8.RuneCountInString(text), tr != 0, c.Agent()
	return v, text, nil
}

// List returns a profile's conversations, newest first, without their messages.
func (c *Chat) List(ctx context.Context, profileID string) ([]Conversation, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT `+convCols+` FROM conversations WHERE profile_id = ? ORDER BY updated_at DESC, id LIMIT 50`, profileID)
	if err != nil {
		return nil, err
	}
	out := []Conversation{}
	for rows.Next() {
		v, _, err := c.scanConv(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

func (c *Chat) load(ctx context.Context, id string) (Conversation, string, error) {
	v, text, err := c.scanConv(c.db.QueryRowContext(ctx, `SELECT `+convCols+` FROM conversations WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return v, "", ErrNotFound
	}
	return v, text, err
}

// Get returns a conversation with its messages and every proposal, oldest first.
func (c *Chat) Get(ctx context.Context, id string) (Conversation, error) {
	v, _, err := c.load(ctx, id)
	if err != nil {
		return v, err
	}
	v.Messages, err = c.messages(ctx, id, 0)
	if err != nil {
		return v, err
	}
	v.Proposals, err = c.proposals(ctx, id)
	return v, err
}

func (c *Chat) messages(ctx context.Context, id string, limit int) ([]ChatMessage, error) {
	q := `SELECT id, seq, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY seq`
	if limit > 0 { // the newest `limit`, still oldest first
		q = fmt.Sprintf(`SELECT * FROM (SELECT id, seq, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT %d) ORDER BY seq`, limit)
	}
	rows, err := c.db.QueryContext(ctx, q, id)
	if err != nil {
		return nil, err
	}
	out := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.Seq, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, m)
	}
	return out, closeRows(rows)
}

const propCols = `id, conversation_id, message_id, kind, title, body, hashtags, alt_text, rationale, status, edited, draft_id, created_at, decided_at`

func scanProposal(r scanner) (ProposalView, error) {
	var p ProposalView
	var tags string
	var edited int
	if err := r.Scan(&p.ID, &p.ConversationID, &p.MessageID, &p.Kind, &p.Title, &p.Body, &tags, &p.AltText, &p.Rationale, &p.Status, &edited, &p.DraftID, &p.CreatedAt, &p.DecidedAt); err != nil {
		return p, err
	}
	p.Edited = edited != 0
	if err := json.Unmarshal([]byte(tags), &p.Hashtags); err != nil || p.Hashtags == nil {
		p.Hashtags = []string{}
	}
	return p, nil
}

func (c *Chat) proposals(ctx context.Context, convID string) ([]ProposalView, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT `+propCols+` FROM proposals WHERE conversation_id = ? ORDER BY created_at, id`, convID)
	if err != nil {
		return nil, err
	}
	out := []ProposalView{}
	for rows.Next() {
		p, err := scanProposal(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, p)
	}
	return out, closeRows(rows)
}

// linkDraft makes a draft the conversation's post or article, by the draft's kind. A draft of another brand, or one
// that does not exist, matches nothing, so a conversation can only ever point at its own brand's items.
func linkDraft(ctx context.Context, db execer, convID, draftID string) error {
	for _, l := range []struct{ column, kind string }{{"post_draft_id", KindPost}, {"article_draft_id", KindArticle}} {
		if _, err := db.ExecContext(ctx,
			`UPDATE conversations SET `+l.column+` = ? WHERE id = ? AND EXISTS (
			   SELECT 1 FROM drafts d WHERE d.id = ? AND d.kind = ? AND d.profile_id = conversations.profile_id)`,
			draftID, convID, draftID, l.kind); err != nil {
			return err
		}
	}
	return nil
}

// Link records the item a conversation is about (see linkDraft) and returns the conversation.
func (c *Chat) Link(ctx context.Context, id, draftID string) (Conversation, error) {
	if err := linkDraft(ctx, c.db, id, draftID); err != nil {
		return Conversation{}, err
	}
	return c.Get(ctx, id)
}

// Delete removes a conversation and everything in it.
func (c *Chat) Delete(ctx context.Context, id string) error {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for _, q := range []string{`DELETE FROM proposals WHERE conversation_id = ?`, `DELETE FROM chat_messages WHERE conversation_id = ?`} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM conversations WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

/* ------------------------------------------------------------------ a turn */

func (c *Chat) lock(id string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.busy[id] {
		return false
	}
	c.busy[id] = true
	return true
}

func (c *Chat) unlock(id string) { c.mu.Lock(); delete(c.busy, id); c.mu.Unlock() }

// Send adds the person's message, gets the agent's reply, and stores both. Progress goes to emit: the stored user
// message, text as it is written ("delta"), the proposal, and the stored reply. The person's message is kept even if
// the agent then fails, so nothing they typed is lost. Invalid agent output is an error and is never stored.
func (c *Chat) Send(ctx context.Context, id, content string, emit func(ChatEvent)) (err error) {
	conv, srcText, err := c.load(ctx, id)
	if err != nil {
		return err
	}
	content = strings.TrimSpace(content)
	if err := cleanText(content, maxChatMessage); err != nil {
		return err
	}
	if conv.SourceKind == "mcp" {
		return invalid("this conversation was started by an outside agent, so ask that agent for changes")
	}
	if !c.lock(id) {
		return fmt.Errorf("%w: a reply is already being written for this conversation", ErrConflict)
	}
	defer c.unlock(id)

	prior, err := c.messages(ctx, id, 0)
	if err != nil {
		return err
	}
	if content == "" {
		if len(prior) > 0 {
			return invalid("write a message first")
		}
		content = defaultFirstTurn
	}
	// one span per turn of the assistant: which agent answered, never what was said
	info := c.Agent()
	ctx, span := telemetry.Start(ctx, "assistant turn", trace.WithAttributes(
		attribute.String("openinference.span.kind", "AGENT"), attribute.String("cardpress.agent.name", info.Name), attribute.Bool("cardpress.agent.ai", info.AI)))
	defer func() {
		if err != nil {
			telemetry.Fail(span, "the turn failed")
		}
		span.End()
	}()
	user, err := c.addMessage(ctx, id, len(prior)+1, "user", content)
	if err != nil {
		return err
	}
	emit(ChatEvent{"user", user})

	session, err := c.session(ctx, id)
	if err != nil {
		return err
	}
	history, err := c.messages(ctx, id, historyLimit)
	if err != nil {
		return err
	}
	in := agent.Input{SessionID: session, Source: &agent.Source{URL: conv.SourceURL, Title: conv.SourceTitle, Text: srcText, Truncated: conv.SourceTruncated}}
	for _, m := range history {
		in.Messages = append(in.Messages, agent.Message{Role: m.Role, Content: m.Content})
	}
	out, err := c.agent.Respond(ctx, in, func(e agent.Event) {
		if e.Type == "delta" {
			emit(ChatEvent{"delta", map[string]string{"text": e.Text}})
		}
	})
	if err != nil {
		return agentErr("The agent could not reply: %v", err)
	}
	reply := agent.CleanReply(out.Reply)
	if reply == "" && out.Proposal == nil {
		return agentErr("The agent sent an empty reply.")
	}
	if reply == "" {
		reply = "Here is a draft."
	}
	if out.Proposal != nil {
		if err := out.Proposal.Normalize(); err != nil {
			return agentErr("The agent's proposal was not valid, so it was not used: %v", err)
		}
	}

	assistant, prop, err := c.storeReply(ctx, id, user.Seq+1, reply, out.Proposal)
	if err != nil {
		return err
	}
	if prop != nil {
		emit(ChatEvent{"proposal", prop})
	}
	emit(ChatEvent{"message", assistant})
	return nil
}

func (c *Chat) addMessage(ctx context.Context, convID string, seq int, role, content string) (ChatMessage, error) {
	m := ChatMessage{ID: newID(), Seq: seq, Role: role, Content: content, CreatedAt: c.stamp()}
	if _, err := c.db.ExecContext(ctx, `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		m.ID, convID, m.Seq, m.Role, m.Content, m.CreatedAt); err != nil {
		return m, err
	}
	_, err := c.db.ExecContext(ctx, `UPDATE conversations SET updated_at = ? WHERE id = ?`, m.CreatedAt, convID)
	return m, err
}

func (c *Chat) session(ctx context.Context, id string) (string, error) {
	var s string
	if err := c.db.QueryRowContext(ctx, `SELECT session_id FROM conversations WHERE id = ?`, id).Scan(&s); err != nil {
		return "", err
	}
	if s != "" {
		return s, nil
	}
	s, err := c.agent.CreateSession(ctx)
	if err != nil {
		return "", agentErr("The agent could not start a session: %v", err)
	}
	_, err = c.db.ExecContext(ctx, `UPDATE conversations SET session_id = ? WHERE id = ?`, s, id)
	return s, err
}

// storeReply saves the agent's reply and proposal together, and marks earlier undecided proposals as superseded.
func (c *Chat) storeReply(ctx context.Context, convID string, seq int, reply string, p *agent.Proposal) (ChatMessage, *ProposalView, error) {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return ChatMessage{}, nil, err
	}
	defer tx.Rollback() //nolint:errcheck
	m := ChatMessage{ID: newID(), Seq: seq, Role: "assistant", Content: reply, CreatedAt: c.stamp()}
	if _, err := tx.ExecContext(ctx, `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		m.ID, convID, m.Seq, m.Role, m.Content, m.CreatedAt); err != nil {
		return m, nil, err
	}
	var view *ProposalView
	if p != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE proposals SET status = ? WHERE conversation_id = ? AND status = ?`, ProposalSuperseded, convID, ProposalPending); err != nil {
			return m, nil, err
		}
		tags, _ := json.Marshal(p.Hashtags)
		v := ProposalView{ID: newID(), ConversationID: convID, MessageID: m.ID, Kind: p.Kind, Title: p.Title, Body: p.Body, Hashtags: p.Hashtags,
			AltText: p.AltText, Rationale: p.Rationale, Status: ProposalPending, CreatedAt: m.CreatedAt}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO proposals (id, conversation_id, message_id, kind, title, body, hashtags, alt_text, rationale, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			v.ID, convID, m.ID, v.Kind, v.Title, v.Body, string(tags), v.AltText, v.Rationale, v.Status, v.CreatedAt); err != nil {
			return m, nil, err
		}
		view = &v
	}
	if _, err := tx.ExecContext(ctx, `UPDATE conversations SET updated_at = ? WHERE id = ?`, m.CreatedAt, convID); err != nil {
		return m, nil, err
	}
	return m, view, tx.Commit()
}

/* ------------------------------------------------------------------ the human decision */

// Decide records a person's answer to a proposal. Approving does not publish or save anything: the browser applies the
// content to a draft, and DraftID records where. Edits made first are validated and kept, with the original.
func (c *Chat) Decide(ctx context.Context, proposalID string, d Decision) (ProposalView, error) {
	if d.Status != ProposalApproved && d.Status != ProposalRejected {
		return ProposalView{}, invalid("status must be %q or %q", ProposalApproved, ProposalRejected)
	}
	cur, err := scanProposal(c.db.QueryRowContext(ctx, `SELECT `+propCols+` FROM proposals WHERE id = ?`, proposalID))
	if errors.Is(err, sql.ErrNoRows) {
		return ProposalView{}, ErrNotFound
	}
	if err != nil {
		return ProposalView{}, err
	}
	if cur.Status != ProposalPending && cur.Status != ProposalSuperseded {
		return ProposalView{}, fmt.Errorf("%w: this proposal was already %s", ErrConflict, cur.Status)
	}
	at := c.stamp()
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return ProposalView{}, err
	}
	defer tx.Rollback() //nolint:errcheck

	if d.Status == ProposalApproved && d.Edited != nil {
		e := agent.Proposal{Kind: d.Edited.Kind, Title: d.Edited.Title, Body: d.Edited.Body, Hashtags: d.Edited.Hashtags, AltText: d.Edited.AltText, Rationale: cur.Rationale}
		if err := e.Normalize(); err != nil {
			return ProposalView{}, invalid("%v", err)
		}
		orig, _ := json.Marshal(map[string]any{"kind": cur.Kind, "title": cur.Title, "body": cur.Body, "hashtags": cur.Hashtags, "altText": cur.AltText})
		tags, _ := json.Marshal(e.Hashtags)
		if _, err := tx.ExecContext(ctx, `UPDATE proposals SET kind = ?, title = ?, body = ?, hashtags = ?, alt_text = ?, edited = 1, original = ? WHERE id = ?`,
			e.Kind, e.Title, e.Body, string(tags), e.AltText, string(orig), proposalID); err != nil {
			return ProposalView{}, err
		}
	}
	res, err := tx.ExecContext(ctx, `UPDATE proposals SET status = ?, draft_id = ?, decided_at = ? WHERE id = ? AND status IN (?, ?)`,
		d.Status, d.DraftID, at, proposalID, ProposalPending, ProposalSuperseded)
	if err != nil {
		return ProposalView{}, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ProposalView{}, fmt.Errorf("%w: this proposal was already decided", ErrConflict)
	}
	// where an approved proposal went is now the conversation's post or article
	if d.Status == ProposalApproved && d.DraftID != "" {
		if err := linkDraft(ctx, tx, cur.ConversationID, d.DraftID); err != nil {
			return ProposalView{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return ProposalView{}, err
	}
	return scanProposal(c.db.QueryRowContext(ctx, `SELECT `+propCols+` FROM proposals WHERE id = ?`, proposalID))
}

/* ------------------------------------------------------------------ proposals from an outside agent (MCP) */

// maxPendingExternal bounds how many unreviewed proposals outside agents may leave for one profile, so a runaway agent
// cannot bury the person in them.
const maxPendingExternal = 20

// ExternalProposal is content an outside agent suggests through MCP.
type ExternalProposal struct {
	ProfileID      string
	ConversationID string // add to an earlier proposal conversation; empty starts a new one
	Caller         string // who is asking, as the client described itself (not verified)
	Proposal       agent.Proposal
}

func callerLabel(s string) string {
	s = strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, s)), " ")
	if r := []rune(s); len(r) > 80 {
		s = string(r[:80])
	}
	if s == "" {
		return "An outside agent"
	}
	return s
}

// Propose stores an outside agent's suggestion as a **pending proposal**, exactly like one from the chat. It changes no
// draft and nothing is applied until a person approves it in the Chat tab.
func (c *Chat) Propose(ctx context.Context, in ExternalProposal) (ProposalView, error) {
	if in.ProfileID == "" {
		return ProposalView{}, invalid("profileId is required")
	}
	p := in.Proposal
	if err := p.Normalize(); err != nil {
		return ProposalView{}, invalid("%v", err)
	}
	caller := callerLabel(in.Caller)

	var pending int
	if err := c.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM proposals p JOIN conversations c ON c.id = p.conversation_id
		 WHERE c.profile_id = ? AND c.source_kind = 'mcp' AND p.status = 'pending'`, in.ProfileID).Scan(&pending); err != nil {
		return ProposalView{}, err
	}
	if pending >= maxPendingExternal {
		return ProposalView{}, fmt.Errorf("%w: %d proposals from outside agents are already waiting for review; ask the person to review them first", ErrConflict, pending)
	}

	convID := in.ConversationID
	if convID == "" {
		convID = newID()
		title := p.Title
		if title == "" {
			title = firstLine(p.Body, 60)
		}
		at := c.stamp()
		if _, err := c.db.ExecContext(ctx,
			`INSERT INTO conversations (id, user_id, profile_id, title, source_kind, source_title, source_text, created_at, updated_at) VALUES (?, ?, ?, ?, 'mcp', ?, '', ?, ?)`,
			convID, actorID(ctx), in.ProfileID, title, caller, at, at); err != nil {
			return ProposalView{}, err
		}
	} else {
		conv, _, err := c.load(ctx, convID)
		if err != nil {
			return ProposalView{}, err
		}
		if conv.ProfileID != in.ProfileID || conv.SourceKind != "mcp" {
			return ProposalView{}, invalid("conversationId must be one this agent started for the same profile")
		}
	}
	if !c.lock(convID) {
		return ProposalView{}, fmt.Errorf("%w: that conversation is busy", ErrConflict)
	}
	defer c.unlock(convID)
	var seq int
	if err := c.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq), 0) + 1 FROM chat_messages WHERE conversation_id = ?`, convID).Scan(&seq); err != nil {
		return ProposalView{}, err
	}
	what := "post"
	if p.Kind == agent.KindArticle {
		what = "article"
	}
	reply := fmt.Sprintf("%s proposed a %s: “%s”. Review it below. Nothing changes until you approve it.", caller, what, firstLine(p.Title+" ", 80))
	_, view, err := c.storeReply(ctx, convID, seq, reply, &p)
	if err != nil {
		return ProposalView{}, err
	}
	return *view, nil
}

// Proposal returns one proposal, so an outside agent can learn whether it was approved, edited or rejected.
func (c *Chat) Proposal(ctx context.Context, id string) (ProposalView, error) {
	p, err := scanProposal(c.db.QueryRowContext(ctx, `SELECT `+propCols+` FROM proposals WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

// ProposalBrand returns the brand a proposal belongs to (through its conversation), for checking who may act on it.
func (c *Chat) ProposalBrand(ctx context.Context, proposalID string) (string, error) {
	var profileID string
	err := c.db.QueryRowContext(ctx, `SELECT c.profile_id FROM proposals p JOIN conversations c ON c.id = p.conversation_id WHERE p.id = ?`, proposalID).Scan(&profileID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return profileID, err
}
