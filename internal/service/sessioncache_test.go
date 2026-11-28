package service

import (
	"context"
	"errors"
	"testing"
	"time"
)

// A signed-in person is read once and then served from memory for a short time. Every change made through the service
// takes effect on the next request; the idle time still ends a session; and what another process changes is seen when
// the short life is over.
func TestTheSignedInPersonIsKeptInMemory(t *testing.T) {
	ctx := context.Background()
	a, db := newAccounts(t, AccountsOptions{SessionCache: DefaultSessionCache})
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return now }
	admin, err := a.Signup(ctx, signup("admin@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	ed, err := a.Signup(ctx, signup("ed@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	signIn := func(id string) string {
		t.Helper()
		token, err := a.StartSession(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	run := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	who := func(token string) (User, error) { return a.Authenticate(ctx, token) }
	token := signIn(ed.ID)
	first, err := who(token)
	if err != nil {
		t.Fatal(err)
	}
	// from memory: a change behind the service's back is not yet seen, and what is handed out is a copy
	first.Roles[0] = "changed by the caller"
	run(`UPDATE users SET first_name = 'Elsewhere' WHERE id = ?`, ed.ID)
	now = now.Add(time.Second)
	got, err := who(token)
	if err != nil || got.FirstName == "Elsewhere" || got.Roles[0] != RoleEditor {
		t.Fatalf("not from memory: %v %+v", err, got)
	}
	now = now.Add(DefaultSessionCache)
	if got, _ = who(token); got.FirstName != "Elsewhere" {
		t.Fatalf("not read again: %+v", got)
	}

	// every change through the service is seen at once
	if _, err := a.SetRole(ctx, ed.ID, RoleWriter); err != nil {
		t.Fatal(err)
	}
	if got, err = who(token); err != nil || got.Roles[0] != RoleWriter {
		t.Fatalf("a new role: %v %+v", err, got)
	}
	ends := func(what string, change func(token string) error) {
		t.Helper()
		token := signIn(ed.ID)
		if _, err := who(token); err != nil {
			t.Fatalf("%s: before: %v", what, err)
		}
		if err := change(token); err != nil {
			t.Fatalf("%s: %v", what, err)
		}
		if _, err := who(token); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("%s: still signed in: %v", what, err)
		}
	}
	ends("sign out", func(token string) error { return a.Logout(ctx, token) })
	ends("sign out everywhere", func(string) error { return a.LogoutEverywhere(ctx, ed.ID) })
	ends("sign out everyone", func(string) error { _, err := a.SignOutEveryone(ctx, signIn(admin.ID)); return err })
	ends("a password set", func(string) error { return a.SetPassword(ctx, ed.ID, "another long password 1") })
	ends("disabled", func(string) error { _, err := a.SetStatus(ctx, ed.ID, "disabled"); return err })
	if _, err := a.SetStatus(ctx, ed.ID, "active"); err != nil {
		t.Fatal(err)
	}
	// ended elsewhere: found when the time of use is next written
	token = signIn(ed.ID)
	_, _ = who(token)
	run(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash(token))
	now = now.Add(useRecorded)
	if _, err := who(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("ended elsewhere: %v", err)
	}

	// the time of use is written as before, and the idle time ends a session kept in memory
	token = signIn(ed.ID)
	_, _ = who(token)
	for range 4 {
		now = now.Add(useRecorded)
		if _, err := who(token); err != nil {
			t.Fatal(err)
		}
	}
	var seen string
	if err := db.QueryRow(`SELECT last_seen_at FROM sessions WHERE token_hash = ?`, tokenHash(token)).Scan(&seen); err != nil || seen != now.Format(time.RFC3339) {
		t.Fatalf("last use: %q %v", seen, err)
	}
	s, _ := a.Security(ctx)
	s.IdleMinutes = 5
	if err := a.SetSecurity(ctx, s); err != nil {
		t.Fatal(err)
	}
	now = now.Add(5 * time.Minute)
	if _, err := who(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("a shorter idle time applies at once: %v", err)
	}
	// another server saw it used: what is kept does not end it
	token = signIn(ed.ID)
	_, _ = who(token)
	now = now.Add(5*time.Minute - time.Second)
	_, _, _ = a.Session(ctx, token, false)
	run(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`, now.Format(time.RFC3339), tokenHash(token))
	now = now.Add(2 * time.Second)
	if _, err := who(token); err != nil {
		t.Fatalf("ended from memory: %v", err)
	}
}

// Off, every request reads the database.
func TestWithoutTheCache(t *testing.T) {
	ctx := context.Background()
	a, db := newAccounts(t, AccountsOptions{})
	u, err := a.Signup(ctx, signup("admin@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	token, _ := a.StartSession(ctx, u.ID)
	_, _ = a.Authenticate(ctx, token)
	if _, err := db.Exec(`UPDATE users SET first_name = 'Elsewhere'`); err != nil {
		t.Fatal(err)
	}
	if got, err := a.Authenticate(ctx, token); err != nil || got.FirstName != "Elsewhere" {
		t.Fatalf("%v %+v", err, got)
	}
}
