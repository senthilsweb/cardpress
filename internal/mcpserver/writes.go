package mcpserver

// The tools that change something: the words of a draft and of its card, a post's video, and a brand's notes. None of
// them publishes, schedules, cancels or deletes a draft, changes how a card looks, or reaches a credential.

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/senthilsweb/cardpress/internal/service"
)

// mayWrite refuses a caller whose key or role cannot change work. With no person in the context (the machine token, or a
// local stdio process) it may.
func mayWrite(ctx context.Context) error {
	if p, ok := service.PrincipalFrom(ctx); ok && !p.Can(service.PermWrite) {
		return service.ErrForbidden
	}
	return nil
}

// draft reads a draft the caller may reach. Another person's draft looks like one that does not exist.
func (t tools) draft(ctx context.Context, id string) (service.Draft, error) {
	d, err := t.d.Drafts.GetDraft(ctx, id)
	if err == nil {
		err = t.brand(ctx, d.ProfileID)
	}
	if err != nil {
		return service.Draft{}, err
	}
	return d, nil
}

/* ------------------------------------------------------------------ the card */

type draftRefIn struct {
	DraftID string `json:"draftId" jsonschema:"the draft id"`
}

type designOut struct {
	DraftID  string         `json:"draftId"`
	Revision int            `json:"revision"`
	Version  int            `json:"version"`
	Design   map[string]any `json:"design"`
	service.Effects
}

// designView is the card with pictures reported as present or absent, never as bytes.
func designView(card service.CardDesign) (map[string]any, error) {
	b, err := json.Marshal(card)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	m["photos"], m["screenshot"], m["bgImage"] = len(card.Photos) > 0, card.Screenshot != "", card.BgImage != ""
	return m, nil
}

func (t tools) getDesign(ctx context.Context, _ *mcp.CallToolRequest, in draftRefIn) (*mcp.CallToolResult, designOut, error) {
	if _, err := t.draft(ctx, in.DraftID); err != nil {
		return nil, designOut{}, toolError(err)
	}
	card, d, err := t.d.Writer.Card(ctx, in.DraftID)
	if err != nil {
		return nil, designOut{}, toolError(err)
	}
	view, err := designView(card)
	if err != nil {
		return nil, designOut{}, toolError(err)
	}
	return nil, designOut{DraftID: d.ID, Revision: d.Revision, Version: d.Version, Design: view}, nil
}

type cardTextIn struct {
	DraftID string `json:"draftId" jsonschema:"the draft id"`
	// a map, so that a field this tool must not touch is seen and refused with a reason
	Changes map[string]any `json:"changes" jsonschema:"only the words to change: eyebrow, title, subtitle, footer, footerLeft, tag, quoteAuthor, statValue"`
}

func cardText(changes map[string]any) (service.CardText, error) {
	var out service.CardText
	if len(changes) == 0 {
		return out, errors.New("Give at least one text field to change: " + strings.Join(service.CardTextFields, ", ") + ".")
	}
	var refused []string
	for k, v := range changes {
		if !slices.Contains(service.CardTextFields, k) {
			refused = append(refused, k)
			continue
		}
		if _, ok := v.(string); !ok {
			return out, errors.New(k + " must be text.")
		}
	}
	if len(refused) > 0 {
		sort.Strings(refused)
		return out, errors.New("Nothing was changed: " + strings.Join(refused, ", ") + " is not card text. How a card looks (layout, background, colours, size, fonts, images) is set by the person in the studio, under Edit, Design.")
	}
	b, _ := json.Marshal(changes)
	return out, json.Unmarshal(b, &out)
}

func (t tools) updateCardText(ctx context.Context, _ *mcp.CallToolRequest, in cardTextIn) (*mcp.CallToolResult, designOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, designOut{}, toolError(err)
	}
	if _, err := t.draft(ctx, in.DraftID); err != nil {
		return nil, designOut{}, toolError(err)
	}
	text, err := cardText(in.Changes)
	if err != nil {
		return nil, designOut{}, err
	}
	card, d, eff, err := t.d.Writer.PatchCardText(ctx, in.DraftID, text)
	if err != nil {
		return nil, designOut{}, toolError(err)
	}
	view, err := designView(card)
	if err != nil {
		return nil, designOut{}, toolError(err)
	}
	return nil, designOut{DraftID: d.ID, Revision: d.Revision, Version: d.Version, Design: view, Effects: eff}, nil
}

