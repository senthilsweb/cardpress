package cma

import (
	"context"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go/v2"
)

// Created is what Setup made.
type Created struct {
	AgentID       string
	AgentVersion  int64
	EnvironmentID string
}

// Setup creates the agent and its environment once, in the account the API key belongs to. The agent has the
// propose_content tool and none of the built-in tools; the environment has no network access. Nothing here runs unless a
// person runs `cardpress agent-setup`.
func Setup(ctx context.Context, cfg Config, model string) (Created, error) {
	if model == "" {
		model = DefaultModel
	}
	c := newSDK(cfg)
	props, required := ToolSchema()
	ag, err := c.Beta.Agents.New(ctx, anthropic.BetaAgentNewParams{
		Name:        "CardPress writer",
		Description: anthropic.String("Drafts LinkedIn posts and articles for a person to review. Cannot publish."),
		System:      anthropic.String(SystemPrompt),
		Model:       anthropic.BetaManagedAgentsModelConfigParams{ID: anthropic.BetaManagedAgentsModel(model)},
		Tools: []anthropic.BetaAgentNewParamsToolUnion{{OfCustom: &anthropic.BetaManagedAgentsCustomToolParams{
			Name:        ToolName,
			Description: toolDescription,
			InputSchema: anthropic.BetaManagedAgentsCustomToolInputSchemaParam{Properties: props, Required: required},
		}}},
		Metadata: map[string]string{"app": "cardpress"},
	})
	if err != nil {
		return Created{}, fmt.Errorf("creating the agent: %w", err)
	}
	env, err := c.Beta.Environments.New(ctx, anthropic.BetaEnvironmentNewParams{
		Name: "CardPress (no network)",
		Config: anthropic.BetaEnvironmentNewParamsConfigUnion{OfCloud: &anthropic.BetaCloudConfigParams{
			Networking: anthropic.BetaCloudConfigParamsNetworkingUnion{OfLimited: &anthropic.BetaLimitedNetworkParams{}},
		}},
	})
	if err != nil {
		return Created{AgentID: ag.ID, AgentVersion: ag.Version}, fmt.Errorf("creating the environment (the agent %s was created): %w", ag.ID, err)
	}
	return Created{AgentID: ag.ID, AgentVersion: ag.Version, EnvironmentID: env.ID}, nil
}
