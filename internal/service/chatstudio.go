package service

// What an assistant that works in the studio is told with each message: which items the conversation is about, which it
// has not seen, what the person changed since it last looked, and which drafts to grade.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"sort"
	"strings"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// ChatStudio is the part of the studio the chat needs to tell an assistant where things stand.
type ChatStudio interface {
	NewAssistantDraft(ctx context.Context, profileID, kind string) (Draft, error)
	GetDraft(ctx context.Context, id string) (Draft, error)
	Card(ctx context.Context, draftID string) (CardDesign, Draft, error)
	BrandOwner(ctx context.Context, profileID string) (string, bool, error)
	ListMemories(ctx context.Context, profileID string) ([]Memory, error)
	putBack(ctx context.Context, draftID string, revision int, was snapshot) (Draft, error)
	saveWith(ctx context.Context, draftID string, revision int, picks []fieldPick) (Draft, int, error)
}

// ChatRequest is what comes with a message besides its words.
type ChatRequest struct {
	Write   []string // the kinds the person ticked: "post", "article"
	Viewing string   // the item on screen: "post" or "article"
}

// mayAsk refuses, before anything is saved, a request the assistant's key could not carry out.
func (c *Chat) mayAsk(ctx context.Context, profileID string) error {
	p, ok := PrincipalFrom(ctx)
	if !c.OwnBrandsOnly || c.Studio == nil || !ok || p.User == nil {
		return nil
	}
	owner, found, err := c.Studio.BrandOwner(ctx, profileID)
	if err != nil {
		return err
	}
	if !found || owner != p.User.ID {
		return invalid("the assistant works only in your own brands for now")
	}
	return nil
}

// sight is an item as the assistant last saw it.
type sight struct {
	Revision int               `json:"revision"`
	Card     map[string]any    `json:"card"`
	Text     map[string]string `json:"text"` // a fingerprint of each text field
}

// CardForAssistant is a design as an assistant reads it: pictures as present or absent, the headline by that name.
func CardForAssistant(c CardDesign) (map[string]any, error) {
	m, err := cardMap(c)
	if err != nil {
		return nil, err
	}
	return named(m), nil
}

// named renames the stored headline in a card map. What was seen is kept under the stored names.
func named(m map[string]any) map[string]any {
	out := maps.Clone(m)
	if v, ok := out[StoredHeadline]; ok {
		delete(out, StoredHeadline)
		out[Headline] = v
	}
	return out
}

func cardName(stored string) string {
	if stored == StoredHeadline {
		return Headline
	}
	return stored
}

// cardMap is a design with its pictures as present or absent.
func cardMap(c CardDesign) (map[string]any, error) {
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	m["photos"], m["screenshot"], m["bgImage"] = len(c.Photos) > 0, c.Screenshot != "", c.BgImage != ""
	return m, nil
}

func fingerprint(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}

func (c *Chat) look(ctx context.Context, draftID string) (sight, Draft, error) {
	card, d, err := c.Studio.Card(ctx, draftID)
	if err != nil {
		return sight{}, d, err
	}
	m, err := cardMap(card)
	if err != nil {
		return sight{}, d, err
	}
	tags, _ := json.Marshal(d.Hashtags)
	return sight{Revision: d.Revision, Card: m, Text: map[string]string{
		"body": fingerprint(DraftText(d.Doc)), "title": fingerprint(d.Title), "summary": fingerprint(d.Summary),
		"hashtags": fingerprint(string(tags)), "altText": fingerprint(d.AltText),
		"audience": fingerprint(d.Audience), "topic": fingerprint(d.Topic), "campaign": fingerprint(d.Campaign), "reviewNotes": fingerprint(d.ReviewNotes),
	}}, d, nil
}

// changedSince lists what differs between what was seen and what is there now.
func changedSince(was, now sight) []string {
	var out []string
	for k, v := range now.Card {
		a, _ := json.Marshal(was.Card[k])
		b, _ := json.Marshal(v)
		if string(a) != string(b) {
			out = append(out, cardName(k)+": "+string(b))
		}
	}
	for k := range was.Card {
		if _, still := now.Card[k]; !still {
			out = append(out, cardName(k)+": (cleared)")
		}
	}
	for k, v := range now.Text {
		// a field that did not exist when the item was last seen, and is empty, is not news
		if old, known := was.Text[k]; old != v && (known || v != fingerprint("")) {
			out = append(out, k+": changed")
		}
	}
	sort.Strings(out)
	return out
}

func kinds(list []string) []string {
	var out []string
	for _, k := range []string{KindPost, KindArticle} { // always the post first
		if slices.Contains(list, k) {
			out = append(out, k)
		}
	}
	return out
}

