package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"
)

const (
	// prefAssistant is where the server's own assistant settings are, among the server's preferences. It is not one of
	// the keys a person may write.
	prefAssistant = "assistant"
	serverScope   = "*"
	// maxServerMonthCents is the most the server's monthly amount may be.
	maxServerMonthCents = 10000000

	BudgetAlert = "alert"
	BudgetUsed  = "used"
)

// ErrBudget is a request refused because a monthly amount is used up. Its message is for the person.
var ErrBudget = errors.New("budget used up")

// BudgetStatus is where a monthly amount stands.
type BudgetStatus struct {
	Month string `json:"month"` // YYYY-MM, UTC
	// MonthCents is the amount; 0 is none.
	MonthCents   int `json:"monthCents"`
	SpentCents   int `json:"spentCents"`
	AlertPercent int `json:"alertPercent,omitempty"`
	// Level is "alert" past the alert percentage, "used" when nothing is left, and empty otherwise.
	Level string `json:"level,omitempty"`
}

func (b BudgetStatus) left() int { return b.MonthCents - b.SpentCents }

func level(spent, month, alertPercent int) string {
	switch {
	case month <= 0:
		return ""
	case spent >= month:
		return BudgetUsed
	case spent*100 >= month*alertPercent:
		return BudgetAlert
	}
	return ""
}

func monthOf(t time.Time) string { return t.UTC().Format("2006-01") }

// spentIn is what a brand's assistant has cost in a month; with the server's scope, every brand's.
func spentIn(ctx context.Context, db *sql.DB, scope, month string) (int, error) {
	query, args := `SELECT COALESCE(SUM(cents), 0) FROM assistant_spend WHERE month = ?`, []any{month}
	if scope != serverScope {
		query, args = query+` AND profile_id = ?`, append(args, scope)
	}
	var cents int
	err := db.QueryRowContext(ctx, query, args...).Scan(&cents)
	return cents, err
}

// brandBudget is where a brand's own amount stands. It reads only the amount and the alert from what was saved, so it
// needs to know nothing about tiers.
func brandBudget(ctx context.Context, db *sql.DB, profileID string, now time.Time) (BudgetStatus, error) {
	b := BudgetStatus{Month: monthOf(now), AlertPercent: defaultAlert}
	var raw string
	err := db.QueryRowContext(ctx, `SELECT data FROM brand_assistant WHERE profile_id = ?`, profileID).Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return b, err
	}
	if err == nil {
		var saved BrandAssistant
		if json.Unmarshal([]byte(raw), &saved) == nil && saved.MonthCents > 0 && saved.MonthCents <= maxMonthCents && saved.AlertPercent >= 50 && saved.AlertPercent <= 95 {
			b.MonthCents, b.AlertPercent = saved.MonthCents, saved.AlertPercent
		}
	}
	if b.SpentCents, err = spentIn(ctx, db, profileID, b.Month); err != nil {
		return b, err
	}
	b.Level = level(b.SpentCents, b.MonthCents, b.AlertPercent)
	return b, nil
}

// AssistantSettings are the server's own rules for the assistant, across every brand.
type AssistantSettings struct {
	// MonthCents is what every brand together may spend in a calendar month at list price; 0 is no amount.
	MonthCents int `json:"monthCents"`
}

// AssistantView is the server's settings with where its amount stands.
type AssistantView struct {
	Settings AssistantSettings `json:"settings"`
	Defaults AssistantSettings `json:"defaults"`
	Saved    bool              `json:"saved"`
	Budget   BudgetStatus      `json:"budget"`
}

func (s AssistantSettings) check() error {
	if s.MonthCents < 0 || s.MonthCents > maxServerMonthCents {
		return invalid("the monthly amount must be from 0 to %d", maxServerMonthCents/100)
	}
	return nil
}

// serverAssistant is what applies: the saved settings, or the ones the server was started with.
func (c *Chat) serverAssistant(ctx context.Context) (AssistantSettings, bool, error) {
	out := AssistantSettings{MonthCents: c.MonthCents}
	var raw string
	err := c.db.QueryRowContext(ctx, `SELECT value FROM preferences WHERE key = ?`, prefAssistant).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return out, false, nil
	}
	if err != nil {
		return out, false, err
	}
	saved := out
	if uerr := json.Unmarshal([]byte(raw), &saved); uerr != nil || saved.check() != nil {
		log.Printf("the saved assistant settings cannot be used: %v", uerr)
		return out, false, nil
	}
	return saved, true, nil
}

func (c *Chat) serverBudget(ctx context.Context) (BudgetStatus, error) {
	s, _, err := c.serverAssistant(ctx)
	b := BudgetStatus{Month: monthOf(c.now()), MonthCents: s.MonthCents, AlertPercent: defaultAlert}
	if err != nil {
		return b, err
	}
	if b.SpentCents, err = spentIn(ctx, c.db, serverScope, b.Month); err != nil {
		return b, err
	}
	b.Level = level(b.SpentCents, b.MonthCents, b.AlertPercent)
	return b, nil
}

