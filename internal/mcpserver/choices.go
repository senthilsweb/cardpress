package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/senthilsweb/cardpress/internal/service"
)

type offerIn struct {
	ConversationID string              `json:"conversationId" jsonschema:"the conversationId from the studio block"`
	DraftID        string              `json:"draftId" jsonschema:"the item the options are for"`
	Fields         []service.ChoiceSet `json:"fields" jsonschema:"for each field (headline, eyebrow, subtitle, tag, title, altText, summary, hashtags): 2 to 6 options, the recommended one first; a value is text, or for hashtags a list of words"`
}

type offerOut struct {
	Offered bool `json:"offered"`
}

// offerChoices shows the person options to pick from. It changes no draft.
func (t tools) offerChoices(ctx context.Context, _ *mcp.CallToolRequest, in offerIn) (*mcp.CallToolResult, offerOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, offerOut{}, toolError(err)
	}
	brand, err := t.d.Proposals.ConversationBrand(ctx, in.ConversationID)
	if err == nil {
		err = t.brand(ctx, brand)
	}
	if err == nil {
		_, err = t.draft(ctx, in.DraftID)
	}
	if err == nil {
		err = t.d.Writer.OfferChoices(ctx, in.ConversationID, in.DraftID, in.Fields)
	}
	if err != nil {
		return nil, offerOut{}, toolError(err)
	}
	return nil, offerOut{Offered: true}, nil
}
