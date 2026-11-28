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

// prefSecurity is where the saved security settings are, among the server's own preferences. It is not one of the keys a
// person may write.
const prefSecurity = "security"

// SecuritySettings are the rules about signing in that an administrator sets.
type SecuritySettings struct {
	SignupOpen  bool   `json:"signupOpen"`
	DefaultRole string `json:"defaultRole"`
	// IdleMinutes ends a sign-in not used for this long; MaxMinutes ends it however much it is used.
	IdleMinutes int `json:"idleMinutes"`
	MaxMinutes  int `json:"maxMinutes"`
	MinPassword int `json:"minPassword"`
	// Attempts failed sign-ins pause further tries for PauseMinutes.
	Attempts     int `json:"attempts"`
	PauseMinutes int `json:"pauseMinutes"`
}

func (s SecuritySettings) idle() time.Duration  { return time.Duration(s.IdleMinutes) * time.Minute }
func (s SecuritySettings) max() time.Duration   { return time.Duration(s.MaxMinutes) * time.Minute }
func (s SecuritySettings) pause() time.Duration { return time.Duration(s.PauseMinutes) * time.Minute }

func (s SecuritySettings) check() error {
	if s.DefaultRole != RoleEditor && s.DefaultRole != RoleWriter {
		return invalid("a new person is an editor or a writer")
	}
	for _, r := range []struct {
		what        string
		v, from, to int
	}{
		{"the minutes without use", s.IdleMinutes, 5, 24 * 60},
		{"the longest sign-in in minutes", s.MaxMinutes, 15, 30 * 24 * 60},
		{"the shortest password", s.MinPassword, minPassword, 64},
		{"the failed sign-ins before a pause", s.Attempts, 3, 20},
		{"the minutes of a pause", s.PauseMinutes, 1, 24 * 60},
	} {
		if r.v < r.from || r.v > r.to {
			return invalid("%s must be from %d to %d", r.what, r.from, r.to)
		}
	}
	if s.MaxMinutes < s.IdleMinutes {
		return invalid("the longest sign-in must not be shorter than the time without use")
	}
	return nil
}

// securityDefaults are the settings the server was started with.
func (a *Accounts) securityDefaults() SecuritySettings {
	return SecuritySettings{
		SignupOpen: !a.opts.SignupClosed, DefaultRole: a.opts.DefaultRole,
		IdleMinutes: int(a.opts.SessionIdle / time.Minute), MaxMinutes: int(a.opts.SessionMax / time.Minute),
		MinPassword: minPassword, Attempts: failuresAllowed, PauseMinutes: int(lockFor / time.Minute),
	}
}

func (a *Accounts) savedSecurity(ctx context.Context) (SecuritySettings, bool, error) {
	out := a.securityDefaults()
	var raw string
	err := a.db.QueryRowContext(ctx, `SELECT value FROM preferences WHERE key = ?`, prefSecurity).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return out, false, nil
	}
	if err != nil {
		return out, false, err
	}
	saved := out
	if err := json.Unmarshal([]byte(raw), &saved); err != nil {
		return out, false, fmt.Errorf("the saved security settings cannot be read: %w", err)
	}
	if err := saved.check(); err != nil {
		return out, false, fmt.Errorf("the saved security settings are not valid: %w", err)
	}
	return saved, true, nil
}

// Security returns the settings in force and whether an administrator saved them. If they cannot be read, sign-up is
// treated as closed and the rest are the server's starting values.
func (a *Accounts) Security(ctx context.Context) (SecuritySettings, bool) {
	s, saved, err := a.savedSecurity(ctx)
	if err != nil {
		log.Printf("security settings: %v", err)
		s.SignupOpen = false
	}
	return s, saved
}

// SecurityDefaults are what "use defaults" goes back to.
func (a *Accounts) SecurityDefaults() SecuritySettings { return a.securityDefaults() }

// SetSecurity saves new settings. They apply at once, to open sessions too.
func (a *Accounts) SetSecurity(ctx context.Context, s SecuritySettings) error {
	if err := s.check(); err != nil {
		return err
	}
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(ctx, `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, prefSecurity, string(raw), a.stamp())
	return err
}

// ResetSecurity removes the saved settings, so the server's starting values apply.
func (a *Accounts) ResetSecurity(ctx context.Context) error {
	_, err := a.db.ExecContext(ctx, `DELETE FROM preferences WHERE key = ?`, prefSecurity)
	return err
}

// ActiveSessions is how many sign-ins have not ended.
func (a *Accounts) ActiveSessions(ctx context.Context) (int, error) {
	s, _ := a.Security(ctx)
	now := a.now().UTC()
	var n int
	err := a.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE created_at > ? AND last_seen_at > ?`,
		now.Add(-s.max()).Format(time.RFC3339), now.Add(-s.idle()).Format(time.RFC3339)).Scan(&n)
	return n, err
}

// SignOutEveryone ends every session but the one with keepToken, and says how many ended. API keys are not sessions and
// keep working.
func (a *Accounts) SignOutEveryone(ctx context.Context, keepToken string) (int, error) {
	res, err := a.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash <> ?`, tokenHash(keepToken))
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}