/* ------------------------------------------------------------------ drafts */

type writtenOut struct {
	draftOut
	service.Effects
}

type createIn struct {
	ProfileID string `json:"profileId" jsonschema:"the profile id from list_profiles"`
	Kind      string `json:"kind" jsonschema:"post or article"`
}

func (t tools) createDraft(ctx context.Context, _ *mcp.CallToolRequest, in createIn) (*mcp.CallToolResult, writtenOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	if err := t.brand(ctx, in.ProfileID); err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	d, err := t.d.Writer.NewAssistantDraft(ctx, in.ProfileID, strings.TrimSpace(in.Kind))
	if err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	return nil, writtenOut{draftOut: describe(d)}, nil
}

type updateIn struct {
	DraftID       string    `json:"draftId" jsonschema:"the draft id"`
	Revision      int       `json:"revision,omitempty" jsonschema:"the revision you read; required when you send body"`
	Body          *string   `json:"body,omitempty" jsonschema:"the whole text as plain text: blank lines between paragraphs, '- ' for bullets, '## ' headings in articles only"`
	Title         *string   `json:"title,omitempty" jsonschema:"the item's name, and an article's headline (not the headline on the card)"`
	Summary       *string   `json:"summary,omitempty" jsonschema:"one sentence for an article's public page"`
	Slug          *string   `json:"slug,omitempty" jsonschema:"the address of the public page"`
	Hashtags      *[]string `json:"hashtags,omitempty" jsonschema:"hashtags without the #, posts only"`
	AltText       *string   `json:"altText,omitempty" jsonschema:"a description of the card image for screen readers"`
	UnicodeStyles *bool     `json:"unicodeStyles,omitempty" jsonschema:"keep bold and italic in a post as Unicode letters"`
	Audience      *string   `json:"audience,omitempty" jsonschema:"who the item is for, in one line; never published"`
	Topic         *string   `json:"topic,omitempty" jsonschema:"what the item is about, in a few words; never published"`
}

func (t tools) updateDraft(ctx context.Context, _ *mcp.CallToolRequest, in updateIn) (*mcp.CallToolResult, writtenOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	if _, err := t.draft(ctx, in.DraftID); err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	if in.Body == nil && in.Title == nil && in.Summary == nil && in.Slug == nil && in.Hashtags == nil && in.AltText == nil && in.UnicodeStyles == nil && in.Audience == nil && in.Topic == nil {
		return nil, writtenOut{}, errors.New("Nothing to change: send at least one of body, title, summary, slug, hashtags, altText, unicodeStyles, audience, topic.")
	}
	d, eff, err := t.d.Writer.PatchDraft(ctx, in.DraftID, service.DraftPatch{Revision: in.Revision, Body: in.Body, Title: in.Title,
		Summary: in.Summary, Slug: in.Slug, Hashtags: in.Hashtags, AltText: in.AltText, UnicodeStyles: in.UnicodeStyles,
		Audience: in.Audience, Topic: in.Topic})
	if err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	return nil, writtenOut{describe(d), eff}, nil
}

type attachIn struct {
	DraftID  string `json:"draftId" jsonschema:"the id of a post"`
	Type     string `json:"type" jsonschema:"card (the designed card) or video (a video at a public address)"`
	VideoURL string `json:"videoUrl,omitempty" jsonschema:"for video: a direct https address of an MP4"`
	Title    string `json:"title,omitempty" jsonschema:"for video: the title shown with it"`
}

