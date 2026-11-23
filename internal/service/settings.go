package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/senthilsweb/cardpress/internal/secrets"
)

// Errors specific to settings.
var (
	// ErrSecretsUnavailable means there is no encryption key, so credentials cannot be stored.
	ErrSecretsUnavailable = errors.New("no encryption key")
	// ErrUnsupported means the network has no such feature yet.
	ErrUnsupported = errors.New("not supported")
)

const maxCredentialLen = 4096

// FieldView is one credential field as the browser may see it. A secret is never returned in full.
type FieldView struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Hint       string `json:"hint,omitempty"`
	Secret     bool   `json:"secret"`
	Set        bool   `json:"set"`
	Source     string `json:"source,omitempty"` // "stored" or "env"
	Value      string `json:"value,omitempty"`  // masked for secrets, full for identifiers
	Locked     bool   `json:"locked"`           // set by an environment variable; cannot be changed here
	Unreadable bool   `json:"unreadable"`       // stored, but cannot be decrypted (the key changed)
}

// NetworkView is one network's settings.
type NetworkView struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	PortalURL string      `json:"portalUrl"`
	Testable  bool        `json:"testable"`
	Complete  bool        `json:"complete"` // every field has a usable value
	Fields    []FieldView `json:"fields"`
}

// SettingsView is everything the settings dialog shows.
type SettingsView struct {
	Networks  []NetworkView `json:"networks"`
	CanStore  bool          `json:"canStore"`
	KeySource string        `json:"keySource,omitempty"` // "env" or "file"
}

// Settings stores and reads social credentials.
type Settings struct {
	db     *sql.DB
	box    *secrets.Box // nil: credentials cannot be stored
	getenv func(string) string
	now    func() time.Time
	// linkedinIntrospect is where LinkedIn tokens are checked; tests point it at a fake server.
	linkedinIntrospect string
	httpClient         func() doer
}

// NewSettings returns a Settings. box may be nil, and getenv is os.Getenv in production.
func NewSettings(db *sql.DB, box *secrets.Box, getenv func(string) string) *Settings {
	return &Settings{db: db, box: box, getenv: getenv, now: time.Now, linkedinIntrospect: "https://www.linkedin.com/oauth/v2/introspectToken", httpClient: defaultClient}
}

func envName(network string, f FieldSpec) string {
	return "CARDPRESS_" + strings.ToUpper(network) + "_" + f.Env
}

func mask(v string) string {
	if utf8.RuneCountInString(v) < 12 {
		return "••••"
	}
	r := []rune(v)
	return "••••" + string(r[len(r)-4:])
}

func aad(network, field string) string { return network + "/" + field }

// stored returns the decrypted stored values for a network, plus the fields that could not be decrypted.
func (s *Settings) stored(ctx context.Context, network string) (vals map[string]string, bad map[string]bool, err error) {
	vals, bad = map[string]string{}, map[string]bool{}
	rows, err := s.db.QueryContext(ctx, `SELECT field, value FROM credentials WHERE network = ?`, network)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var field, sealed string
		if err := rows.Scan(&field, &sealed); err != nil {
			return nil, nil, err
		}
		if s.box == nil {
			bad[field] = true
			continue
		}
		plain, oerr := s.box.Open(sealed, aad(network, field))
		if oerr != nil {
			bad[field] = true
			continue
		}
		vals[field] = plain
	}
	return vals, bad, rows.Err()
}

func (s *Settings) viewOf(ctx context.Context, spec NetworkSpec) (NetworkView, error) {
	vals, bad, err := s.stored(ctx, spec.ID)
	if err != nil {
		return NetworkView{}, err
	}
	v := NetworkView{ID: spec.ID, Name: spec.Name, PortalURL: spec.PortalURL, Testable: spec.Testable, Complete: true}
	for _, f := range spec.Fields {
		fv := FieldView{Key: f.Key, Label: f.Label, Hint: f.Hint, Secret: f.Secret}
		if e := s.getenv(envName(spec.ID, f)); e != "" {
			fv.Set, fv.Source, fv.Locked, fv.Value = true, "env", true, shown(f, e)
		} else if val, ok := vals[f.Key]; ok {
			fv.Set, fv.Source, fv.Value = true, "stored", shown(f, val)
		} else if bad[f.Key] {
			fv.Unreadable = true
		}
		if !fv.Set {
			v.Complete = false
		}
		v.Fields = append(v.Fields, fv)
	}
	return v, nil
}

