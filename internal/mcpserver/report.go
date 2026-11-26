package mcpserver

import (
	"context"
	"errors"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/senthilsweb/cardpress/internal/agent"
)

type replyIn struct {
	ConversationID string   `json:"conversationId" jsonschema:"the conversationId from the studio block"`
	Outcome        string   `json:"outcome" jsonschema:"done, needs_answer or not_done"`
	Message        string   `json:"message" jsonschema:"one or two sentences: what happened, or the answer"`
	Points         []string `json:"points,omitempty" jsonschema:"choices made and why, or the parts of an answer"`
	Question       string   `json:"question,omitempty" jsonschema:"the one thing to ask"`
	Next           string   `json:"next,omitempty" jsonschema:"one suggested next step"`
}

type replyOut struct {
	Shown bool `json:"shown"`
}

// reportReply checks an assistant's answer. The studio reads it from the session; nothing is changed here.
func (t tools) reportReply(ctx context.Context, _ *mcp.CallToolRequest, in replyIn) (*mcp.CallToolResult, replyOut, error) {
	brand, err := t.d.Proposals.ConversationBrand(ctx, in.ConversationID)
	if err == nil {
		err = t.brand(ctx, brand)
	}
	if err != nil {
		return nil, replyOut{}, toolError(err)
	}
	r := agent.Report{Outcome: in.Outcome, Message: in.Message, Points: in.Points, Question: in.Question, Next: in.Next}
	if err := r.Check(); err != nil {
		return nil, replyOut{}, errors.New("The reply was not accepted: " + err.Error() + ".")
	}
	return nil, replyOut{Shown: true}, nil
}
