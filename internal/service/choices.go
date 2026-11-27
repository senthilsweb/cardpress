package service

// Options an assistant offers for a field, and the person's saving of a reply: with whichever options they picked, as a
// version. No model is called.

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// Where an offer stands.
const (
	ChoicePending    = "pending"
	ChoiceChosen     = "chosen"
	ChoiceDismissed  = "dismissed"
	ChoiceSuperseded = "superseded"
)

const (
	minOptions    = 2
	maxOptions    = 6
	maxChoiceSets = 12 // every field there is
	maxOptionNote = 80
)

// choiceFields are the fields an assistant may offer options for, and the kinds that have them.
var choiceFields = map[string][]string{
	"headline": {KindPost, KindArticle}, "eyebrow": {KindPost, KindArticle}, "subtitle": {KindPost, KindArticle}, "tag": {KindPost, KindArticle},
	"footer": {KindPost, KindArticle}, "footerLeft": {KindPost, KindArticle}, "quoteAuthor": {KindPost, KindArticle}, "statValue": {KindPost, KindArticle},
	"signature": {KindPost, KindArticle},
	"title":     {KindPost, KindArticle}, "altText": {KindPost, KindArticle}, "hashtags": {KindPost}, "summary": {KindArticle},
}

// cardWord is where an offered field is drawn on a card, or nil for a field of the item itself.
func cardWord(c *CardDesign, field string) *string {
	return map[string]*string{"headline": &c.Title, "eyebrow": &c.Eyebrow, "subtitle": &c.Subtitle, "tag": &c.Tag,
		"footer": &c.Footer, "footerLeft": &c.FooterLeft, "quoteAuthor": &c.QuoteAuthor, "statValue": &c.StatValue,
		"signature": &c.Signature}[field]
}

// removable says whether an option may be empty, taking the words off the card. A card keeps a headline.
func removable(field string) bool {
	return field != "headline" && cardWord(&CardDesign{}, field) != nil
}

// Option is one value offered: text, or a list for hashtags. Note says in a few words how it differs.
type Option struct {
	Value any    `json:"value"`
	Note  string `json:"note,omitempty"`
}

// ChoiceSet is the options for one field, the recommended one first.
type ChoiceSet struct {
	Field   string   `json:"field"`
	Options []Option `json:"options"`
}

// ChoiceView is an offer as the screen shows it.
type ChoiceView struct {
	ID        string   `json:"id"`
	MessageID string   `json:"messageId"`
	DraftID   string   `json:"draftId"`
	Kind      string   `json:"kind"`
	Field     string   `json:"field"`
	Options   []Option `json:"options"`
	Status    string   `json:"status"`
	Chosen    int      `json:"chosen"` // -1 until one is
}

// Pick is the option a person chose from one offer.
type Pick struct {
	ChoiceID string `json:"choiceId"`
	Option   int    `json:"option"`
}

// fieldChange is a draft's input with one field set to an offered value, and the value in its stored form.
type fieldChange struct {
	in    DraftInput
	page  PageFields
	value any
}

// withField sets one field, applying the same checks as any write to it.
func (s *Studio) withField(ctx context.Context, cur Draft, fc *fieldChange, field string, value any) error {
	if field == "hashtags" {
		var tags []string
		b, _ := json.Marshal(value)
		if json.Unmarshal(b, &tags) != nil || len(tags) == 0 {
			return invalid("hashtags: each option is a list of words")
		}
		tags, err := normalizeHashtags(tags)
		if err != nil {
			return err
		}
		fc.in.Hashtags, fc.value = tags, tags
		return nil
	}
	text, ok := value.(string)
	if text = strings.TrimSpace(text); !ok || (text == "" && !removable(field)) {
		return invalid("%s: each option is a piece of text", field)
	}
	if err := cleanText(text, 1000); err != nil {
		return err
	}
	fc.value = text
	switch field {
	case "title":
		fc.in.Title = text
	case "altText":
		fc.in.AltText = text
	case "summary":
		fc.page.Summary = &text
		_, _, err := s.pageFields(ctx, cur, PageFields{Summary: &text})
		return err
	default: // a word on the card
		card, _, err := s.Card(ctx, cur.ID)
		if len(fc.in.Design) > 0 {
			card, err = ParseCardDesign(fc.in.Design)
		}
		if err != nil {
			return err
		}
		*cardWord(&card, field) = text
		card.emptied(field, text)
		if err := card.validate(); err != nil {
			return err
		}
		if fc.in.Design, err = json.Marshal(card); err != nil {
			return err
		}
	}
	probe := fc.in
	return probe.normalize()
}