// Assistant returns the server's settings, for an administrator.
func (c *Chat) Assistant(ctx context.Context) (AssistantView, error) {
	s, saved, err := c.serverAssistant(ctx)
	v := AssistantView{Settings: s, Defaults: AssistantSettings{MonthCents: c.MonthCents}, Saved: saved}
	if err != nil {
		return v, err
	}
	v.Budget, err = c.serverBudget(ctx)
	return v, err
}

// SetAssistant saves the server's settings. They apply to the next request.
func (c *Chat) SetAssistant(ctx context.Context, s AssistantSettings) (AssistantView, error) {
	if err := s.check(); err != nil {
		return AssistantView{}, err
	}
	raw, err := json.Marshal(s)
	if err != nil {
		return AssistantView{}, err
	}
	if _, err := c.db.ExecContext(ctx, `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, prefAssistant, string(raw), c.now().UTC().Format(timeLayout)); err != nil {
		return AssistantView{}, err
	}
	detail := "no amount"
	if s.MonthCents > 0 {
		detail = money(s.MonthCents) + " a month"
	}
	recordEvent(ctx, c.db, c.stamp(), EventAssistant, "The server", detail)
	return c.Assistant(ctx)
}

// ResetAssistant removes the saved settings, so the ones the server was started with apply.
func (c *Chat) ResetAssistant(ctx context.Context) (AssistantView, error) {
	if _, err := c.db.ExecContext(ctx, `DELETE FROM preferences WHERE key = ?`, prefAssistant); err != nil {
		return AssistantView{}, err
	}
	recordEvent(ctx, c.db, c.stamp(), EventAssistantReset, "The server", "")
	return c.Assistant(ctx)
}

func money(cents int) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }

// allowance is what a reply for this brand may still cost: the less of what is left of the brand's amount and of the
// server's. Nil when neither has an amount. With nothing left it is ErrBudget, saying whose amount it was.
func (c *Chat) allowance(ctx context.Context, profileID string) (*int, error) {
	brand, err := brandBudget(ctx, c.db, profileID, c.now())
	if err != nil {
		return nil, err
	}
	server, err := c.serverBudget(ctx)
	if err != nil {
		return nil, err
	}
	var left *int
	if brand.MonthCents > 0 {
		if brand.left() <= 0 {
			return nil, fmt.Errorf("%w: %s", ErrBudget, brandUsedUp)
		}
		n := brand.left()
		left = &n
	}
	if server.MonthCents > 0 {
		if server.left() <= 0 {
			return nil, fmt.Errorf("%w: %s", ErrBudget, serverUsedUp)
		}
		if n := server.left(); left == nil || n < *left {
			left = &n
		}
	}
	return left, nil
}

const (
	brandUsedUp  = "This brand's assistant budget for the month is used up."
	serverUsedUp = "The assistant's budget for the month is used up."
)

// usedUp says whose amount stopped a reply that ran out of allowance.
func (c *Chat) usedUp(ctx context.Context, profileID string) string {
	if b, err := brandBudget(ctx, c.db, profileID, c.now()); err == nil && b.MonthCents > 0 && b.Level == BudgetUsed {
		return brandUsedUp
	}
	if b, err := c.serverBudget(ctx); err == nil && b.Level == BudgetUsed {
		return serverUsedUp
	}
	return brandUsedUp
}

// noticeBudget records, once a month for each level, that a brand's amount or the server's passed its alert or was
// used up, and returns the lines to tell the person now.
func (c *Chat) noticeBudget(ctx context.Context, profileID string) []string {
	var lines []string
	note := func(scope, who string, b BudgetStatus) {
		if b.Level == "" {
			return
		}
		res, err := c.db.ExecContext(ctx, `INSERT INTO budget_alerts (scope, month, level, at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`, scope, b.Month, b.Level, c.stamp())
		if err != nil {
			log.Printf("budget: could not record a notice: %v", err)
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return // said before
		}
		event, line := EventBudgetAlert, fmt.Sprintf("%s has used %d%% of its assistant budget for the month.", who, b.SpentCents*100/b.MonthCents)
		if b.Level == BudgetUsed {
			event, line = EventBudgetUsed, fmt.Sprintf("%s has used up its assistant budget for the month.", who)
		}
		name := who
		if scope != serverScope {
			if n, err := c.brandLabel(ctx, scope); err == nil {
				name = n
			}
		}
		recordEvent(ctx, c.db, c.stamp(), event, name, fmt.Sprintf("%s of %s", money(b.SpentCents), money(b.MonthCents)))
		lines = append(lines, line)
	}
	if b, err := brandBudget(ctx, c.db, profileID, c.now()); err == nil {
		note(profileID, "This brand", b)
	}
	if b, err := c.serverBudget(ctx); err == nil {
		note(serverScope, "The server", b)
	}
	return lines
}

// brandLabel is a brand's name, whoever asks.
func (c *Chat) brandLabel(ctx context.Context, profileID string) (string, error) {
	var name sql.NullString
	if err := c.db.QueryRowContext(ctx, `SELECT json_extract(data, '$.name') FROM profiles WHERE id = ?`, profileID).Scan(&name); err != nil {
		return "", err
	}
	if name.String == "" {
		return profileID, nil
	}
	return name.String, nil
}
