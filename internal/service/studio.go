// Package service holds the application's rules. It has no HTTP types, so the HTTP API and the later MCP server
// can both be thin adapters over it.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Errors a caller can test with errors.Is.
var (
	ErrInvalid   = errors.New("invalid input")
	ErrConflict  = errors.New("conflict")
	ErrForbidden = errors.New("not allowed") // the person may see the thing but their role does not allow this
)

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

const (
	maxProfiles        = 50  // brands in one request
	maxBrandsPerPerson = 200 // brands one person may own
	maxPrefBytes       = 1 << 20
	maxDocBytes        = 16 << 20
	timeLayout         = time.RFC3339
	PrefTheme          = "theme"   // light, dark or system
	PrefPalette        = "palette" // the colour theme of the application
	PrefFonts          = "customFonts"
	PrefLayout         = "layout"        // sidebar and section fold state, editor height
	PrefActive         = "activeProfile" // the brand that was open last
	PrefUI             = "ui"            // view choices: list or grid, columns, page sizes and the like
)

var allowedPrefs = map[string]bool{PrefTheme: true, PrefPalette: true, PrefFonts: true, PrefLayout: true, PrefActive: true, PrefUI: true}

// State is everything the studio loads at start.
type State struct {
	Profiles    []json.RawMessage          `json:"profiles"`
	Archived    []json.RawMessage          `json:"archived"` // brands hidden from the studio, kept with their history
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
	// Events, when set, tells open studios about changes.
	Events *Hub
	// writing makes a read, a check and a write of a draft one step.
	writing sync.Mutex
	db      *sql.DB
	now     func() time.Time
	// Videos checks a post's video address; without it a post cannot be given a video.
	Videos VideoChecker
}

// New returns a Studio over db.
func New(db *sql.DB) *Studio { return &Studio{db: db, now: time.Now} }

func (s *Studio) stamp() string { return s.now().UTC().Format(timeLayout) }

