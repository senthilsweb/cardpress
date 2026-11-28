package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"runtime/debug"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// ErrUnauthorized is returned for a wrong email or password, a missing or ended session, and a disabled account. It never
// says which, so it cannot be used to find out who has an account.
var ErrUnauthorized = errors.New("unauthorized")

// ErrTooManyAttempts is returned when sign-in has failed too often for now.
var ErrTooManyAttempts = errors.New("too many attempts")

const (
	minPassword     = 10
	maxPassword     = 200
	maxName         = 60
	maxPhone        = 30
	failuresAllowed = 5
	lockFor         = 15 * time.Minute
	signupsAllowed  = 20 // from one address in an hour
)

// AccountsOptions are the settings that decide who may join.
type AccountsOptions struct {
	// DefaultRole is the role of a person who signs up after the first (editor if empty).
	DefaultRole string
	// SignupClosed turns self sign-up off once the first account exists (admins then add people).
	SignupClosed bool
	// AdminEmail, if set, is the only email that may create the first (admin) account.
	AdminEmail string
	// SessionIdle ends a sign-in not used for this long (20 minutes if unset); SessionMax ends it however much it is
	// used (12 hours if unset).
	SessionIdle, SessionMax time.Duration
}

// Accounts manages people, their roles and their sign-ins.
type Accounts struct {
	db   *sql.DB
	now  func() time.Time
	opts AccountsOptions

	mu       sync.Mutex
	failures map[string]*failure // keyed by "email|address", and by the address alone
	signups  map[string][]time.Time
}

type failure struct {
	n     int
	first time.Time
	until time.Time
}

// NewAccounts returns the accounts service over db.
func NewAccounts(db *sql.DB, o AccountsOptions) *Accounts {
	if !ValidRole(o.DefaultRole) || o.DefaultRole == RoleAdmin {
		o.DefaultRole = RoleEditor
	}
	if o.SessionIdle <= 0 {
		o.SessionIdle = DefaultSessionIdle
	}
	if o.SessionMax <= 0 {
		o.SessionMax = DefaultSessionMax
	}
	if o.SessionMax < o.SessionIdle {
		o.SessionMax = o.SessionIdle
	}
	return &Accounts{db: db, now: time.Now, opts: o, failures: map[string]*failure{}, signups: map[string][]time.Time{}}
}

func (a *Accounts) stamp() string { return a.now().UTC().Format(time.RFC3339) }

/* ------------------------------------------------------------------ passwords */

// Hashes are argon2id: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>.
// The cost of one hash. They are variables only so the tests can use a cheap one; every hash records its own settings.
var (
	argonTime    uint32 = 3
	argonMemory  uint32 = 64 * 1024
	argonThreads uint8  = 2
)

const argonKeyLen = 32

// hashGate lets one password be hashed at a time. One hash needs 64 MB, so several sign-ins at once could use more
// memory than a small server has (a 256 MB machine was killed this way).
var hashGate = make(chan struct{}, 1)

// argonKey works out one hash, alone, and hands its memory back straight away instead of leaving it for a later clean-up.
func argonKey(pw, salt []byte, t, m uint32, p uint8, n uint32) []byte {
	hashGate <- struct{}{}
	defer func() { <-hashGate }()
	key := argon2.IDKey(pw, salt, t, m, p, n)
	debug.FreeOSMemory()
	return key
}

