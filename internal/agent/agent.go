// Package agent is the boundary between the chat and whatever writes the content.
//
// The chat only ever talks to the Client interface. Today the implementation is a deterministic demo (see Mock); the
// Claude Managed Agent adapter is a separate change and will implement the same interface. Whatever sits behind it, the
// agent can only return a Proposal of content fields, validated here. It cannot choose a layout or colours, and it has
// no way to save, publish or schedule anything: its output ends at a card the person must approve.
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	KindPost    = "post"
	KindArticle = "article"

	maxTitle     = 200
	maxPostChars = 3000 // LinkedIn's limit, counting the hashtag line
	maxArticle   = 20000
	maxAlt       = 1000
	maxRationale = 1000
	maxReply     = 4000
	maxTags      = 30
)

// Message is one turn of the conversation.
type Message struct {
	Role    string // "user" or "assistant"
	Content string
}

// Source is the article the conversation is about. Its text came from the internet or was pasted: it is DATA to read,
// never instructions to follow. Implementations must keep it apart from the user's own messages.
type Source struct {
	URL       string
	Title     string
	Text      string
	Truncated bool
	// New marks a source the agent has not been given yet.
	New bool
}

// Input is what the agent is given for one reply.
type Input struct {
	SessionID string
	Messages  []Message // oldest first; the last is the person's newest message
	Sources   []Source  // everything the conversation draws on, oldest first
}

// Event is progress while a reply is being written.
type Event struct {
	Type string // "delta"
	Text string
}

// Output is one reply. Proposal is nil when the agent only talks (a question, or "I can't do that").
type Output struct {
	SessionID string
	Reply     string
	Proposal  *Proposal
}

// Client is the port the chat uses. CreateSession starts a conversation on the agent's side; Respond sends the next
// message, reports progress through emit, and returns the reply with an optional proposal.
type Client interface {
	Name() string
	// IsAI says whether a language model is behind it (the demo is not), so the screen can be honest about it.
	IsAI() bool
	CreateSession(ctx context.Context) (string, error)
	Respond(ctx context.Context, in Input, emit func(Event)) (Output, error)
}

// Proposal is content the agent suggests. These are the only fields it may set.
type Proposal struct {
	Kind      string   `json:"kind"`
	Title     string   `json:"title"` // the card's headline
	Body      string   `json:"body"`  // plain text: paragraphs, "- " bullets, "## " headings for articles
	Hashtags  []string `json:"hashtags"`
	AltText   string   `json:"altText"`
	Rationale string   `json:"rationale"`
}

var hashtagRe = regexp.MustCompile(`^[\p{L}\p{N}_]{1,100}$`)

// NormalizeHashtags strips a leading #, drops duplicates (ignoring case) and rejects anything that is not a word.
func NormalizeHashtags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.TrimPrefix(strings.TrimSpace(t), "#")
		if !hashtagRe.MatchString(t) {
			return nil, fmt.Errorf("%q is not a valid hashtag", t)
		}
		if k := strings.ToLower(t); !seen[k] {
			seen[k] = true
			out = append(out, t)
		}
	}
	if len(out) > maxTags {
		return nil, fmt.Errorf("too many hashtags (max %d)", maxTags)
	}
	return out, nil
}

func hasControl(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\t' && r != '\r' {
			return true
		}
	}
	return false
}

// Normalize checks a proposal and tidies it. Anything wrong is an error, so invalid agent output is shown as an error
// and never reaches a draft.
func (p *Proposal) Normalize() error {
	p.Kind = strings.ToLower(strings.TrimSpace(p.Kind))
	if p.Kind != KindPost && p.Kind != KindArticle {
		return fmt.Errorf("the proposal's kind must be %q or %q", KindPost, KindArticle)
	}
	p.Title = strings.TrimSpace(p.Title)
	p.Body = strings.TrimSpace(strings.ReplaceAll(p.Body, "\r\n", "\n"))
	p.AltText = strings.TrimSpace(p.AltText)
	p.Rationale = strings.TrimSpace(p.Rationale)
	if p.Body == "" {
		return fmt.Errorf("the proposal has no text")
	}
	for name, v := range map[string]string{"title": p.Title, "body": p.Body, "alt text": p.AltText, "rationale": p.Rationale} {
		if hasControl(v) {
			return fmt.Errorf("the proposal's %s contains control characters", name)
		}
	}
	if utf8.RuneCountInString(p.Title) > maxTitle {
		return fmt.Errorf("the proposal's title is over %d characters", maxTitle)
	}
	if utf8.RuneCountInString(p.AltText) > maxAlt {
		return fmt.Errorf("the proposal's alt text is over %d characters", maxAlt)
	}
	if utf8.RuneCountInString(p.Rationale) > maxRationale {
		p.Rationale = string([]rune(p.Rationale)[:maxRationale])
	}
	tags, err := NormalizeHashtags(p.Hashtags)
	if err != nil {
		return err
	}
	p.Hashtags = tags
	n := utf8.RuneCountInString(p.Body)
	switch p.Kind {
	case KindPost:
		if len(tags) > 0 {
			n += 2 + len(tags) - 1
			for _, t := range tags {
				n += 1 + utf8.RuneCountInString(t)
			}
		}
		if n > maxPostChars {
			return fmt.Errorf("the post is %d characters, over LinkedIn's limit of %d", n, maxPostChars)
		}
	case KindArticle:
		p.Hashtags = []string{} // hashtags belong to posts
		if n > maxArticle {
			return fmt.Errorf("the article is over %d characters", maxArticle)
		}
	}
	return nil
}

// ParseProposal reads a proposal from JSON, as a real agent would return it. Only the content fields above are read:
// anything else (a layout, palette, background, "publish": true) is ignored and never applied.
func ParseProposal(raw []byte) (Proposal, error) {
	var p Proposal
	if err := json.Unmarshal(raw, &p); err != nil {
		return Proposal{}, fmt.Errorf("the agent's answer was not a valid proposal: %w", err)
	}
	if err := p.Normalize(); err != nil {
		return Proposal{}, err
	}
	return p, nil
}

// CleanReply trims and bounds the agent's chat text.
func CleanReply(s string) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > maxReply {
		s = string([]rune(s)[:maxReply])
	}
	return s
}
