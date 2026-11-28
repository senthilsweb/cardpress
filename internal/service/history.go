package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/agent"
)

const (
	maxListed   = 100
	maxSearch   = 100
	restartNote = "Continued in a new session, from your saved messages and sources."
)

// Search returns a brand's conversations, newest first: all of them, or those whose title, messages or source names
// hold what was typed.
func (c *Chat) Search(ctx context.Context, profileID, query string) ([]Conversation, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return c.List(ctx, profileID)
	}
	if err := cleanText(query, maxSearch); err != nil {
		return nil, err
	}
	// what was typed is text to find, not a pattern
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(query) + "%"
	return c.list(ctx, `AND (title LIKE ? ESCAPE '\'
		OR id IN (SELECT conversation_id FROM chat_messages WHERE content LIKE ? ESCAPE '\')
		OR id IN (SELECT conversation_id FROM conversation_sources WHERE name LIKE ? ESCAPE '\'))`, profileID, like, like, like)
}

// recordUsage stores what a reply cost, when the agent says, and adds it to the brand's spending of the month.
func (c *Chat) recordUsage(ctx context.Context, convID, messageID, sessionID, profileID string, u *agent.Usage) error {
	if u == nil || u.TotalCents < 0 {
		return nil
	}
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	var before int
	var input, cached int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(total_cents), 0), COALESCE(MAX(total_input), 0), COALESCE(MAX(total_cached), 0)
		FROM chat_usage WHERE conversation_id = ? AND session_id = ?`, convID, sessionID).Scan(&before, &input, &cached); err != nil {
		return err
	}
	added := max(0, u.TotalCents-before)
	if _, err := tx.ExecContext(ctx, `INSERT INTO chat_usage (id, conversation_id, message_id, session_id, total_cents, added_cents, active_seconds, created_at,
		total_input, total_cached, added_input, added_cached) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		newID(), convID, messageID, sessionID, u.TotalCents, added, u.ActiveSeconds, c.stamp(),
		u.InputTokens, u.CachedTokens, max(0, u.InputTokens-input), max(0, u.CachedTokens-cached)); err != nil {
		return err
	}
	if added > 0 {
		if _, err := tx.ExecContext(ctx, `INSERT INTO assistant_spend (profile_id, month, cents) VALUES (?, ?, ?)
			ON CONFLICT (profile_id, month) DO UPDATE SET cents = cents + excluded.cents`, profileID, monthOf(c.now()), added); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// meterUnfinished records what a reply that failed or was stopped cost, where the assistant can say, so that it counts
// against the budget. Without it the cost would wait for the conversation's next reply, which may never come.
func (c *Chat) meterUnfinished(ctx context.Context, convID, messageID, profileID string, emit func(ChatEvent)) {
	m, ok := c.agent.(agent.Metered)
	if !ok || messageID == "" {
		return
	}
	var session string
	if err := c.db.QueryRowContext(ctx, `SELECT session_id FROM conversations WHERE id = ?`, convID).Scan(&session); err != nil || session == "" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	u, err := m.SessionUsage(ctx, session)
	if err != nil {
		log.Printf("chat: could not read what an unfinished reply cost: %v", err)
		return
	}
	if err := c.recordUsage(ctx, convID, messageID, session, profileID, &u); err != nil {
		log.Printf("chat: could not record what an unfinished reply cost: %v", err)
		return
	}
	for _, line := range c.noticeBudget(ctx, profileID) {
		emit(ChatEvent{"notice", map[string]string{"text": line}})
	}
}
