package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
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
	defaultNewSource = "Use the source I just added."
	stoppedReply     = "Stopped before the reply was finished."

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
	// Ready is false on a server with no assistant set up.
	Ready bool `json:"ready"`
	// Version and SchemaVersion are the agents' own, where the assistant says them (see AgentDetails).
	Version       string `json:"version,omitempty"`
	SchemaVersion int    `json:"schemaVersion,omitempty"`
}

// ChatMessage is one turn.
type ChatMessage struct {
	ID        string `json:"id"`
	Seq       int    `json:"seq"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	// Status is how a reply ended: done, failed or stopped.
	Status string      `json:"status"`
	Detail *ChatDetail `json:"detail,omitempty"`
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
	PostDraftID    string        `json:"postDraftId,omitempty"`
	ArticleDraftID string        `json:"articleDraftId,omitempty"`
	Agent          AgentInfo     `json:"agent"`
	CreatedAt      string        `json:"createdAt"`
	UpdatedAt      string        `json:"updatedAt"`
	Messages       []ChatMessage `json:"messages,omitempty"`
	Sources        []SourceView  `json:"sources,omitempty"`
	// CostCents is what the conversation has cost at list price; absent when no cost has been recorded.
	CostCents *int           `json:"costCents,omitempty"`
	Proposals []ProposalView `json:"proposals,omitempty"`
	// Changes are what each reply changed, and whether that is saved; Choices the options it offered.
	Changes []ChangeView `json:"changes,omitempty"`
	Choices []ChoiceView `json:"choices,omitempty"`
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
	// Studio, when set, lets an assistant work in the studio: drafts are made for what is ticked, and changes reported.
	Studio ChatStudio
	// OwnBrandsOnly is for an assistant whose key sees only its owner's brands: a person may ask it to work in those only.
	OwnBrandsOnly bool
	db            *sql.DB
	agent         agent.Client
	fetch         SourceFetcher
	now           func() time.Time

	mu   sync.Mutex
	busy map[string]bool
}

// NewChat returns a Chat.
func NewChat(db *sql.DB, a agent.Client, f SourceFetcher) *Chat {
	return &Chat{db: db, agent: a, fetch: f, now: time.Now, busy: map[string]bool{}}
}

// Agent describes what answers.
func (c *Chat) Agent() AgentInfo {
	return AgentInfo{Name: c.agent.Name(), AI: c.agent.IsAI(), Ready: c.agent.Ready()}
}

// AgentDetails is Agent with the versions of what answers, when it has them.
func (c *Chat) AgentDetails() AgentInfo {
	info := c.Agent()
	if v, ok := c.agent.(agent.Versioned); ok {
		info.Version, info.SchemaVersion = v.Versions()
	}
	return info
}

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

// Start begins a conversation: from a web address, from pasted text, or from neither, in which case the person's first
// message says what to write about and sources can be added.
func (c *Chat) Start(ctx context.Context, profileID, rawURL, text string) (Conversation, error) {
	rawURL, text = strings.TrimSpace(rawURL), strings.TrimSpace(text)
	if profileID == "" {
		return Conversation{}, invalid("profileId is required")
	}
	if rawURL != "" && text != "" {
		return Conversation{}, invalid("give a web address or some text, not both; add the other afterwards")
	}
	kind, title := sourceKindNone, untitledTopic
	var first *newSource
	var srcURL, srcTitle string
	if rawURL != "" || text != "" {
		s, err := c.readSource(ctx, SourceInput{URL: rawURL, Text: text})
		if err != nil {
			return Conversation{}, err
		}
		first, kind, title = &s, s.kind, firstLine(s.name, 60)
		if s.kind == "url" {
			srcURL = s.url
			if s.name != s.url {
				title, srcTitle = s.name, s.name
			}
		}
	}
	at := c.stamp()
	id := newID()
	_, err := c.db.ExecContext(ctx,
		`INSERT INTO conversations (id, user_id, profile_id, title, source_kind, source_url, source_title, source_text, source_truncated, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?)`,
		id, actorID(ctx), profileID, title, kind, srcURL, srcTitle, at, at)
	if err != nil {
		return Conversation{}, err
	}
	if first != nil {
		if _, err := c.insertSource(ctx, id, *first); err != nil {
			return Conversation{}, err
		}
	}
	return c.Get(ctx, id)
}

// how much a conversation draws on is the sum over its sources
const convCols = `id, profile_id, title, source_kind, source_url, source_title,
	(SELECT COALESCE(SUM(s.chars), 0) FROM conversation_sources s WHERE s.conversation_id = conversations.id),
	(SELECT COALESCE(MAX(s.truncated), 0) FROM conversation_sources s WHERE s.conversation_id = conversations.id),
	created_at, updated_at, post_draft_id, article_draft_id,
	(SELECT SUM(u.added_cents) FROM chat_usage u WHERE u.conversation_id = conversations.id), (SELECT COUNT(*) FROM proposals p WHERE p.conversation_id = conversations.id AND p.status = 'pending')`

func (c *Chat) scanConv(r scanner) (Conversation, error) {
	var v Conversation
	var tr int
	var cost sql.NullInt64
	if err := r.Scan(&v.ID, &v.ProfileID, &v.Title, &v.SourceKind, &v.SourceURL, &v.SourceTitle, &v.SourceChars, &tr, &v.CreatedAt, &v.UpdatedAt, &v.PostDraftID, &v.ArticleDraftID, &cost, &v.Pending); err != nil {
		return v, err
	}
	v.SourceTruncated, v.Agent = tr != 0, c.Agent()
	if cost.Valid {
		n := int(cost.Int64)
		v.CostCents = &n
	}
	return v, nil
}

// List returns a profile's conversations, newest first, without their messages.
func (c *Chat) List(ctx context.Context, profileID string) ([]Conversation, error) {
	return c.list(ctx, "", profileID)
}

// Older returns the conversations that come after this one in the list: those changed before it.
func (c *Chat) Older(ctx context.Context, profileID, afterID string) ([]Conversation, error) {
	const at = `(SELECT o.updated_at FROM conversations o WHERE o.id = ?)`
	return c.list(ctx, `AND (updated_at < `+at+` OR (updated_at = `+at+` AND id > ?))`, profileID, afterID, afterID, afterID)
}

func (c *Chat) list(ctx context.Context, where, profileID string, args ...any) ([]Conversation, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT `+convCols+` FROM conversations WHERE profile_id = ? `+where+` ORDER BY updated_at DESC, id LIMIT `+strconv.Itoa(maxListed), append([]any{profileID}, args...)...)
	if err != nil {
		return nil, err
	}
	out := []Conversation{}
	for rows.Next() {
		v, err := c.scanConv(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

func (c *Chat) load(ctx context.Context, id string) (Conversation, error) {
	v, err := c.scanConv(c.db.QueryRowContext(ctx, `SELECT `+convCols+` FROM conversations WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

// Get returns a conversation with its messages and every proposal, oldest first.
func (c *Chat) Get(ctx context.Context, id string) (Conversation, error) {
	v, err := c.load(ctx, id)
	if err != nil {
		return v, err
	}
	if v.Sources, err = c.sources(ctx, id); err != nil {
		return v, err
	}
	v.Messages, err = c.messages(ctx, id, 0)
	if err != nil {
		return v, err
	}
	if v.Proposals, err = c.proposals(ctx, id); err != nil {
		return v, err
	}
	if v.Changes, err = c.changes(ctx, id); err != nil {
		return v, err
	}
	v.Choices, err = c.choices(ctx, id)
	return v, err
}

func (c *Chat) messages(ctx context.Context, id string, limit int) ([]ChatMessage, error) {
	q := `SELECT id, seq, role, content, created_at, status, detail FROM chat_messages WHERE conversation_id = ? ORDER BY seq`
	if limit > 0 { // the newest `limit`, still oldest first
		q = fmt.Sprintf(`SELECT * FROM (SELECT id, seq, role, content, created_at, status, detail FROM chat_messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT %d) ORDER BY seq`, limit)
	}
	rows, err := c.db.QueryContext(ctx, q, id)
	if err != nil {
		return nil, err
	}
	out := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		var detail string
		if err := rows.Scan(&m.ID, &m.Seq, &m.Role, &m.Content, &m.CreatedAt, &m.Status, &detail); err != nil {
			rows.Close()
			return nil, err
		}
		if detail != "" {
			var d ChatDetail
			if json.Unmarshal([]byte(detail), &d) == nil {
				m.Detail = &d
			}
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
	for _, q := range []string{`DELETE FROM chat_usage WHERE conversation_id = ?`, `DELETE FROM chat_changes WHERE conversation_id = ?`, `DELETE FROM choices WHERE conversation_id = ?`, `DELETE FROM conversation_sources WHERE conversation_id = ?`, `DELETE FROM proposals WHERE conversation_id = ?`, `DELETE FROM chat_messages WHERE conversation_id = ?`} {
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
func (c *Chat) Send(ctx context.Context, id, content string, emit func(ChatEvent)) error {
	return c.SendWith(ctx, id, content, ChatRequest{}, emit)
}

// SendWith is Send with what the person ticked and is looking at, for an assistant that works in the studio.
func (c *Chat) SendWith(ctx context.Context, id, content string, req ChatRequest, emit func(ChatEvent)) (err error) {
	conv, err := c.load(ctx, id)
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
	if !c.agent.Ready() {
		return agentErr("No assistant is set up on this server.")
	}
	if err := c.mayAsk(ctx, conv.ProfileID); err != nil {
		return err
	}
	if !c.lock(id) {
		return fmt.Errorf("%w: a reply is already being written for this conversation", ErrConflict)
	}
	defer c.unlock(id)

	prior, err := c.messages(ctx, id, 0)
	if err != nil {
		return err
	}
	sources, fresh, err := agentSources(ctx, c.db, id)
	if err != nil {
		return err
	}
	if content == "" { // sources can be sent on their own
		switch {
		case len(fresh) == 0:
			return invalid("write a message first")
		case len(prior) == 0:
			content = defaultFirstTurn
		default:
			content = defaultNewSource
		}
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
	// a reply that fails or is stopped is kept too, with what it had saved by then
	rec, stored := &recorder{}, false
	defer func() {
		if err != nil && !stored {
			if serr := c.keepUnfinished(ctx, id, user.Seq+1, rec, err); serr != nil {
				log.Printf("chat: could not record an unfinished reply: %v", serr)
			}
		}
	}()
	// the sources waiting to be sent go with this message
	if _, err := c.db.ExecContext(ctx, `UPDATE conversation_sources SET message_id = ? WHERE conversation_id = ? AND message_id = ''`, user.ID, id); err != nil {
		return err
	}
	if _, err := c.db.ExecContext(ctx, `UPDATE conversations SET title = ? WHERE id = ? AND title = ?`, firstLine(content, 60), id, untitledTopic); err != nil {
		return err
	}

	session, err := c.session(ctx, id)
	if err != nil {
		return err
	}
	history, err := c.messages(ctx, id, historyLimit)
	if err != nil {
		return err
	}
	var studio *agent.Studio
	if c.Studio != nil {
		if studio, err = c.prepare(ctx, conv, req); err != nil {
			return err
		}
	}
	if err := c.watch(ctx, rec, studio); err != nil {
		return err
	}
	in := agent.Input{SessionID: session, Sources: sources, Studio: studio}
	for _, m := range history {
		if m.Status == ReplyFailed {
			m.Content = failedInHistory
		}
		in.Messages = append(in.Messages, agent.Message{Role: m.Role, Content: m.Content})
	}
	progress := func(e agent.Event) {
		rec.add(e)
		if e.Type == "delta" || e.Type == "progress" {
			emit(ChatEvent{e.Type, map[string]string{"text": e.Text}})
		}
	}
	out, err := c.agent.Respond(ctx, in, progress)
	if errors.Is(err, agent.ErrSessionGone) {
		// the agent has lost the session: start another and give it what is saved here
		if _, derr := c.db.ExecContext(ctx, `UPDATE conversations SET session_id = '' WHERE id = ?`, id); derr != nil {
			return derr
		}
		if session, err = c.session(ctx, id); err != nil {
			return err
		}
		in.SessionID, in.Restarted = session, true
		if studio != nil { // the new session has seen nothing, so it is told about the items afresh
			if _, derr := c.db.ExecContext(ctx, `UPDATE conversations SET seen = '' WHERE id = ?`, id); derr != nil {
				return derr
			}
			if studio, err = c.prepare(ctx, conv, req); err != nil {
				return err
			}
			in.Studio = studio
		}
		in.Sources = append([]agent.Source(nil), sources...)
		for i := range in.Sources {
			in.Sources[i].New = true
		}
		progress(agent.Event{Type: "delta", Text: restartNote + "\n\n"})
		out, err = c.agent.Respond(ctx, in, progress)
	}
	if err != nil {
		return agentErr("The agent could not reply: %v", err)
	}
	reply := agent.CleanReply(out.Reply)
	detail, err := c.close(ctx, rec)
	if err != nil {
		return err
	}
	// a reply may be nothing but what it saved or how the check went
	if reply == "" && out.Proposal == nil && len(detail.Saved) == 0 && len(detail.Checks) == 0 {
		return agentErr("The agent sent an empty reply.")
	}
	if reply == "" && out.Proposal != nil {
		reply = "Here is a draft."
	}
	if out.Proposal != nil {
		if err := out.Proposal.Normalize(); err != nil {
			return agentErr("The agent's proposal was not valid, so it was not used: %v", err)
		}
	}

	detail.Reports = out.Reports
	if in.Restarted {
		reply = restartNote + "\n\n" + reply
		if len(detail.Reports) > 0 {
			detail.Reports = append([]agent.Report{{Message: restartNote}}, detail.Reports...)
		}
	}
	assistant, prop, err := c.storeReply(ctx, id, user.Seq+1, reply, out.Proposal, detail)
	if err != nil {
		return err
	}
	stored = true
	if studio != nil {
		if err := c.settle(ctx, id, assistant.ID); err != nil {
			return err
		}
	}
	if out.SessionID != "" {
		session = out.SessionID
	}
	if err := c.recordUsage(ctx, id, assistant.ID, session, out.Usage); err != nil {
		log.Printf("chat: could not record what the reply cost: %v", err)
	}
	for _, sid := range fresh {
		if _, err := c.db.ExecContext(ctx, `UPDATE conversation_sources SET delivered = 1 WHERE id = ?`, sid); err != nil {
			return err
		}
	}
	if studio != nil {
		if err := c.remember(ctx, id, studio); err != nil {
			log.Printf("chat: could not record what the assistant has seen: %v", err)
		}
	}
	if prop != nil {
		emit(ChatEvent{"proposal", prop})
	}
	emit(ChatEvent{"message", assistant})
	return nil
}

func (c *Chat) addMessage(ctx context.Context, convID string, seq int, role, content string) (ChatMessage, error) {
	return c.insertMessage(ctx, convID, ChatMessage{Seq: seq, Role: role, Content: content, Status: ReplyDone})
}

// addReply stores a reply that has no proposal, with how it ended.
func (c *Chat) addReply(ctx context.Context, convID string, seq int, content, status string, d ChatDetail) (ChatMessage, error) {
	return c.insertMessage(ctx, convID, ChatMessage{Seq: seq, Role: "assistant", Content: content, Status: status, Detail: &d})
}

func (c *Chat) insertMessage(ctx context.Context, convID string, m ChatMessage) (ChatMessage, error) {
	m.ID, m.CreatedAt = newID(), c.stamp()
	detail := ""
	if m.Detail != nil {
		if detail = m.Detail.stored(); detail == "" {
			m.Detail = nil
		}
	}
	if _, err := c.db.ExecContext(ctx, `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, convID, m.Seq, m.Role, m.Content, m.CreatedAt, m.Status, detail); err != nil {
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
func (c *Chat) storeReply(ctx context.Context, convID string, seq int, reply string, p *agent.Proposal, d ChatDetail) (ChatMessage, *ProposalView, error) {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return ChatMessage{}, nil, err
	}
	defer tx.Rollback() //nolint:errcheck
	m := ChatMessage{ID: newID(), Seq: seq, Role: "assistant", Content: reply, CreatedAt: c.stamp(), Status: ReplyDone}
	if !d.empty() {
		m.Detail = &d
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, convID, m.Seq, m.Role, m.Content, m.CreatedAt, m.Status, d.stored()); err != nil {
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
		conv, err := c.load(ctx, convID)
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
	_, view, err := c.storeReply(ctx, convID, seq, reply, &p, ChatDetail{})
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

// ConversationBrand returns the brand a conversation belongs to, for checking who may answer in it.
func (c *Chat) ConversationBrand(ctx context.Context, id string) (string, error) {
	v, err := c.load(ctx, id)
	return v.ProfileID, err
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
