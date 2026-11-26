package cma

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// Client is the chat's assistant when the managed agents are configured. It implements agent.Client.
type Client struct {
	api     sessionAPI
	m       Manifest
	timeout time.Duration
}

// DefaultTimeout bounds one reply. A graded article takes several minutes.
const DefaultTimeout = 12 * time.Minute

const maxReconnects = 3

// New returns a Client for the agents in cfg's manifest. It makes no network call: a wrong id is found on first use.
func New(cfg Config, timeout time.Duration) (*Client, error) {
	if cfg.Manifest.AgentID == "" {
		return nil, errors.New("no agent manifest")
	}
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return &Client{api: newSDKAPI(cfg), m: cfg.Manifest, timeout: timeout}, nil
}

// Name and IsAI let the screen say what is answering, and that the conversation goes to Anthropic.
func (c *Client) Name() string { return "Claude agent" }
func (c *Client) IsAI() bool   { return true }
func (c *Client) Ready() bool  { return true }

// CreateSession starts a managed session for one conversation.
func (c *Client) CreateSession(ctx context.Context) (string, error) {
	return c.api.newSession(ctx, "CardPress conversation")
}

// Respond sends the person's newest message with its context and follows the session until the agent has finished. Each
// kind to be graded is sent as an outcome, one after the other; otherwise it is an ordinary message. The agents write to
// the studio themselves, so the answer is what they say and what it cost.
func (c *Client) Respond(ctx context.Context, in agent.Input, emit func(agent.Event)) (agent.Output, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	sid := in.SessionID
	if sid == "" {
		var err error
		if sid, err = c.CreateSession(ctx); err != nil {
			return agent.Output{}, fmt.Errorf("could not start a session: %w", err)
		}
	}
	at := -1
	for i := len(in.Messages) - 1; i >= 0; i-- {
		if in.Messages[i].Role == "user" {
			at = i
			break
		}
	}
	if at < 0 || strings.TrimSpace(in.Messages[at].Content) == "" {
		return agent.Output{}, errors.New("there is no message to send")
	}
	text := in.Messages[at].Content
	if strings.HasPrefix(sid, "demo-") { // a conversation begun with the demo assistant, which no longer exists
		return agent.Output{}, agent.ErrSessionGone
	}

	// the session's own history says whether it has been given anything yet
	hist, err := c.api.history(ctx, sid)
	if err != nil {
		if errors.Is(err, errSessionGone) {
			return agent.Output{}, agent.ErrSessionGone
		}
		return agent.Output{}, fmt.Errorf("could not read the session: %w", err)
	}
	fresh := !slices.ContainsFunc(hist, func(e wireEvent) bool { return e.Type == "user.message" || e.Type == "user.define_outcome" })
	var earlier []agent.Message
	if fresh && in.Restarted {
		earlier = in.Messages[:at]
	}
	var unsent []agent.Source
	for _, s := range in.Sources {
		if fresh || s.New {
			unsent = append(unsent, s)
		}
	}

	var replies []string
	graded := false
	run := func(send func() (string, error), kind string) error { // kind: what is graded, or empty
		// open the stream first, so nothing the agent does is missed, then send
		st, err := c.api.stream(ctx, sid)
		if err != nil {
			return fmt.Errorf("could not open the event stream: %w", err)
		}
		defer func() { st.Close() }()
		sentID, err := send()
		if err != nil {
			if errors.Is(err, errSessionGone) {
				return agent.ErrSessionGone
			}
			return fmt.Errorf("could not send the message: %w", err)
		}
		t := newTurn(sentID, kind != "", emit)
		t.kind = kind
		if err := c.follow(ctx, sid, st, t, &st); err != nil {
			return err
		}
		graded = graded || t.verdict != nil
		if r := t.reply(); r != "" {
			replies = append(replies, r)
		}
		return nil
	}

	var grade []string
	if in.Studio != nil {
		grade = in.Studio.Grade
	}
	if len(grade) == 0 {
		var write []string
		if in.Studio != nil {
			write = in.Studio.Write
		}
		msg := contextBlocks(in, write, unsent, earlier, true, fresh) + "\n" + text
		err = run(func() (string, error) { return c.api.sendMessage(ctx, sid, msg) }, "")
	}
	for i, kind := range grade {
		o, ok := c.m.Outcomes[kind]
		if !ok {
			return agent.Output{}, fmt.Errorf("the agent has no rubric for %q", kind)
		}
		// the grader sees only this description, so every source goes with every outcome
		h := earlier
		if i > 0 {
			h = nil
		}
		description := contextBlocks(in, []string{kind}, in.Sources, h, i == 0, i == 0 && fresh) + "\n" + text + "\n\n" + o.Description
		if err = run(func() (string, error) { return c.api.sendOutcome(ctx, sid, description, o.Rubric, o.MaxIterations) }, kind); err != nil {
			break
		}
	}

	if err != nil && ctx.Err() != nil {
		// we gave up (timeout or the person pressed stop): tell the agent to stop, so it does not keep running and spending
		ic, icancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		_ = c.api.interrupt(ic, sid)
		icancel()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return agent.Output{}, fmt.Errorf("the agent took longer than %s and was stopped", c.timeout.Round(time.Second))
		}
		return agent.Output{}, ctx.Err()
	}
	if err != nil {
		return agent.Output{}, err
	}
	out := agent.Output{SessionID: sid, Reply: agent.CleanReply(strings.Join(replies, "\n\n"))}
	if out.Reply == "" && !graded {
		return agent.Output{}, errors.New("the agent finished without saying anything")
	}
	uc, ucancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer ucancel()
	if u, err := c.api.usage(uc, sid); err == nil {
		out.Usage = &u
	} else {
		log.Printf("agent: could not read what the conversation cost: %v", err)
	}
	return out, nil
}

// follow reads events until the agent is done. If the stream drops it reconnects and replays the session's history
// (de-duplicated by the turn), so no event is lost.
func (c *Client) follow(ctx context.Context, sid string, st eventStream, t *turn, cur *eventStream) error {
	reconnects := 0
	for {
		for st.Next() {
			if err := t.handle(st.Event()); err != nil {
				return err
			}
			if t.done {
				return nil
			}
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// the stream ended before the agent finished
		if reconnects++; reconnects > maxReconnects {
			if err := st.Err(); err != nil {
				return fmt.Errorf("the connection to the agent kept dropping: %w", err)
			}
			return errors.New("the connection to the agent kept dropping")
		}
		st.Close()
		next, err := c.api.stream(ctx, sid)
		if err != nil {
			return fmt.Errorf("could not reconnect to the agent: %w", err)
		}
		*cur, st = next, next
		hist, err := c.api.history(ctx, sid) // read what happened while we were away, now that the new stream is buffering
		if err != nil {
			return fmt.Errorf("could not catch up after reconnecting: %w", err)
		}
		for _, e := range hist {
			if err := t.handle(e); err != nil {
				return err
			}
			if t.done {
				return nil
			}
		}
	}
}