// State returns all saved state. Empty collections are returned as empty, never nil.
func (s *Studio) State(ctx context.Context) (State, error) {
	st := State{Profiles: []json.RawMessage{}, Archived: []json.RawMessage{}, Designs: map[string]json.RawMessage{}, Preferences: map[string]json.RawMessage{}}

	rows, err := s.db.QueryContext(ctx, `SELECT id, data, archived_at IS NOT NULL, owner_id FROM profiles ORDER BY position, id`)
	if err != nil {
		return st, err
	}
	seen, known := map[string]bool{}, map[string]bool{} // the brands this person may see, and every brand there is
	for rows.Next() {
		var id, d, owner string
		var archived bool
		if err := rows.Scan(&id, &d, &archived, &owner); err != nil {
			rows.Close()
			return st, err
		}
		known[id] = true
		if !sees(ctx, owner) {
			continue
		}
		seen[id] = true
		if archived {
			st.Archived = append(st.Archived, json.RawMessage(d))
		} else {
			st.Profiles = append(st.Profiles, json.RawMessage(d))
		}
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
		if seen[id] || (!known[id] && sees(ctx, "")) { // a design whose brand is gone is only for those who see everything
			st.Designs[id] = json.RawMessage(d)
		}
	}
	if err := closeRows(rows); err != nil {
		return st, err
	}

	// theme, layout, the open brand and fonts belong to the person; without one (the token, the system) they are shared
	query, args := `SELECT key, value FROM preferences`, []any{}
	if uid := userScope(ctx); uid != "" {
		query, args = `SELECT key, value FROM user_preferences WHERE user_id = ?`, []any{uid}
	}
	if rows, err = s.db.QueryContext(ctx, query, args...); err != nil {
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

// userScope is the person whose preferences and brands apply, or "" for the token and the system.
func userScope(ctx context.Context) string {
	if p, ok := PrincipalFrom(ctx); ok && p.User != nil {
		return p.User.ID
	}
	return ""
}

// brandScope narrows a query on profiles to what the caller may see: nothing for an admin or the system, their own for others.
func brandScope(ctx context.Context) (string, []any) {
	if p, ok := PrincipalFrom(ctx); ok && !p.Admin() {
		return ` AND owner_id = ?`, []any{p.UserID()}
	}
	return "", nil
}

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// brandNotHidden returns ErrNotFound only for a brand that exists and belongs to someone else. A brand that does not exist
// is allowed (what is asked about it is simply empty), which keeps read paths simple.
func brandNotHidden(ctx context.Context, q rowQuerier, id string) error {
	var owner string
	err := q.QueryRowContext(ctx, `SELECT owner_id FROM profiles WHERE id = ?`, id).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !sees(ctx, owner) {
		return ErrNotFound
	}
	return nil
}

// brandVisible returns ErrNotFound unless the brand exists and the caller may see it. It does not say which, so an id
// that belongs to someone else looks the same as one that does not exist.
func brandVisible(ctx context.Context, q rowQuerier, id string) error {
	var owner string
	if err := q.QueryRowContext(ctx, `SELECT owner_id FROM profiles WHERE id = ?`, id).Scan(&owner); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if !sees(ctx, owner) {
		return ErrNotFound
	}
	return nil
}

func closeRows(r *sql.Rows) error {
	err := r.Err()
	if cerr := r.Close(); err == nil {
		err = cerr
	}
	return err
}

// ReplaceProfiles saves the profiles in list. It adds new ones and updates existing ones, and never removes a profile,
// archives one or changes the order: those have their own operations, so a stale client cannot delete a brand by saving
// a shorter list.
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
	for i, raw := range list {
		var one int
		switch err := tx.QueryRowContext(ctx, `SELECT 1 FROM profiles WHERE id = ?`, ids[i]).Scan(&one); {
		case err == nil: // an existing brand: only if it is the caller's to see
			if err := brandVisible(ctx, tx, ids[i]); err != nil {
				return err
			}
		case !errors.Is(err, sql.ErrNoRows):
			return err
		}
		if err := upsertProfile(ctx, tx, ids[i], raw, s.stamp(), actorID(ctx)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// upsertProfile updates a profile's data, or adds it at the end.
func upsertProfile(ctx context.Context, tx *sql.Tx, id string, raw json.RawMessage, at, owner string) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO profiles (id, position, data, updated_at, owner_id) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM profiles), ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		id, string(raw), at, owner)
	if err != nil {
		return err
	}
	return pinEnvProfile(ctx, tx, at)
}

// pinEnvProfile records which brand the environment-variable credentials belong to the first time a brand exists, so the
// choice does not move when brands are later reordered or archived (see Settings.EnvProfile).
func pinEnvProfile(ctx context.Context, tx *sql.Tx, at string) error {
	_, err := tx.ExecContext(ctx,
		`INSERT OR IGNORE INTO preferences (key, value, updated_at) SELECT 'envProfile', json_quote(id), ? FROM profiles ORDER BY position LIMIT 1`, at)
	return err
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
	return pinEnvProfile(ctx, tx, at)
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
	// only the caller's own designs are replaced: another person's are never touched
	rows, err := tx.QueryContext(ctx, `SELECT id, owner_id FROM profiles`)
	if err != nil {
		return err
	}
	visible, owned := map[string]bool{}, map[string]bool{}
	for rows.Next() {
		var id, owner string
		if err := rows.Scan(&id, &owner); err != nil {
			rows.Close()
			return err
		}
		owned[id] = true
		visible[id] = sees(ctx, owner)
	}
	if err := closeRows(rows); err != nil {
		return err
	}
	for id := range designs {
		if owned[id] && !visible[id] {
			return ErrNotFound
		}
	}
	if p, ok := PrincipalFrom(ctx); !ok || p.Admin() {
		if _, err := tx.ExecContext(ctx, `DELETE FROM designs`); err != nil {
			return err
		}
	} else {
		for id, ok := range visible {
			if ok {
				if _, err := tx.ExecContext(ctx, `DELETE FROM designs WHERE profile_id = ?`, id); err != nil {
					return err
				}
			}
		}
	}
	for id, raw := range designs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO designs (profile_id, data, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, id, string(raw), at); err != nil {
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
	if uid := userScope(ctx); uid != "" { // a person's own preferences
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO user_preferences (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			uid, key, string(value), s.stamp())
		return err
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, string(value), s.stamp())
	return err
}

// Look is the caller's colour theme and mode, each "" when not chosen.
func (s *Studio) Look(ctx context.Context) (palette, mode string, err error) {
	query, args := `SELECT key, value FROM preferences WHERE key IN (?, ?)`, []any{PrefPalette, PrefTheme}
	if uid := userScope(ctx); uid != "" {
		query, args = `SELECT key, value FROM user_preferences WHERE key IN (?, ?) AND user_id = ?`, []any{PrefPalette, PrefTheme, uid}
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return "", "", err
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return "", "", err
		}
		var word string
		if json.Unmarshal([]byte(value), &word) != nil {
			continue
		}
		if key == PrefPalette {
			palette = word
		} else {
			mode = word
		}
	}
	return palette, mode, rows.Err()
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

// UserMessage turns an error into text for a person (or an agent): the category prefix ("invalid input: ") is for code,
// so it is dropped, and the first letter is capitalised.
func UserMessage(err error) string {
	m := err.Error()
	for _, sentinel := range []error{ErrInvalid, ErrConflict, ErrBudget} {
		m = strings.TrimPrefix(m, sentinel.Error()+": ")
	}
	if m == "" {
		return err.Error()
	}
	r := []rune(m)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}

// BrandOwner returns who owns a brand and whether it exists. The API uses it to decide whether a person may reach it.
func (s *Studio) BrandOwner(ctx context.Context, id string) (string, bool, error) {
	var owner string
	err := s.db.QueryRowContext(ctx, `SELECT owner_id FROM profiles WHERE id = ?`, id).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return owner, err == nil, err
}
