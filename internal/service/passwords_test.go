package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestEasyPasswordsAreRefused(t *testing.T) {
	for _, pw := range []string{"password123", "Passw0rd!!!!", "qwertyuiop", "aaaaaaaaaaaa", "abcabcabcabc", "1234567890", "abcdefghijk", "xx-jordan-xx-2026"} {
		if err := checkNewPassword(pw, "jordan@example.com", minPassword); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q should be refused, got %v", pw, err)
		}
	}
	for _, pw := range []string{"a long passphrase here", "plum-orbit-ledger-9", "correct horse battery"} {
		if err := checkNewPassword(pw, "jo@example.com", minPassword); err != nil {
			t.Errorf("%q should be accepted: %v", pw, err)
		}
	}
}

func TestACheaperHashIsRenewedAtSignIn(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	u, err := a.Signup(ctx, SignupInput{FirstName: "Ada", LastName: "L", Email: "ada@example.com", Password: "a long passphrase here"})
	if err != nil {
		t.Fatal(err)
	}
	was := argonTime
	argonTime = was + 1
	defer func() { argonTime = was }()
	if _, _, err := a.Login(ctx, u.Email, "a long passphrase here", "1.2.3.4"); err != nil {
		t.Fatal(err)
	}
	_, hash, err := a.loadUser(ctx, `id = ?`, u.ID)
	if err != nil || cheaper(hash) || !strings.HasPrefix(hash, "$argon2id$") || !checkPassword(hash, "a long passphrase here") {
		t.Fatalf("not renewed: %q %v", hash, err)
	}
}
