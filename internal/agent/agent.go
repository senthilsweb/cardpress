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
	"errors"
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
	// ID names the source for the whole conversation ("s1", "s2", …); Kind is url, text, md, docx or pdf.
	ID        string
	Kind      string
	URL       string
	Title     string
	Text      string
	Truncated bool
	// New marks a source the agent has not been given yet.
	New bool
}

// Versioned is an assistant that can say which version of its agents and of their content schema it is using.
type Versioned interface {
	Versions() (agent string, schema int)
}

// Tier is one set of agents an assistant offers, for a brand to be given: the same work on other models.
type Tier struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Models says which model does what, for the screen: "Coordinator" and each writer.
	Models []TierModel `json:"models,omitempty"`
}

// TierModel is one line of a tier: a role and the model's name.
type TierModel struct {
	Role  string `json:"role"`
	Model string `json:"model"`
}

// Tiered is an assistant that offers tiers. The first is the one used when nothing is chosen.
type Tiered interface {
	Tiers() []Tier
}

// ErrSessionGone is an agent saying it no longer has the session it was asked to continue.
var ErrSessionGone = errors.New("the session cannot be continued")

// Usage is the running total of a session: its cost at list price in cents, and the seconds it has been working.
type Usage struct {
	TotalCents    int
	ActiveSeconds float64
}

// Studio is what an assistant that works in the studio is told with a message.
type Studio struct {
	ProfileID      string
	ConversationID string
	Viewing        string // "post" or "article": the item on screen
	PostID         string // the conversation's post, or empty
	ArticleID      string
	Write          []string // the kinds the person ticked for this message
	Grade          []string // those of Write that are first drafts, to be written as graded outcomes, in this order
	// Rounds is how often the grader may send a draft back; 0 leaves it to the agent.
	Rounds int
	// Unchecked are first drafts that are not graded, because the brand's checks are off.
	Unchecked []string
	Cards          []Card   // items the assistant has not seen yet
	Changes        []Change // what the person changed since it last saw an item
	Notes          []string // the brand's notes as "key: content", for a session's first message
}

// Card is a draft's card as the assistant first sees it; Design is JSON with pictures as present or absent.
type Card struct {
	DraftID  string
	Revision int
	Design   string
}

// Change says what the person changed in a draft: lines such as `background: "mesh"` or `body: changed`.
type Change struct {
	DraftID  string
	Revision int
	Lines    []string
}

// Input is what the agent is given for one reply.
type Input struct {
	// Studio is where the conversation stands in the studio; nil for an assistant that only proposes.
	Studio    *Studio
	SessionID string
	Messages  []Message // oldest first; the last is the person's newest message
	Sources   []Source  // everything the conversation draws on, oldest first
	// Restarted is true when an earlier session could not be continued: this one is new and has been given nothing.
	Restarted bool
}

// Event is progress while a reply is being written.
type Event struct {
	Type string // "delta" (text of the reply), "progress" (what is being done) or "check" (how a draft was graded)
	Text string
	// Check is set on a "check" event.
	Check *Check
}

// Check is the grader's verdict on a first draft.
type Check struct {
	Kind   string `json:"kind"`
	Passed bool   `json:"passed"`
	Round  int    `json:"round,omitempty"`
	// Note says what was wrong when it did not pass.
	Note string `json:"note,omitempty"`
}

// Output is one reply. Proposal is nil when the agent only talks (a question, or "I can't do that").
type Output struct {
	SessionID string
	Reply     string
	// Reports are the short answers, one for each part of the turn, from an assistant that gives them.
	Reports  []Report
	Proposal *Proposal
	// Usage is what the session has cost so far, when the agent reports it.
	Usage *Usage
}

// Client is the port the chat uses. CreateSession starts a conversation on the agent's side; Respond sends the next
// message, reports progress through emit, and returns the reply with an optional proposal.
type Client interface {
	// Ready reports whether an assistant is set up at all.
	Ready() bool
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

// None is the assistant of a server that has none set up. Conversations can be read, but nothing answers.
type None struct{}

func (None) Name() string { return "No assistant" }
func (None) IsAI() bool   { return false }
func (None) Ready() bool  { return false }

// ErrNoAssistant is the answer to a message when no assistant is set up.
var ErrNoAssistant = errors.New("no assistant is set up on this server")

func (None) CreateSession(context.Context) (string, error) { return "", ErrNoAssistant }
func (None) Respond(context.Context, Input, func(Event)) (Output, error) {
	return Output{}, ErrNoAssistant
}