func hashPassword(pw string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argonKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func checkPassword(hash, pw string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var v, m, t, p int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &v); err != nil || v != argon2.Version {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil || m <= 0 || m > 1<<20 || t <= 0 || t > 20 || p <= 0 || p > 16 {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[4])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil || len(want) == 0 {
		return false
	}
	got := argonKey([]byte(pw), salt, uint32(t), uint32(m), uint8(p), uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// a hash to compare against when the email is unknown, so a wrong email takes as long as a wrong password
var decoyHash, _ = hashPassword("decoy-password-for-timing")

func (a *Accounts) minLength(ctx context.Context) int {
	s, _ := a.Security(ctx)
	return s.MinPassword
}

/* ------------------------------------------------------------------ people */

// SignupInput is what a person gives to create an account.
type SignupInput struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Phone     string `json:"phone"`
	BirthDate string `json:"birthDate"` // optional, YYYY-MM-DD
}

var phoneRe = regexp.MustCompile(`^[0-9+()\-. ]{3,30}$`)

func (in *SignupInput) normalize(needPassword bool, minLength int) error {
	in.FirstName, in.LastName = squash(in.FirstName), squash(in.LastName)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Phone = strings.TrimSpace(in.Phone)
	in.BirthDate = strings.TrimSpace(in.BirthDate)
	if in.FirstName == "" || in.LastName == "" {
		return invalid("first name and last name are required")
	}
	if utf8.RuneCountInString(in.FirstName) > maxName || utf8.RuneCountInString(in.LastName) > maxName {
		return invalid("names are limited to %d characters", maxName)
	}
	addr, err := mail.ParseAddress(in.Email)
	if err != nil || addr.Address != in.Email || len(in.Email) > 254 || !strings.Contains(in.Email[strings.LastIndex(in.Email, "@"):], ".") {
		return invalid("that does not look like an email address")
	}
	if in.Phone != "" && (!phoneRe.MatchString(in.Phone) || utf8.RuneCountInString(in.Phone) > maxPhone) {
		return invalid("the phone number may use digits, spaces and + ( ) - . only")
	}
	if in.BirthDate != "" {
		d, err := time.Parse("2006-01-02", in.BirthDate)
		if err != nil || d.After(time.Now()) || d.Year() < 1900 {
			return invalid("that is not a valid date of birth")
		}
	}
	if needPassword {
		return checkNewPassword(in.Password, in.Email, minLength)
	}
	return nil
}

// Count returns how many accounts exist. With none, the app is waiting for its first (admin) account.
func (a *Accounts) Count(ctx context.Context) (int, error) {
	var n int
	err := a.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// SignupOpen reports whether a stranger may create an account now: always for the first, then unless it was closed.
func (a *Accounts) SignupOpen(ctx context.Context) bool {
	n, err := a.Count(ctx)
	if err != nil {
		return false
	}
	s, _ := a.Security(ctx)
	return n == 0 || s.SignupOpen
}

func (a *Accounts) loadUser(ctx context.Context, where string, args ...any) (User, string, error) {
	var u User
	var hash string
	err := a.db.QueryRowContext(ctx, `SELECT id, email, first_name, last_name, phone, birth_date, status, created_at, last_login_at, password_hash FROM users WHERE `+where, args...).
		Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.Phone, &u.BirthDate, &u.Status, &u.CreatedAt, &u.LastLoginAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return u, "", ErrNotFound
	}
	if err != nil {
		return u, "", err
	}
	u.FullName = u.FirstName + " " + u.LastName
	rows, err := a.db.QueryContext(ctx, `SELECT role FROM user_roles WHERE user_id = ? ORDER BY role`, u.ID)
	if err != nil {
		return u, "", err
	}
	defer rows.Close()
	u.Roles = []string{}
	for rows.Next() {
		var r string
		if err := rows.Scan(&r); err != nil {
			return u, "", err
		}
		u.Roles = append(u.Roles, r)
	}
	return u, hash, rows.Err()
}

// Get returns one person.
func (a *Accounts) Get(ctx context.Context, id string) (User, error) {
	u, _, err := a.loadUser(ctx, `id = ?`, id)
	return u, err
}

// List returns everyone, oldest first.
func (a *Accounts) List(ctx context.Context) ([]User, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id FROM users ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := closeRows(rows); err != nil {
		return nil, err
	}
	out := make([]User, 0, len(ids))
	for _, id := range ids {
		u, err := a.Get(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, nil
}

func (a *Accounts) create(ctx context.Context, in SignupInput, role string) (User, error) {
	hash, err := hashPassword(in.Password)
	if err != nil {
		return User{}, err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return User{}, err
	}
	first := n == 0
	if first {
		role = RoleAdmin
		if a.opts.AdminEmail != "" && !strings.EqualFold(a.opts.AdminEmail, in.Email) {
			return User{}, fmt.Errorf("%w: this server only lets %s create the first account", ErrForbidden, a.opts.AdminEmail)
		}
	}
	id := newID()
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, email, first_name, last_name, phone, birth_date, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Email, in.FirstName, in.LastName, in.Phone, in.BirthDate, hash, a.stamp()); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return User{}, fmt.Errorf("%w: there is already an account with that email", ErrConflict)
		}
		return User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles (user_id, role) VALUES (?, ?)`, id, role); err != nil {
		return User{}, err
	}
	if first {
		// the first person adopts what exists: the brands, and the settings the app was using
		at := a.stamp()
		for _, q := range []string{
			`UPDATE profiles SET owner_id = ? WHERE owner_id = ''`,
			`UPDATE drafts SET created_by = ? WHERE created_by = ''`,
			`UPDATE publish_jobs SET created_by = ? WHERE created_by = ''`,
			`UPDATE conversations SET user_id = ? WHERE user_id = ''`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return User{}, err
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO user_preferences (user_id, key, value, updated_at)
			SELECT ?, key, value, ? FROM preferences WHERE key IN ('theme', 'layout', 'customFonts', 'activeProfile')`, id, at); err != nil {
			return User{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return a.Get(ctx, id)
}

// Signup creates an account. The first account becomes the administrator; later ones get the default role, unless sign-up
// has been closed.
func (a *Accounts) Signup(ctx context.Context, in SignupInput) (User, error) {
	if err := in.normalize(true, a.minLength(ctx)); err != nil {
		return User{}, err
	}
	if !a.SignupOpen(ctx) {
		return User{}, fmt.Errorf("%w: sign-up is closed on this server; ask an administrator to add you", ErrForbidden)
	}
	s, _ := a.Security(ctx)
	return a.create(ctx, in, s.DefaultRole)
}

// AdminCreateInput is an administrator adding a person.
type AdminCreateInput struct {
	SignupInput
	Role string `json:"role"`
}

// Add creates an account for someone else (an administrator's action).
func (a *Accounts) Add(ctx context.Context, in AdminCreateInput) (User, error) {
	if err := in.SignupInput.normalize(true, a.minLength(ctx)); err != nil {
		return User{}, err
	}
	if !ValidRole(in.Role) {
		return User{}, invalid("role must be admin, editor or writer")
	}
	return a.create(ctx, in.SignupInput, in.Role)
}

// ProfileInput is what a person may change about themselves. Email and role are not among them.
type ProfileInput struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Phone     string `json:"phone"`
	BirthDate string `json:"birthDate"`
}

// UpdateProfile changes a person's own details.
func (a *Accounts) UpdateProfile(ctx context.Context, id string, in ProfileInput) (User, error) {
	cur, err := a.Get(ctx, id)
	if err != nil {
		return User{}, err
	}
	s := SignupInput{FirstName: in.FirstName, LastName: in.LastName, Email: cur.Email, Phone: in.Phone, BirthDate: in.BirthDate}
	if err := s.normalize(false, minPassword); err != nil {
		return User{}, err
	}
	if _, err := a.db.ExecContext(ctx, `UPDATE users SET first_name = ?, last_name = ?, phone = ?, birth_date = ? WHERE id = ?`, s.FirstName, s.LastName, s.Phone, s.BirthDate, id); err != nil {
		return User{}, err
	}
	return a.Get(ctx, id)
}

// SetRole gives a person one role in place of their others. The data model allows several; the screens use one. The last
// administrator cannot lose the role.
func (a *Accounts) SetRole(ctx context.Context, id, role string) (User, error) {
	if !ValidRole(role) {
		return User{}, invalid("role must be admin, editor or writer")
	}
	u, err := a.Get(ctx, id)
	if err != nil {
		return User{}, err
	}
	if u.IsAdmin() && role != RoleAdmin {
		if n, err := a.activeAdmins(ctx); err != nil || n <= 1 {
			return User{}, fmt.Errorf("%w: there must be at least one active administrator", ErrConflict)
		}
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_roles WHERE user_id = ?`, id); err != nil {
		return User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles (user_id, role) VALUES (?, ?)`, id, role); err != nil {
		return User{}, err
	}
	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return a.Get(ctx, id)
}

func (a *Accounts) activeAdmins(ctx context.Context) (int, error) {
	var n int
	err := a.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles r ON r.user_id = u.id WHERE r.role = 'admin' AND u.status = 'active'`).Scan(&n)
	return n, err
}

// SetStatus disables or re-enables an account. A disabled person is signed out everywhere and cannot sign in.
func (a *Accounts) SetStatus(ctx context.Context, id, status string) (User, error) {
	if status != "active" && status != "disabled" {
		return User{}, invalid("status must be active or disabled")
	}
	u, err := a.Get(ctx, id)
	if err != nil {
		return User{}, err
	}
	if status == "disabled" && u.IsAdmin() {
		if n, err := a.activeAdmins(ctx); err != nil || n <= 1 {
			return User{}, fmt.Errorf("%w: there must be at least one active administrator", ErrConflict)
		}
	}
	if _, err := a.db.ExecContext(ctx, `UPDATE users SET status = ? WHERE id = ?`, status, id); err != nil {
		return User{}, err
	}
	if status == "disabled" {
		if _, err := a.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, id); err != nil {
			return User{}, err
		}
	}
	return a.Get(ctx, id)
}

// SetPassword sets a new password for someone (an administrator's action, or the command line) and signs them out everywhere.
func (a *Accounts) SetPassword(ctx context.Context, id, password string) error {
	u, err := a.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := checkNewPassword(password, u.Email, a.minLength(ctx)); err != nil {
		return err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	res, err := a.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, hash, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	_, err = a.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, id)
	return err
}

// ChangePassword changes your own password. It needs the current one, and signs you out on every other device.
func (a *Accounts) ChangePassword(ctx context.Context, id, current, next, keepToken string) error {
	u, hash, err := a.loadUser(ctx, `id = ?`, id)
	if err != nil {
		return err
	}
	if !checkPassword(hash, current) {
		return fmt.Errorf("%w: the current password is not right", ErrInvalid)
	}
	if err := checkNewPassword(next, u.Email, a.minLength(ctx)); err != nil {
		return err
	}
	newHash, err := hashPassword(next)
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, newHash, id); err != nil {
		return err
	}
	_, err = a.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`, id, tokenHash(keepToken))
	return err
}

// ResetPasswordByEmail sets a random password for the person with this email and returns it, for the command line.
func (a *Accounts) ResetPasswordByEmail(ctx context.Context, email string) (string, error) {
	u, _, err := a.loadUser(ctx, `email = ?`, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return "", err
	}
	b := make([]byte, 48) // 64 characters, cut to what the rules ask
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	pw := base64.RawURLEncoding.EncodeToString(b)[:max(16, a.minLength(ctx))]
	return pw, a.SetPassword(ctx, u.ID, pw)
}

/* ------------------------------------------------------------------ sign-in and sessions */

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// allow says whether sign-in may be tried now for this email and address, and records a failure with fail.
func (a *Accounts) locked(keys ...string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	for _, k := range keys {
		if f := a.failures[k]; f != nil && now.Before(f.until) {
			return true
		}
	}
	return false
}

func (a *Accounts) fail(rules SecuritySettings, keys ...string) (paused bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	for _, k := range keys {
		f := a.failures[k]
		if f == nil || now.Sub(f.first) > rules.pause() {
			f = &failure{first: now}
			a.failures[k] = f
		}
		f.n++
		limit := rules.Attempts
		if !strings.Contains(k, "|") {
			limit = rules.Attempts * 6 // the address alone: many people may share one
		}
		if f.n >= limit {
			paused = paused || !now.Before(f.until)
			f.until = now.Add(rules.pause())
		}
	}
	if len(a.failures) > 10000 { // keep the table small
		for k, f := range a.failures {
			if now.Sub(f.first) > rules.pause() {
				delete(a.failures, k)
			}
		}
	}
	return paused
}

func (a *Accounts) clear(keys ...string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, k := range keys {
		delete(a.failures, k)
	}
}

// AllowSignup counts a try to create an account from addr and says whether it may go on: each one costs the server a
// password hash and may leave an account behind.
func (a *Accounts) AllowSignup(addr string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	recent := func(all []time.Time) []time.Time {
		return slices.DeleteFunc(all, func(t time.Time) bool { return now.Sub(t) >= time.Hour })
	}
	if len(a.signups) > 10000 { // keep the table small
		for k, v := range a.signups {
			if len(recent(v)) == 0 {
				delete(a.signups, k)
			}
		}
	}
	tries := recent(a.signups[addr])
	if len(tries) >= signupsAllowed {
		a.signups[addr] = tries
		return false
	}
	a.signups[addr] = append(tries, now)
	return true
}

// Login checks an email and password and starts a session. It returns the session token for the cookie. addr is the
// client's address, for rate limiting only.
func (a *Accounts) Login(ctx context.Context, email, password, addr string) (User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	byAccount, byAddr := email+"|"+addr, addr
	if a.locked(byAccount, byAddr) {
		return User{}, "", ErrTooManyAttempts
	}
	u, hash, err := a.loadUser(ctx, `email = ?`, email)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return User{}, "", err
	}
	if errors.Is(err, ErrNotFound) {
		hash = decoyHash
	}
	ok := checkPassword(hash, password)
	if err != nil || !ok || u.Status != "active" {
		rules, _ := a.Security(ctx)
		a.fail(rules, byAccount, byAddr)
		return User{}, "", ErrUnauthorized
	}
	a.clear(byAccount)
	if cheaper(hash) { // made with less work than today's: renew it while the password is at hand
		if renewed, err := hashPassword(password); err == nil {
			_, _ = a.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, renewed, u.ID)
		}
	}
	token, err := a.startSession(ctx, u.ID)
	if err != nil {
		return User{}, "", err
	}
	_, _ = a.db.ExecContext(ctx, `UPDATE users SET last_login_at = ? WHERE id = ?`, a.stamp(), u.ID)
	return u, token, nil
}

// Logout ends one session.
func (a *Accounts) Logout(ctx context.Context, token string) error {
	_, err := a.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash(token))
	return err
}

// LogoutEverywhere ends every session of a person.
func (a *Accounts) LogoutEverywhere(ctx context.Context, userID string) error {
	_, err := a.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// Names returns display names by user id, for showing who did something.
func (a *Accounts) Names(ctx context.Context) (map[string]string, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, first_name || ' ' || last_name FROM users`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}
