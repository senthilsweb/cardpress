package service

import (
	"context"
	"database/sql"
	"encoding/json"
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

// EnvProfile is the brand that credentials set through environment variables belong to. With several brands an
// environment variable cannot be shared, or one brand would post as another's account, so it applies to this brand only:
// the first one, remembered so that reordering or archiving does not move it.
func (s *Settings) EnvProfile(ctx context.Context) (string, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM preferences WHERE key = 'envProfile'`).Scan(&raw)
	if err == nil {
		var id string
		if json.Unmarshal([]byte(raw), &id) == nil && id != "" {
			return id, nil
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	var id string
	if err := s.db.QueryRowContext(ctx, `SELECT id FROM profiles WHERE archived_at IS NULL ORDER BY position LIMIT 1`).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	b, _ := json.Marshal(id)
	if _, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO preferences (key, value, updated_at) VALUES ('envProfile', ?, ?)`, string(b), s.now().UTC().Format(time.RFC3339)); err != nil {
		return "", err
	}
	return id, nil
}

// brand describes whose credentials are being read or changed.
type brand struct {
	id string
	// env: environment variables apply (this is the environment brand). It also owns credentials stored before there was a
	// profile, under an empty id.
	env bool
}

func (s *Settings) brandOf(ctx context.Context, profileID string, mustExist bool) (brand, error) {
	if profileID == "" {
		return brand{}, invalid("a profile id is required")
	}
	if mustExist {
		var one int
		if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM profiles WHERE id = ? AND archived_at IS NULL`, profileID).Scan(&one); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return brand{}, ErrNotFound
			}
			return brand{}, err
		}
	}
	envID, err := s.EnvProfile(ctx)
	if err != nil {
		return brand{}, err
	}
	return brand{id: profileID, env: envID == profileID}, nil
}

func (b brand) owners() []string {
	if b.env {
		return []string{b.id, ""}
	}
	return []string{b.id, b.id}
}

func (s *Settings) envValue(b brand, network string, f FieldSpec) string {
	if !b.env {
		return ""
	}
	return s.getenv(envName(network, f))
}

// stored returns the decrypted stored values of one brand for a network, plus the fields that could not be decrypted.
func (s *Settings) stored(ctx context.Context, b brand, network string) (vals map[string]string, bad map[string]bool, err error) {
	vals, bad = map[string]string{}, map[string]bool{}
	o := b.owners()
	// rows kept under an empty id come first, so a value saved under the brand itself wins
	rows, err := s.db.QueryContext(ctx, `SELECT field, value FROM credentials WHERE network = ? AND profile_id IN (?, ?) ORDER BY CASE WHEN profile_id = '' THEN 0 ELSE 1 END`, network, o[0], o[1])
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
		delete(bad, field)
	}
	return vals, bad, rows.Err()
}

func (s *Settings) viewOf(ctx context.Context, b brand, spec NetworkSpec) (NetworkView, error) {
	vals, bad, err := s.stored(ctx, b, spec.ID)
	if err != nil {
		return NetworkView{}, err
	}
	v := NetworkView{ID: spec.ID, Name: spec.Name, PortalURL: spec.PortalURL, Testable: spec.Testable, Complete: true}
	for _, f := range spec.Fields {
		fv := FieldView{Key: f.Key, Label: f.Label, Hint: f.Hint, Secret: f.Secret}
		if e := s.envValue(b, spec.ID, f); e != "" {
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

// View returns every network's settings for one brand.
func (s *Settings) View(ctx context.Context, profileID string) (SettingsView, error) {
	b, err := s.brandOf(ctx, profileID, true)
	if err != nil {
		return SettingsView{}, err
	}
	out := SettingsView{CanStore: s.box != nil}
	if s.box != nil {
		out.KeySource = s.box.Source
	}
	for _, spec := range Networks {
		nv, err := s.viewOf(ctx, b, spec)
		if err != nil {
			return SettingsView{}, err
		}
		out.Networks = append(out.Networks, nv)
	}
	return out, nil
}

// Network returns one network's settings for one brand.
func (s *Settings) Network(ctx context.Context, profileID, id string) (NetworkView, error) {
	spec, ok := networkByID(id)
	if !ok {
		return NetworkView{}, ErrNotFound
	}
	b, err := s.brandOf(ctx, profileID, true)
	if err != nil {
		return NetworkView{}, err
	}
	return s.viewOf(ctx, b, spec)
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
func (s *Settings) Put(ctx context.Context, profileID, id string, changes map[string]*string) (NetworkView, error) {
	spec, ok := networkByID(id)
	if !ok {
		return NetworkView{}, ErrNotFound
	}
	b, err := s.brandOf(ctx, profileID, true)
	if err != nil {
		return NetworkView{}, err
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
		if s.envValue(b, id, f) != "" {
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
			if _, err := tx.ExecContext(ctx, `DELETE FROM credentials WHERE network = ? AND field = ? AND profile_id IN (?, ?)`, id, o.field, b.owners()[0], b.owners()[1]); err != nil {
				return NetworkView{}, err
			}
			continue
		}
		sealed, err := s.box.Seal(o.value, aad(id, o.field))
		if err != nil {
			return NetworkView{}, err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO credentials (profile_id, network, field, value, updated_at) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(profile_id, network, field) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			b.id, id, o.field, sealed, at); err != nil {
			return NetworkView{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return NetworkView{}, err
	}
	return s.viewOf(ctx, b, spec)
}

// Resolve returns one brand's plaintext credentials for a network (environment first for the environment brand, then
// stored) for server-side use such as publishing. It never falls back to another brand's credentials, and is never
// exposed over HTTP. A missing field is simply absent from the map. It does not require the brand to be unarchived: a
// post scheduled before its brand was archived still goes out with its own credentials.
func (s *Settings) Resolve(ctx context.Context, profileID, id string) (map[string]string, error) {
	spec, ok := networkByID(id)
	if !ok {
		return nil, ErrNotFound
	}
	b, err := s.brandOf(ctx, profileID, false)
	if err != nil {
		return nil, err
	}
	vals, bad, err := s.stored(ctx, b, id)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, f := range spec.Fields {
		if e := s.envValue(b, id, f); e != "" {
			out[f.Key] = e
		} else if v, ok := vals[f.Key]; ok {
			out[f.Key] = v
		} else if bad[f.Key] {
			return nil, fmt.Errorf("the stored %s %s cannot be decrypted: was CARDPRESS_SECRET_KEY changed? Enter it again", spec.Name, f.Label)
		}
	}
	return out, nil
}