// prepare links a draft for each ticked kind that has none, and describes the studio to the assistant.
func (c *Chat) prepare(ctx context.Context, conv Conversation, req ChatRequest) (*agent.Studio, error) {
	conv, err := c.load(ctx, conv.ID) // the items linked so far
	if err != nil {
		return nil, err
	}
	st := &agent.Studio{ProfileID: conv.ProfileID, ConversationID: conv.ID, Write: kinds(req.Write)}
	if req.Viewing == KindPost || req.Viewing == KindArticle {
		st.Viewing = req.Viewing
	}
	linked := map[string]string{}
	for kind, id := range map[string]string{KindPost: conv.PostDraftID, KindArticle: conv.ArticleDraftID} {
		if id == "" {
			continue
		}
		d, err := c.Studio.GetDraft(ctx, id)
		if errors.Is(err, ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if d.Kind == kind && d.ProfileID == conv.ProfileID { // a draft whose type was changed since is no longer that kind
			linked[kind] = id
		}
	}
	for _, kind := range st.Write {
		if linked[kind] != "" {
			continue
		}
		d, err := c.Studio.NewAssistantDraft(ctx, conv.ProfileID, kind)
		if err != nil {
			return nil, err
		}
		if err := linkDraft(ctx, c.db, conv.ID, d.ID); err != nil {
			return nil, err
		}
		linked[kind] = d.ID
	}
	st.PostID, st.ArticleID = linked[KindPost], linked[KindArticle]
	notes, err := c.Studio.ListMemories(ctx, conv.ProfileID)
	if err != nil {
		return nil, err
	}
	for _, n := range notes {
		st.Notes = append(st.Notes, n.Key+": "+strings.Join(strings.Fields(n.Content), " "))
	}

	var graded, rawSeen string
	if err := c.db.QueryRowContext(ctx, `SELECT graded, seen FROM conversations WHERE id = ?`, conv.ID).Scan(&graded, &rawSeen); err != nil {
		return nil, err
	}
	for _, kind := range st.Write {
		if !slices.Contains(strings.Split(graded, ","), kind) {
			st.Grade = append(st.Grade, kind)
		}
	}
	// the brand says whether first drafts are graded, and how often one may be sent back
	plan, _, _, err := c.assistantFor(ctx, conv.ProfileID)
	if err != nil {
		return nil, err
	}
	if plan.Checks {
		st.Rounds = plan.Rounds
	} else {
		st.Unchecked, st.Grade = st.Grade, nil
	}
	seen := map[string]sight{}
	_ = json.Unmarshal([]byte(rawSeen), &seen)
	for _, id := range []string{st.PostID, st.ArticleID} {
		if id == "" {
			continue
		}
		now, d, err := c.look(ctx, id)
		if err != nil {
			return nil, err
		}
		was, known := seen[id]
		if !known {
			b, _ := json.Marshal(named(now.Card))
			st.Cards = append(st.Cards, agent.Card{DraftID: id, Revision: d.Revision, Design: string(b)})
		} else if was.Revision != d.Revision {
			if lines := changedSince(was, now); len(lines) > 0 {
				st.Changes = append(st.Changes, agent.Change{DraftID: id, Revision: d.Revision, Lines: lines})
			}
		}
	}
	return st, nil
}

// remember records, after a reply, what the assistant has now seen (its own changes included) and what it has graded.
func (c *Chat) remember(ctx context.Context, convID string, st *agent.Studio) error {
	seen := map[string]sight{}
	var graded, rawSeen string
	if err := c.db.QueryRowContext(ctx, `SELECT graded, seen FROM conversations WHERE id = ?`, convID).Scan(&graded, &rawSeen); err != nil {
		return err
	}
	_ = json.Unmarshal([]byte(rawSeen), &seen)
	conv, err := c.load(ctx, convID) // the assistant may have made an item
	if err != nil {
		return err
	}
	for _, id := range []string{st.PostID, st.ArticleID, conv.PostDraftID, conv.ArticleDraftID} {
		if id == "" {
			continue
		}
		now, _, err := c.look(ctx, id)
		if errors.Is(err, ErrNotFound) {
			delete(seen, id)
			continue
		}
		if err != nil {
			return err
		}
		seen[id] = now
	}
	// a first draft written without a check has still been written: turning checks on later does not grade a second one
	done := kinds(append(append(strings.Split(graded, ","), st.Grade...), st.Unchecked...))
	b, err := json.Marshal(seen)
	if err != nil {
		return err
	}
	_, err = c.db.ExecContext(ctx, `UPDATE conversations SET graded = ?, seen = ? WHERE id = ?`, strings.Join(done, ","), string(b), convID)
	return err
}
