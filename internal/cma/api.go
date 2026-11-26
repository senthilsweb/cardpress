package cma

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// sessionAPI is the part of the Managed Agents API the client uses. The real one wraps the SDK; tests use a scripted fake.
type sessionAPI interface {
	newSession(ctx context.Context, title string) (string, error)
	sendMessage(ctx context.Context, sessionID, text string) (eventID string, err error)
	sendOutcome(ctx context.Context, sessionID, description, rubric string, iterations int) (eventID string, err error)
	interrupt(ctx context.Context, sessionID string) error
	history(ctx context.Context, sessionID string) ([]wireEvent, error)
	stream(ctx context.Context, sessionID string) (eventStream, error)
	usage(ctx context.Context, sessionID string) (agent.Usage, error)
}

// eventStream is a live event stream, already open (and so already buffering) when stream returns.
type eventStream interface {
	Next() bool
	Event() wireEvent
	Err() error
	Close() error
}

// errSessionGone means the session id is not one this agent knows.
var errSessionGone = errors.New("the session does not exist")

// Config says how to reach the agents.
type Config struct {
	Manifest    Manifest
	BudgetCents int    // spend cap per conversation, in US cents; 0 = none
	APIKey      string // empty: the SDK reads ANTHROPIC_API_KEY (or a logged-in profile)
	WorkspaceID string // for a key that can act on more than one workspace
	BaseURL     string // empty: Anthropic's API. For tests and proxies.
}

func newSDK(cfg Config) anthropic.Client {
	var opts []option.RequestOption
	if cfg.APIKey != "" {
		opts = append(opts, option.WithAPIKey(cfg.APIKey))
	}
	if cfg.WorkspaceID != "" {
		opts = append(opts, option.WithHeader("anthropic-workspace-id", cfg.WorkspaceID))
	}
	if cfg.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(cfg.BaseURL))
	}
	return anthropic.NewClient(opts...)
}

type sdkAPI struct {
	c   anthropic.Client
	cfg Config
}

func newSDKAPI(cfg Config) *sdkAPI { return &sdkAPI{c: newSDK(cfg), cfg: cfg} }

// gone turns a 404 from the API into errSessionGone.
func gone(err error) error {
	var apierr *anthropic.Error
	if errors.As(err, &apierr) && apierr.StatusCode == http.StatusNotFound {
		return errSessionGone
	}
	return err
}

func (a *sdkAPI) newSession(ctx context.Context, title string) (string, error) {
	m := a.cfg.Manifest
	p := anthropic.BetaSessionNewParams{
		Agent:         anthropic.BetaSessionNewParamsAgentUnion{OfString: anthropic.String(m.AgentID)},
		EnvironmentID: m.EnvironmentID,
		VaultIDs:      []string{m.VaultID},
		Title:         anthropic.String(title),
		Metadata:      map[string]string{"app": "cardpress"},
	}
	if v, err := strconv.Atoi(m.AgentVersion); err == nil {
		p.Agent = anthropic.BetaSessionNewParamsAgentUnion{OfBetaManagedAgentsAgents: &anthropic.BetaManagedAgentsAgentParams{ID: m.AgentID, Version: anthropic.Int(int64(v))}}
	}
	if a.cfg.BudgetCents > 0 {
		p.Budget = anthropic.BetaManagedAgentsBudgetLimitParam{MaxListCost: anthropic.BetaMonetaryAmountParam{Amount: strconv.Itoa(a.cfg.BudgetCents), Currency: "USD"}}
	}
	s, err := a.c.Beta.Sessions.New(ctx, p)
	if err != nil {
		return "", err
	}
	return s.ID, nil
}