// OfferChoices keeps the options an assistant offers while it writes a reply. It changes no draft. One bad value
// refuses the whole offer.
func (s *Studio) OfferChoices(ctx context.Context, convID, draftID string, sets []ChoiceSet) error {
	cur, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return err
	}
	_, writing, err := openChange(ctx, s.db, draftID)
	if err != nil {
		return err
	}
	if writing != convID {
		return invalid("options are offered while writing a reply, for an item of that conversation")
	}
	if err := editable(cur); err != nil {
		return err
	}
	if len(sets) == 0 || len(sets) > maxChoiceSets {
		return invalid("offer options for between 1 and %d fields", maxChoiceSets)
	}
	var seen []string
	for i, set := range sets {
		kinds, ok := choiceFields[set.Field]
		if !ok || !slices.Contains(kinds, cur.Kind) {
			return invalid("a %s offers no options for %q", cur.Kind, set.Field)
		}
		if slices.Contains(seen, set.Field) {
			return invalid("%s is offered twice", set.Field)
		}
		seen = append(seen, set.Field)
		if len(set.Options) < minOptions || len(set.Options) > maxOptions {
			return invalid("%s: offer between %d and %d options", set.Field, minOptions, maxOptions)
		}
		values := map[string]bool{}
		for j, o := range set.Options {
			fc := fieldChange{in: inputOf(cur)}
			if err := s.withField(ctx, cur, &fc, set.Field, o.Value); err != nil {
				return err
			}
			b, _ := json.Marshal(fc.value)
			if values[string(b)] {
				return invalid("%s: two options are the same", set.Field)
			}
			values[string(b)] = true
			note := squash(o.Note)
			if utf8.RuneCountInString(note) > maxOptionNote {
				return invalid("%s: a note is limited to %d characters", set.Field, maxOptionNote)
			}
			sets[i].Options[j] = Option{Value: fc.value, Note: note}
		}
	}
	for _, set := range sets {
		b, err := json.Marshal(set.Options)
		if err != nil {
			return err
		}
		// a second offer in the same reply replaces the first
		if _, err := s.db.ExecContext(ctx, `DELETE FROM choices WHERE conversation_id = ? AND message_id = '' AND draft_id = ? AND field = ?`, convID, draftID, set.Field); err != nil {
			return err
		}
		if _, err := s.db.ExecContext(ctx, `INSERT INTO choices (id, conversation_id, draft_id, field, options, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			newID(), convID, draftID, set.Field, string(b), s.stamp()); err != nil {
			return err
		}
	}
	return nil
}

func (c *Chat) choices(ctx context.Context, convID string) ([]ChoiceView, error) {
	rows, err := c.db.QueryContext(ctx, `SELECT c.id, c.message_id, c.draft_id, d.kind, c.field, c.options, c.status, c.chosen
		FROM choices c JOIN drafts d ON d.id = c.draft_id WHERE c.conversation_id = ? AND c.message_id <> '' ORDER BY c.rowid`, convID)
	if err != nil {
		return nil, err
	}
	out := []ChoiceView{}
	for rows.Next() {
		var v ChoiceView
		var options string
		if err := rows.Scan(&v.ID, &v.MessageID, &v.DraftID, &v.Kind, &v.Field, &options, &v.Status, &v.Chosen); err != nil {
			rows.Close()
			return nil, err
		}
		if err := json.Unmarshal([]byte(options), &v.Options); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, v)
	}
	return out, closeRows(rows)
}

// SaveRequest is what Save as version carries: the options picked, and the revision of each item as the person sees it.
type SaveRequest struct {
	Picks     []Pick         `json:"picks"`
	Revisions map[string]int `json:"revisions"`
}

// SaveReply puts the picked options into their items and saves each item the reply changed, or a pick touches, as a
// version. It is refused, changing nothing, when an item has changed since the person saw it or cannot be edited.
func (c *Chat) SaveReply(ctx context.Context, convID, messageID string, req SaveRequest) (Conversation, error) {
	if _, err := c.load(ctx, convID); err != nil {
		return Conversation{}, err
	}
	if !c.lock(convID) {
		return Conversation{}, fmt.Errorf("%w: wait for the reply being written to finish", ErrConflict)
	}
	defer c.unlock(convID)
	offers, err := c.choices(ctx, convID)
	if err != nil {
		return Conversation{}, err
	}
	type picked struct {
		offer  ChoiceView
		option int
	}
	byDraft := map[string][]picked{}
	var order []string
	touch := func(id string) {
		if !slices.Contains(order, id) {
			order = append(order, id)
		}
	}
	for _, p := range req.Picks {
		i := slices.IndexFunc(offers, func(o ChoiceView) bool { return o.ID == p.ChoiceID && o.MessageID == messageID })
		if i < 0 || p.Option < 0 || p.Option >= len(offers[i].Options) {
			return Conversation{}, invalid("that option is not one this reply offered")
		}
		if s := offers[i].Status; s != ChoicePending && s != ChoiceChosen {
			return Conversation{}, fmt.Errorf("%w: those options have been replaced", ErrConflict)
		}
		touch(offers[i].DraftID)
		byDraft[offers[i].DraftID] = append(byDraft[offers[i].DraftID], picked{offers[i], p.Option})
	}
	pending, err := c.pendingOf(ctx, convID, messageID)
	if err != nil {
		return Conversation{}, err
	}
	for _, p := range pending {
		touch(p.draftID)
	}
	if len(order) == 0 {
		return Conversation{}, fmt.Errorf("%w: there is nothing to save here", ErrConflict)
	}
	// check every item before writing any
	for _, id := range order {
		d, err := c.Studio.GetDraft(ctx, id)
		if err != nil {
			return Conversation{}, err
		}
		if seen, ok := req.Revisions[id]; ok && seen != d.Revision {
			return Conversation{}, ErrStale
		}
		if len(byDraft[id]) > 0 {
			if err := editable(d); err != nil {
				return Conversation{}, err
			}
		}
	}
	for _, id := range order {
		var sets []fieldPick
		for _, p := range byDraft[id] {
			sets = append(sets, fieldPick{p.offer.Field, p.offer.Options[p.option].Value})
		}
		d, version, err := c.Studio.saveWith(ctx, id, req.Revisions[id], sets)
		if err != nil {
			return Conversation{}, err
		}
		for _, p := range byDraft[id] {
			if _, err := c.db.ExecContext(ctx, `UPDATE choices SET status = ?, chosen = ?, decided_at = ? WHERE id = ?`, ChoiceChosen, p.option, c.stamp(), p.offer.ID); err != nil {
				return Conversation{}, err
			}
		}
		// this reply's change to the item is saved; an older one can no longer be undone
		if _, err := c.db.ExecContext(ctx, `UPDATE chat_changes SET status = ?, version = ?, before = '', after_revision = ? WHERE conversation_id = ? AND message_id = ? AND draft_id = ? AND status IN (?, ?)`,
			ChangeSaved, version, d.Revision, convID, messageID, id, ChangePending, ChangeSaved); err != nil {
			return Conversation{}, err
		}
	}
	return c.Get(ctx, convID)
}

type fieldPick struct {
	field string
	value any
}

// saveWith sets fields on a draft and saves it as a version, returning the number of the version that holds it.
func (s *Studio) saveWith(ctx context.Context, draftID string, revision int, picks []fieldPick) (Draft, int, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	cur, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return cur, 0, err
	}
	if revision != 0 && revision != cur.Revision {
		return cur, 0, ErrStale
	}
	if len(picks) > 0 {
		fc := fieldChange{in: inputOf(cur)}
		for _, p := range picks {
			if err := s.withField(ctx, cur, &fc, p.field, p.value); err != nil {
				return cur, 0, err
			}
		}
		d, err := s.updateDraft(ctx, draftID, fc.in, "", "")
		if err != nil {
			return cur, 0, err
		}
		if fc.page.Summary != nil && *fc.page.Summary != d.Summary {
			if d, err = s.writePageFields(ctx, d, d.Slug, *fc.page.Summary); err != nil {
				return cur, 0, err
			}
		}
	}
	if err := keepCurrent(ctx, s.db, draftID, chatSaveNote); err != nil {
		return cur, 0, err
	}
	d, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return d, 0, err
	}
	var version int
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq), 0) FROM draft_versions WHERE draft_id = ? AND revision = ?`, draftID, d.Revision).Scan(&version)
	return d, version, err
}
