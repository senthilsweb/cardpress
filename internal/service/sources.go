package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/senthilsweb/cardpress/internal/agent"
	"github.com/senthilsweb/cardpress/internal/source"
)

const (
	maxSources     = 10
	maxSourceName  = 120
	untitledTopic  = "New conversation"
	sourceKindNone = "topic" // a conversation that started from a message alone
)

// SourceView is a source as it is listed. Its text stays on the server.
type SourceView struct {
	ID        string `json:"id"`
	MessageID string `json:"messageId,omitempty"` // empty until a message has taken it along
	Kind      string `json:"kind"`                // url, text, md, docx or pdf
	Name      string `json:"name"`
	URL       string `json:"url,omitempty"`
	Chars     int    `json:"chars"`
	Truncated bool   `json:"truncated"`
}

// SourceInput is something to write from: a web address, pasted text, or a file. Exactly one.
type SourceInput struct {
	URL      string
	Text     string
	FileName string
	Data     []byte
}

type newSource struct {
	kind, name, url, text string
	truncated             bool
	data                  []byte
}

// readSource fetches or reads what was given and checks it.
func (c *Chat) readSource(ctx context.Context, in SourceInput) (newSource, error) {
	url, text := strings.TrimSpace(in.URL), strings.TrimSpace(in.Text)
	given := 0
	for _, ok := range []bool{url != "", text != "", in.FileName != ""} {
		if ok {
			given++
		}
	}
	if given != 1 {
		return newSource{}, invalid("give a web address, some text or a file")
	}
	switch {
	case url != "":
		s, err := c.fetch.Fetch(ctx, url)
		if err != nil {
			return newSource{}, sourceError(err)
		}
		name := s.Title
		if name == "" {
			name = s.URL
		}
		return newSource{kind: "url", name: shortName(name), url: s.URL, text: s.Text, truncated: s.Truncated}, nil
	case text != "":
		if err := cleanText(text, maxPastedChars); err != nil {
			return newSource{}, err
		}
		if utf8.RuneCountInString(text) < minPastedChars {
			return newSource{}, invalid("paste at least %d characters of text to work from", minPastedChars)
		}
		return newSource{kind: "text", name: firstLine(text, 60), text: text}, nil
	default:
		kind, body, cut, err := source.ReadFile(in.FileName, in.Data)
		if err != nil {
			return newSource{}, sourceError(err)
		}
		s := newSource{kind: kind, name: shortName(path.Base(strings.ReplaceAll(in.FileName, `\`, "/"))), text: body, truncated: cut}
		if kind == source.KindPDF {
			s.data = in.Data // kept as it came, for an agent that reads the pages itself
		}
		return s, nil
	}
}

func sourceError(err error) error {
	var se *source.Error
	if errors.As(err, &se) {
		return invalid("%s", se.Message)
	}
	return err
}

func shortName(s string) string {
	s = callerLabel(s) // one line, no control characters
	if r := []rune(s); len(r) > maxSourceName {
		s = string(r[:maxSourceName])
	}
	return s
}

func (c *Chat) insertSource(ctx context.Context, convID string, s newSource) (SourceView, error) {
	v := SourceView{ID: newID(), Kind: s.kind, Name: s.name, URL: s.url, Chars: utf8.RuneCountInString(s.text), Truncated: s.truncated}
	_, err := c.db.ExecContext(ctx,
		`INSERT INTO conversation_sources (id, conversation_id, kind, name, url, chars, truncated, text, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		v.ID, convID, v.Kind, v.Name, v.URL, v.Chars, boolInt(v.Truncated), s.text, s.data, c.stamp())
	return v, err
}

// AddSource adds something to write from to a conversation. It goes to the agent with the next message.
func (c *Chat) AddSource(ctx context.Context, convID string, in SourceInput) (SourceView, error) {
	conv, err := c.load(ctx, convID)
	if err != nil {
		return SourceView{}, err
	}
	if conv.SourceKind == "mcp" {
		return SourceView{}, invalid("this conversation was started by an outside agent, so it takes no sources")
	}
	var n int
	if err := c.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM conversation_sources WHERE conversation_id = ?`, convID).Scan(&n); err != nil {
		return SourceView{}, err
	}
	if n >= maxSources {
		return SourceView{}, fmt.Errorf("%w: a conversation holds at most %d sources; start a new one for more", ErrConflict, maxSources)
	}
	s, err := c.readSource(ctx, in)
	if err != nil {
		return SourceView{}, err
	}
	v, err := c.insertSource(ctx, convID, s)
	if err != nil {
		return v, err
	}
	// a conversation with no name yet takes its first source's
	_, err = c.db.ExecContext(ctx, `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND title = ?`, firstLine(s.name, 60), c.stamp(), convID, untitledTopic)
	return v, err
}

// RemoveSource takes back a source that no message has taken along yet.
func (c *Chat) RemoveSource(ctx context.Context, convID, id string) error {
	res, err := c.db.ExecContext(ctx, `DELETE FROM conversation_sources WHERE id = ? AND conversation_id = ? AND message_id = ''`, id, convID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (c *Chat) sources(ctx context.Context, convID string) ([]SourceView, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT id, message_id, kind, name, url, chars, truncated FROM conversation_sources WHERE conversation_id = ? ORDER BY created_at, id`, convID)
	if err != nil {
		return nil, err
	}
	out := []SourceView{}
	for rows.Next() {
		var v SourceView
		var cut int
		if err := rows.Scan(&v.ID, &v.MessageID, &v.Kind, &v.Name, &v.URL, &v.Chars, &cut); err != nil {
			rows.Close()
			return nil, err
		}
		v.Truncated = cut != 0
		out = append(out, v)
	}
	return out, closeRows(rows)
}

// agentSources is every source of a conversation with its text, for the agent; New marks those it has not answered yet.
func agentSources(ctx context.Context, db *sql.DB, convID string) ([]agent.Source, []string, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, name, url, text, truncated, delivered FROM conversation_sources WHERE conversation_id = ? ORDER BY created_at, id`, convID)
	if err != nil {
		return nil, nil, err
	}
	var out []agent.Source
	var fresh []string
	for rows.Next() {
		var id string
		var s agent.Source
		var cut, delivered int
		if err := rows.Scan(&id, &s.Title, &s.URL, &s.Text, &cut, &delivered); err != nil {
			rows.Close()
			return nil, nil, err
		}
		s.Truncated, s.New = cut != 0, delivered == 0
		if s.New {
			fresh = append(fresh, id)
		}
		out = append(out, s)
	}
	return out, fresh, closeRows(rows)
}
