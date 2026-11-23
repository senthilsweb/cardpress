// Package service holds the application's rules. It has no HTTP types, so the HTTP API and the later MCP server
// can both be thin adapters over it.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Errors a caller can test with errors.Is.
var (
	ErrInvalid  = errors.New("invalid input")
	ErrConflict = errors.New("conflict")
)

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

const (
	maxProfiles  = 50
	maxPrefBytes = 1 << 20
	maxDocBytes  = 16 << 20
	timeLayout   = time.RFC3339
	PrefTheme    = "theme"
	PrefFonts    = "customFonts"
	PrefLayout   = "layout" // sidebar and section fold state, editor height
)

var allowedPrefs = map[string]bool{PrefTheme: true, PrefFonts: true, PrefLayout: true}

// State is everything the studio loads at start.
type State struct {
	Profiles    []json.RawMessage          `json:"profiles"`
	Designs     map[string]json.RawMessage `json:"designs"`
	Preferences map[string]json.RawMessage `json:"preferences"`
}

// Legacy is the state a browser held in localStorage before it moved to the database.
type Legacy struct {
	Profiles    []json.RawMessage          `json:"profiles"`
	Designs     map[string]json.RawMessage `json:"designs"`
	Preferences map[string]json.RawMessage `json:"preferences"`
}

// Studio manages profiles, designs and preferences.
type Studio struct {
	db  *sql.DB
	now func() time.Time
}

// New returns a Studio over db.
func New(db *sql.DB) *Studio { return &Studio{db: db, now: time.Now} }

func (s *Studio) stamp() string { return s.now().UTC().Format(timeLayout) }

// State returns all saved state. Empty collections are returned as empty, never nil.
func (s *Studio) State(ctx context.Context) (State, error) {
	st := State{Profiles: []json.RawMessage{}, Designs: map[string]json.RawMessage{}, Preferences: map[string]json.RawMessage{}}

	rows, err := s.db.QueryContext(ctx, `SELECT data FROM profiles ORDER BY position`)
	if err != nil {
		return st, err
	}
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			rows.Close()
			return st, err
		}
		st.Profiles = append(st.Profiles, json.RawMessage(d))
	}
	if err := closeRows(rows); err != nil {
		return st, err
	}

	if rows, err = s.db.QueryContext(ctx, `SELECT profile_id, data FROM designs`); err != nil {
		return st, err
	}
	for rows.Next() {
		var id, d string
		if err := rows.Scan(&id, &d); err != nil {
			rows.Close()
			return st, err
		}
		st.Designs[id] = json.RawMessage(d)
	}
	if err := closeRows(rows); err != nil {
		return st, err
	}

	if rows, err = s.db.QueryContext(ctx, `SELECT key, value FROM preferences`); err != nil {
		return st, err
	}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			return st, err
		}
		st.Preferences[k] = json.RawMessage(v)
	}
	return st, closeRows(rows)
}

func closeRows(r *sql.Rows) error {
	err := r.Err()
	if cerr := r.Close(); err == nil {
		err = cerr
	}
	return err
}

// ReplaceProfiles replaces the saved profiles with list, keeping its order.
func (s *Studio) ReplaceProfiles(ctx context.Context, list []json.RawMessage) error {
	ids, err := validateProfiles(list)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if err := insertProfiles(ctx, tx, list, ids, s.stamp()); err != nil {
		return err
	}
	return tx.Commit()
}

func validateProfiles(list []json.RawMessage) ([]string, error) {
	if len(list) == 0 {
		return nil, invalid("at least one profile is required")
	}
	if len(list) > maxProfiles {
		return nil, invalid("too many profiles (max %d)", maxProfiles)
	}
	ids := make([]string, len(list))
	seen := map[string]bool{}
	for i, raw := range list {
		if len(raw) > maxDocBytes {
			return nil, invalid("profile %d is too large", i+1)
		}
		var head struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &head); err != nil || head.ID == "" {
			return nil, invalid("profile %d must be a JSON object with a non-empty id", i+1)
		}
		if seen[head.ID] {
			return nil, invalid("duplicate profile id %q", head.ID)
		}
		seen[head.ID] = true
		ids[i] = head.ID
	}
	return ids, nil
}

func insertProfiles(ctx context.Context, tx *sql.Tx, list []json.RawMessage, ids []string, at string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM profiles`); err != nil {
		return err
	}
	for i, raw := range list {
		if _, err := tx.ExecContext(ctx, `INSERT INTO profiles (id, position, data, updated_at) VALUES (?, ?, ?, ?)`, ids[i], i, string(raw), at); err != nil {
			return err
		}
	}
	return nil
}

// ReplaceDesigns replaces the saved working designs, keyed by profile id.
func (s *Studio) ReplaceDesigns(ctx context.Context, designs map[string]json.RawMessage) error {
	if err := validateDesigns(designs); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if err := insertDesigns(ctx, tx, designs, s.stamp()); err != nil {
		return err
	}
	return tx.Commit()
}

func validateDesigns(designs map[string]json.RawMessage) error {
	if len(designs) > maxProfiles {
		return invalid("too many designs (max %d)", maxProfiles)
	}
	for id, raw := range designs {
		if id == "" {
			return invalid("design key must not be empty")
		}
		if len(raw) > maxDocBytes {
			return invalid("design %q is too large", id)
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raw, &obj); err != nil {
			return invalid("design %q must be a JSON object", id)
		}
	}
	return nil
}

func insertDesigns(ctx context.Context, tx *sql.Tx, designs map[string]json.RawMessage, at string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM designs`); err != nil {
		return err
	}
	for id, raw := range designs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO designs (profile_id, data, updated_at) VALUES (?, ?, ?)`, id, string(raw), at); err != nil {
			return err
		}
	}
	return nil
}

// SetPreference stores one UI preference (theme, custom fonts). Only known keys are accepted.
func (s *Studio) SetPreference(ctx context.Context, key string, value json.RawMessage) error {
	if !allowedPrefs[key] {
		return invalid("unknown preference %q", key)
	}
	if len(value) > maxPrefBytes || !json.Valid(value) {
		return invalid("preference %q must be valid JSON under %d bytes", key, maxPrefBytes)
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, string(value), s.stamp())
	return err
}

// ImportLegacy loads state that used to live in a browser. It only works on an empty database, so it can never
// overwrite saved data.
func (s *Studio) ImportLegacy(ctx context.Context, l Legacy) error {
	ids, err := validateProfiles(l.Profiles)
	if err != nil {
		return err
	}
	if l.Designs == nil {
		l.Designs = map[string]json.RawMessage{}
	}
	if err := validateDesigns(l.Designs); err != nil {
		return err
	}
	for k, v := range l.Preferences {
		if !allowedPrefs[k] {
			return invalid("unknown preference %q", k)
		}
		if len(v) > maxPrefBytes || !json.Valid(v) {
			return invalid("preference %q must be valid JSON under %d bytes", k, maxPrefBytes)
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: the database already has saved data", ErrConflict)
	}
	at := s.stamp()
	if err := insertProfiles(ctx, tx, l.Profiles, ids, at); err != nil {
		return err
	}
	if err := insertDesigns(ctx, tx, l.Designs, at); err != nil {
		return err
	}
	for k, v := range l.Preferences {
		if _, err := tx.ExecContext(ctx, `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)`, k, string(v), at); err != nil {
			return err
		}
	}
	return tx.Commit()
}