func (a *sdkAPI) send(ctx context.Context, sid string, e anthropic.BetaManagedAgentsEventParamsUnion) (string, error) {
	res, err := a.c.Beta.Sessions.Events.Send(ctx, sid, anthropic.BetaSessionEventSendParams{Events: []anthropic.BetaManagedAgentsEventParamsUnion{e}})
	if err != nil {
		return "", gone(err)
	}
	if len(res.Data) == 0 {
		return "", nil
	}
	return res.Data[0].ID, nil
}

func (a *sdkAPI) sendMessage(ctx context.Context, sid, text string) (string, error) {
	return a.send(ctx, sid, anthropic.BetaManagedAgentsEventParamsUnion{OfUserMessage: &anthropic.BetaManagedAgentsUserMessageEventParams{
		Content: []anthropic.BetaManagedAgentsUserMessageEventParamsContentUnion{{OfText: &anthropic.BetaManagedAgentsTextBlockParam{Text: text}}},
	}})
}

func (a *sdkAPI) sendOutcome(ctx context.Context, sid, description, rubric string, iterations int) (string, error) {
	p := &anthropic.BetaManagedAgentsUserDefineOutcomeEventParams{
		Description: description,
		Rubric:      anthropic.BetaManagedAgentsUserDefineOutcomeEventParamsRubricUnion{OfText: &anthropic.BetaManagedAgentsTextRubricParams{Content: rubric}},
	}
	if iterations > 0 {
		p.MaxIterations = anthropic.Int(int64(iterations))
	}
	return a.send(ctx, sid, anthropic.BetaManagedAgentsEventParamsUnion{OfUserDefineOutcome: p})
}

func (a *sdkAPI) interrupt(ctx context.Context, sid string) error {
	_, err := a.send(ctx, sid, anthropic.BetaManagedAgentsEventParamsUnion{OfUserInterrupt: &anthropic.BetaManagedAgentsUserInterruptEventParams{}})
	return err
}

func (a *sdkAPI) usage(ctx context.Context, sid string) (agent.Usage, error) {
	s, err := a.c.Beta.Sessions.Get(ctx, sid, anthropic.BetaSessionGetParams{})
	if err != nil {
		return agent.Usage{}, gone(err)
	}
	cents, err := strconv.Atoi(s.Usage.ListCost.Amount)
	if err != nil {
		return agent.Usage{}, errors.New("the session reports no cost")
	}
	return agent.Usage{TotalCents: cents, ActiveSeconds: s.Usage.ActiveSeconds}, nil
}

func (a *sdkAPI) history(ctx context.Context, sid string) ([]wireEvent, error) {
	it := a.c.Beta.Sessions.Events.ListAutoPaging(ctx, sid, anthropic.BetaSessionEventListParams{})
	var out []wireEvent
	for it.Next() {
		var e wireEvent
		if err := json.Unmarshal([]byte(it.Current().RawJSON()), &e); err == nil {
			out = append(out, e)
		}
	}
	if err := it.Err(); err != nil {
		return nil, gone(err)
	}
	return out, nil
}

type sdkStream struct {
	s interface {
		Next() bool
		Err() error
		Close() error
	}
	raw func() string
	cur wireEvent
}

func (s *sdkStream) Next() bool {
	for s.s.Next() {
		var e wireEvent
		if err := json.Unmarshal([]byte(s.raw()), &e); err == nil {
			s.cur = e
			return true
		}
		// an event this adapter cannot read is skipped; it cannot be one it needs
	}
	return false
}
func (s *sdkStream) Event() wireEvent { return s.cur }
func (s *sdkStream) Err() error       { return s.s.Err() }
func (s *sdkStream) Close() error     { return s.s.Close() }

func (a *sdkAPI) stream(ctx context.Context, sid string) (eventStream, error) {
	st := a.c.Beta.Sessions.Events.StreamEvents(ctx, sid, anthropic.BetaSessionEventStreamParams{})
	if err := st.Err(); err != nil {
		st.Close()
		return nil, gone(err)
	}
	return &sdkStream{s: st, raw: func() string { return st.Current().RawJSON() }}, nil
}
