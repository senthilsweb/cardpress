package service

import (
	"context"
	"errors"
	"testing"
)

func TestSavedRulesDecideSignUpPausesAndNewPasswords(t *testing.T) {
	a, db := newAccounts(t, AccountsOptions{SignupClosed: true})
	ctx := context.Background()
	if !a.SignupOpen(ctx) {
		t.Fatal("the first account can always be created")
	}
	if _, err := a.Signup(ctx, signup("admin@example.com")); err != nil {
		t.Fatal(err)
	}
	if a.SignupOpen(ctx) {
		t.Fatal("closed by the configuration")
	}
	s, saved := a.Security(ctx)
	s.SignupOpen, s.Attempts = true, 3
	if err := a.SetSecurity(ctx, s); saved || err != nil || !a.SignupOpen(ctx) {
		t.Fatalf("an administrator's choice replaces it: %v", err)
	}
	for range 3 {
		a.Login(ctx, "admin@example.com", "wrong password here", "1.1.1.1")
	}
	if _, _, err := a.Login(ctx, "admin@example.com", "correct horse battery", "1.1.1.1"); !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("three tries: %v", err)
	}
	long := s
	long.MinPassword = 40
	if err := a.SetSecurity(ctx, long); err != nil {
		t.Fatal(err)
	}
	pw, err := a.ResetPasswordByEmail(ctx, "admin@example.com")
	if err != nil || len(pw) != 40 {
		t.Fatalf("a reset password meets the rule: %d %v", len(pw), err)
	}
	// settings that cannot be read close sign-up rather than opening it
	if _, err := db.Exec(`UPDATE preferences SET value = 'nonsense' WHERE key = 'security'`); err != nil {
		t.Fatal(err)
	}
	if a.SignupOpen(ctx) {
		t.Fatal("unreadable settings must not open sign-up")
	}
}
