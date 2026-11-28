package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"github.com/senthilsweb/cardpress/internal/agent"
)

const (
	defaultRounds = 3
	maxRounds     = 5
	defaultAlert  = 80
	// maxMonthCents is the most a brand's monthly amount may be.
	maxMonthCents = 100000
	// StandardTier is the tier of an assistant that offers none.
	StandardTier = "standard"
)

// BrandAssistant is how the assistant works for one brand. An administrator sets it.
type BrandAssistant struct {
	// Tier is the set of agents the brand's new conversations use.
	Tier string `json:"tier"`
	// Checks says whether a first draft is graded; Rounds is how often the grader may send it back.
	Checks bool `json:"checks"`
	Rounds int  `json:"rounds"`
	// MonthCents is what the brand may spend in a calendar month at list price; 0 is no amount of its own.
	MonthCents int `json:"monthCents"`
	// AlertPercent is the share of the amount at which the brand is told.
	AlertPercent int `json:"alertPercent"`
}

// BrandAssistantView is a brand's settings with what the page needs to show them.
type BrandAssistantView struct {
	Settings BrandAssistant `json:"settings"`
	Defaults BrandAssistant `json:"defaults"`
	// Saved is false for a brand on the defaults.
	Saved bool         `json:"saved"`
	Tiers []agent.Tier `json:"tiers"`
	// TierGone names a saved tier the assistant no longer offers; the first tier is used in its place.
	TierGone string `json:"tierGone,omitempty"`
}

// Tiers are the sets of agents the assistant offers. An assistant that offers none has one, Standard.
func (c *Chat) Tiers() []agent.Tier {
	if t, ok := c.agent.(agent.Tiered); ok {
		if tiers := t.Tiers(); len(tiers) > 0 {
			return tiers
		}
	}
	return []agent.Tier{{ID: StandardTier, Name: "Standard"}}
}

func (c *Chat) assistantDefaults() BrandAssistant {
	return BrandAssistant{Tier: c.Tiers()[0].ID, Checks: true, Rounds: defaultRounds, AlertPercent: defaultAlert}
}

func (c *Chat) hasTier(id string) bool {
	for _, t := range c.Tiers() {
		if t.ID == id {
			return true
		}
	}
	return false
}

func (c *Chat) checkAssistant(s BrandAssistant) error {
	if !c.hasTier(s.Tier) {
		return invalid("that tier is not offered")
	}
	if s.Rounds < 1 || s.Rounds > maxRounds {
		return invalid("the rounds must be from 1 to %d", maxRounds)
	}
	if s.MonthCents < 0 || s.MonthCents > maxMonthCents {
		return invalid("the monthly amount must be from 0 to %d", maxMonthCents/100)
	}
	if s.AlertPercent < 50 || s.AlertPercent > 95 {
		return invalid("the alert must be from 50 to 95 percent")
	}
	return nil
}

// assistantFor is what applies to a brand: what was saved, laid over the defaults. gone names a saved tier that is no
// longer offered. Saved settings that cannot be read are logged, and the defaults apply.
func (c *Chat) assistantFor(ctx context.Context, profileID string) (s BrandAssistant, saved bool, gone string, err error) {
	s = c.assistantDefaults()
	var raw string
	err = c.db.QueryRowContext(ctx, `SELECT data FROM brand_assistant WHERE profile_id = ?`, profileID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return s, false, "", nil
	}
	if err != nil {
		return s, false, "", err
	}
	got := s
	if uerr := json.Unmarshal([]byte(raw), &got); uerr != nil {
		log.Printf("assistant settings of brand %s cannot be read: %v", profileID, uerr)
		return s, false, "", nil
	}
	if !c.hasTier(got.Tier) {
		gone, got.Tier = got.Tier, s.Tier
	}
	if cerr := c.checkAssistant(got); cerr != nil {
		log.Printf("assistant settings of brand %s are not valid: %v", profileID, cerr)
		return s, false, "", nil
	}
	return got, true, gone, nil
}

// BrandAssistant returns a brand's settings, for someone who may see the brand.
func (c *Chat) BrandAssistant(ctx context.Context, profileID string) (BrandAssistantView, error) {
	v := BrandAssistantView{Defaults: c.assistantDefaults(), Tiers: c.Tiers()}
	if err := brandVisible(ctx, c.db, profileID); err != nil {
		return v, err
	}
	var err error
	v.Settings, v.Saved, v.TierGone, err = c.assistantFor(ctx, profileID)
	return v, err
}

// SetBrandAssistant saves a brand's settings. They apply to its new conversations; checks and the amount apply to the
// next request.
func (c *Chat) SetBrandAssistant(ctx context.Context, profileID string, s BrandAssistant) (BrandAssistantView, error) {
	name, err := c.brandName(ctx, profileID)
	if err != nil {
		return BrandAssistantView{}, err
	}
	if err := c.checkAssistant(s); err != nil {
		return BrandAssistantView{}, err
	}
	raw, err := json.Marshal(s)
	if err != nil {
		return BrandAssistantView{}, err
	}
	if _, err := c.db.ExecContext(ctx, `INSERT INTO brand_assistant (profile_id, data, updated_by, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT (profile_id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		profileID, string(raw), actorID(ctx), c.stamp()); err != nil {
		return BrandAssistantView{}, err
	}
	checks := "checks off"
	if s.Checks {
		checks = fmt.Sprintf("checks %d", s.Rounds)
	}
	amount := "no amount"
	if s.MonthCents > 0 {
		amount = fmt.Sprintf("%d.%02d a month, alert %d%%", s.MonthCents/100, s.MonthCents%100, s.AlertPercent)
	}
	recordEvent(ctx, c.db, c.stamp(), EventAssistant, name, fmt.Sprintf("tier %s; %s; %s", s.Tier, checks, amount))
	return c.BrandAssistant(ctx, profileID)
}

// ResetBrandAssistant removes a brand's saved settings, so the defaults apply.
func (c *Chat) ResetBrandAssistant(ctx context.Context, profileID string) (BrandAssistantView, error) {
	name, err := c.brandName(ctx, profileID)
	if err != nil {
		return BrandAssistantView{}, err
	}
	if _, err := c.db.ExecContext(ctx, `DELETE FROM brand_assistant WHERE profile_id = ?`, profileID); err != nil {
		return BrandAssistantView{}, err
	}
	recordEvent(ctx, c.db, c.stamp(), EventAssistantReset, name, "")
	return c.BrandAssistant(ctx, profileID)
}

// brandName is the name of a brand the caller may see, for the log.
func (c *Chat) brandName(ctx context.Context, profileID string) (string, error) {
	if err := brandVisible(ctx, c.db, profileID); err != nil {
		return "", err
	}
	var name sql.NullString
	if err := c.db.QueryRowContext(ctx, `SELECT json_extract(data, '$.name') FROM profiles WHERE id = ?`, profileID).Scan(&name); err != nil {
		return "", err
	}
	if name.String == "" {
		return profileID, nil
	}
	return name.String, nil
}
