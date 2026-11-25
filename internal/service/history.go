package service

import (
	"context"
	"strings"

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

// recordUsage stores what a reply cost, when the agent says.
func (c *Chat) recordUsage(ctx context.Context, convID, messageID, sessionID string, u *agent.Usage) error {
	if u == nil || u.TotalCents < 0 {
		return nil
	}
	_, err := c.db.ExecContext(ctx, `INSERT INTO chat_usage (id, conversation_id, message_id, session_id, total_cents, added_cents, active_seconds, created_at)
		SELECT ?, ?, ?, ?, ?, MAX(0, ? - COALESCE(MAX(total_cents), 0)), ?, ? FROM chat_usage WHERE conversation_id = ? AND session_id = ?`,
		newID(), convID, messageID, sessionID, u.TotalCents, u.TotalCents, u.ActiveSeconds, c.stamp(), convID, sessionID)
	return err
}