func shown(f FieldSpec, v string) string {
	if f.Secret {
		return mask(v)
	}
	return v
}

// View returns every network's settings.
func (s *Settings) View(ctx context.Context) (SettingsView, error) {
	out := SettingsView{CanStore: s.box != nil}
	if s.box != nil {
		out.KeySource = s.box.Source
	}
	for _, spec := range Networks {
		nv, err := s.viewOf(ctx, spec)
		if err != nil {
			return SettingsView{}, err
		}
		out.Networks = append(out.Networks, nv)
	}
	return out, nil
}

// Network returns one network's settings.
func (s *Settings) Network(ctx context.Context, id string) (NetworkView, error) {
	spec, ok := networkByID(id)
	if !ok {
		return NetworkView{}, ErrNotFound
	}
	return s.viewOf(ctx, spec)
}

func validCredential(v string) error {
	if utf8.RuneCountInString(v) > maxCredentialLen {
		return invalid("a value is too long (max %d characters)", maxCredentialLen)
	}
	for _, r := range v {
		if unicode.IsControl(r) {
			return invalid("a value contains a control character (a stray line break from pasting?)")
		}
	}
	return nil
}

// Put changes some fields of a network. A field left out of changes (or nil) stays as it is; an empty string removes
// the stored value; anything else is trimmed and stored encrypted. Fields set by an environment variable are refused.
func (s *Settings) Put(ctx context.Context, id string, changes map[string]*string) (NetworkView, error) {
	spec, ok := networkByID(id)
	if !ok {
		return NetworkView{}, ErrNotFound
	}
	byKey := map[string]FieldSpec{}
	for _, f := range spec.Fields {
		byKey[f.Key] = f
	}
	type op struct {
		field string
		value string
	}
	var ops []op
	needKey := false
	for k, p := range changes {
		f, known := byKey[k]
		if !known {
			return NetworkView{}, invalid("%s has no field %q", spec.Name, k)
		}
		if p == nil {
			continue
		}
		if s.getenv(envName(id, f)) != "" {
			return NetworkView{}, invalid("%s is set by the %s environment variable and cannot be changed here", f.Label, envName(id, f))
		}
		v := strings.TrimSpace(*p)
		if err := validCredential(v); err != nil {
			return NetworkView{}, err
		}
		if v != "" {
			needKey = true
		}
		ops = append(ops, op{k, v})
	}
	if needKey && s.box == nil {
		return NetworkView{}, fmt.Errorf("%w: set CARDPRESS_SECRET_KEY (at least %d characters) to store credentials", ErrSecretsUnavailable, secrets.MinSecretLen)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return NetworkView{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	at := s.now().UTC().Format(time.RFC3339)
	for _, o := range ops {
		if o.value == "" {
			if _, err := tx.ExecContext(ctx, `DELETE FROM credentials WHERE network = ? AND field = ?`, id, o.field); err != nil {
				return NetworkView{}, err
			}
			continue
		}
		sealed, err := s.box.Seal(o.value, aad(id, o.field))
		if err != nil {
			return NetworkView{}, err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO credentials (network, field, value, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(network, field) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			id, o.field, sealed, at); err != nil {
			return NetworkView{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return NetworkView{}, err
	}
	return s.viewOf(ctx, spec)
}

// Resolve returns a network's plaintext credentials (environment first, then stored) for server-side use such as
// publishing. It is never exposed over HTTP. A missing field is simply absent from the map.
func (s *Settings) Resolve(ctx context.Context, id string) (map[string]string, error) {
	spec, ok := networkByID(id)
	if !ok {
		return nil, ErrNotFound
	}
	vals, bad, err := s.stored(ctx, id)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, f := range spec.Fields {
		if e := s.getenv(envName(id, f)); e != "" {
			out[f.Key] = e
		} else if v, ok := vals[f.Key]; ok {
			out[f.Key] = v
		} else if bad[f.Key] {
			return nil, fmt.Errorf("the stored %s %s cannot be decrypted: was CARDPRESS_SECRET_KEY changed? Enter it again", spec.Name, f.Label)
		}
	}
	return out, nil
}
