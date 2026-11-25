package cma

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// Client is the chat's agent when a Claude Managed Agent is configured. It implements agent.Client.
type Client struct {
	api     sessionAPI
	timeout time.Duration
}

// DefaultTimeout bounds one reply, so a stuck session cannot leave the chat waiting for ever.
const DefaultTimeout = 4 * time.Minute

const maxReconnects = 3

// New returns a Client for the agent and environment in cfg. It makes no network call: a wrong id is found on first use.
func New(cfg Config, timeout time.Duration) (*Client, error) {
	if cfg.AgentID == "" || cfg.EnvironmentID == "" {
		return nil, errors.New("the managed agent needs both an agent id and an environment id (run `cardpress agent-setup` to create them)")
	}
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return &Client{api: newSDKAPI(cfg), timeout: timeout}, nil
}

// Name and IsAI let the screen say what is answering, and that the conversation goes to Anthropic.
func (c *Client) Name() string { return "Claude Managed Agent" }
func (c *Client) IsAI() bool   { return true }

// CreateSession starts a managed session for one conversation.
func (c *Client) CreateSession(ctx context.Context) (string, error) {
	return c.api.newSession(ctx, "CardPress conversation")
}

// lastUserMessage is the person's newest message: the only one to send, because the session remembers the rest.
func lastUserMessage(msgs []agent.Message) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "user" {
			return msgs[i].Content
		}
	}
	return ""
}

// settle answers any custom tool call that never got a result (an earlier turn was cut off). A session waiting on a result
// refuses new messages, so without this a conversation could be stuck for good.
func (c *Client) settle(ctx context.Context, sid string, hist []wireEvent) error {
	answered := map[string]bool{}
	for _, e := range hist {
		if e.Type == "user.custom_tool_result" {
			answered[e.CustomToolUseID] = true
		}
	}
	for _, e := range hist {
		if e.Type == "agent.custom_tool_use" && !answered[e.ID] {
			if err := c.api.sendToolResult(ctx, sid, toolResult{ToolUseID: e.ID, Text: "The previous attempt was interrupted. Ignore this call.", IsError: true}); err != nil {
				return err
			}
		}
	}
	return nil
}

// Respond sends the person's newest message and follows the session until the agent has finished, reporting the reply as it
// is written. The proposal comes from the agent calling the propose_content tool.
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
	text := lastUserMessage(in.Messages)
	if strings.TrimSpace(text) == "" {
		return agent.Output{}, errors.New("there is no message to send")
	}

	// the session's own history says whether the source has been sent already, and whether an earlier turn left a tool call unanswered
	hist, err := c.api.history(ctx, sid)
	if err != nil {
		if errors.Is(err, errSessionGone) {
			return agent.Output{}, errors.New("this conversation was started with a different agent, so it cannot continue. Start a new conversation")
		}
		return agent.Output{}, fmt.Errorf("could not read the session: %w", err)
	}
	if err := c.settle(ctx, sid, hist); err != nil {
		return agent.Output{}, fmt.Errorf("could not settle the previous turn: %w", err)
	}
	hasMessage := false
	for _, e := range hist {
		if e.Type == "user.message" {
			hasMessage = true
			break
		}
	}
	// a session with no message yet needs every source; otherwise only the ones it has not had
	var send []agent.Source
	for _, s := range in.Sources {
		if !hasMessage || s.New {
			send = append(send, s)
		}
	}
	text = WithSources(send, text)

	// open the stream first, so nothing the agent does is missed, then send
	st, err := c.api.stream(ctx, sid)
	if err != nil {
		return agent.Output{}, fmt.Errorf("could not open the event stream: %w", err)
	}
	defer func() { st.Close() }()
	sentID, err := c.api.sendMessage(ctx, sid, text)
	if err != nil {
		if errors.Is(err, errSessionGone) {
			return agent.Output{}, errors.New("this conversation was started with a different agent, so it cannot continue. Start a new conversation")
		}
		return agent.Output{}, fmt.Errorf("could not send the message: %w", err)
	}

	t := newTurn(sentID, text, emit)
	err = c.follow(ctx, sid, st, t, &st)
	if err != nil && ctx.Err() != nil {
		// we gave up (timeout or the person left): tell the agent to stop, so it does not keep running and spending
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
	out := t.output(sid)
	if out.Reply == "" && out.Proposal == nil {
		return agent.Output{}, errors.New("the agent finished without writing anything")
	}
	return out, nil
}

// follow reads events until the agent is done, answering tool calls as they arrive. If the stream drops it reconnects and
// replays the session's history (de-duplicated by the turn), so no event is lost.
func (c *Client) follow(ctx context.Context, sid string, st eventStream, t *turn, cur *eventStream) error {
	reconnects := 0
	for {
		for st.Next() {
			res, err := t.handle(st.Event())
			if err != nil {
				return err
			}
			if res != nil {
				if err := c.api.sendToolResult(ctx, sid, *res); err != nil {
					return fmt.Errorf("could not answer the agent's tool call: %w", err)
				}
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
			res, herr := t.handle(e)
			if herr != nil {
				return herr
			}
			if res != nil {
				if err := c.api.sendToolResult(ctx, sid, *res); err != nil {
					return fmt.Errorf("could not answer the agent's tool call: %w", err)
				}
			}
			if t.done {
				return nil
			}
		}
	}
}