func (t tools) setAttachment(ctx context.Context, _ *mcp.CallToolRequest, in attachIn) (*mcp.CallToolResult, writtenOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	before, err := t.draft(ctx, in.DraftID)
	if err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	var d service.Draft
	switch in.Type {
	case service.AttachCard:
		d, err = t.d.Writer.ClearAttachment(ctx, in.DraftID)
	case "video":
		if d, err = t.d.Writer.SetVideo(ctx, in.DraftID, in.VideoURL); err == nil && strings.TrimSpace(in.Title) != "" {
			d, err = t.d.Writer.SetAttachmentTitle(ctx, in.DraftID, in.Title)
		}
	default:
		return nil, writtenOut{}, errors.New("type must be card or video. Pictures and PDFs are added by the person in the studio.")
	}
	if err != nil {
		return nil, writtenOut{}, toolError(err)
	}
	return nil, writtenOut{describe(d), service.Effects{ReturnedToDraft: before.Status != service.StatusDraft && d.Status == service.StatusDraft, PageTakenOffline: before.PageAt != "" && d.PageAt == ""}}, nil
}

/* ------------------------------------------------------------------ connections */

type connectionOut struct {
	Network   string `json:"network"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	CanPost   bool   `json:"canPost"`
}

type connectionsOut struct {
	Connections []connectionOut `json:"connections"`
	Note        string          `json:"note"`
}

func (t tools) listConnections(ctx context.Context, _ *mcp.CallToolRequest, in profileIn) (*mcp.CallToolResult, connectionsOut, error) {
	if err := t.brand(ctx, in.ProfileID); err != nil {
		return nil, connectionsOut{}, toolError(err)
	}
	v, err := t.d.Connections.View(ctx, in.ProfileID)
	if err != nil {
		return nil, connectionsOut{}, toolError(err)
	}
	out := connectionsOut{Connections: []connectionOut{}, Note: "Posting from this server is not available yet: the person posts from the studio's Full preview."}
	for _, n := range v.Networks {
		out.Connections = append(out.Connections, connectionOut{Network: n.ID, Name: n.Name, Connected: n.Complete, CanPost: false})
	}
	return nil, out, nil
}

/* ------------------------------------------------------------------ notes */

type memoriesOut struct {
	Notes []service.Memory `json:"notes"`
}

func (t tools) listMemories(ctx context.Context, _ *mcp.CallToolRequest, in profileIn) (*mcp.CallToolResult, memoriesOut, error) {
	if err := t.brand(ctx, in.ProfileID); err != nil {
		return nil, memoriesOut{}, toolError(err)
	}
	ms, err := t.d.Notes.ListMemories(ctx, in.ProfileID)
	if err != nil {
		return nil, memoriesOut{}, toolError(err)
	}
	return nil, memoriesOut{ms}, nil
}

type saveIn struct {
	ProfileID string `json:"profileId" jsonschema:"the profile id"`
	Key       string `json:"key" jsonschema:"a short name in lower-case letters, digits and hyphens"`
	Content   string `json:"content" jsonschema:"the note, in plain text"`
}

func (t tools) saveMemory(ctx context.Context, _ *mcp.CallToolRequest, in saveIn) (*mcp.CallToolResult, service.Memory, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, service.Memory{}, toolError(err)
	}
	if err := t.brand(ctx, in.ProfileID); err != nil {
		return nil, service.Memory{}, toolError(err)
	}
	m, err := t.d.Notes.SaveMemory(ctx, in.ProfileID, in.Key, in.Content)
	if err != nil {
		return nil, service.Memory{}, toolError(err)
	}
	return nil, m, nil
}

type forgetIn struct {
	ProfileID string `json:"profileId" jsonschema:"the profile id"`
	Key       string `json:"key" jsonschema:"the note's key"`
}

type doneOut struct {
	Done bool `json:"done"`
}

func (t tools) deleteMemory(ctx context.Context, _ *mcp.CallToolRequest, in forgetIn) (*mcp.CallToolResult, doneOut, error) {
	if err := mayWrite(ctx); err != nil {
		return nil, doneOut{}, toolError(err)
	}
	if err := t.brand(ctx, in.ProfileID); err != nil {
		return nil, doneOut{}, toolError(err)
	}
	if err := t.d.Notes.DeleteMemory(ctx, in.ProfileID, in.Key); err != nil {
		return nil, doneOut{}, toolError(err)
	}
	return nil, doneOut{true}, nil
}
