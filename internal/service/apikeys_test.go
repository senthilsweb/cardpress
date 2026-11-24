package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestAKeyIsShownOnceKeptOnlyAsAHashAndWorksUntilRevoked(t *testing.T) {
	a, db := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	a.Signup(ctx, signup("admin@example.com"))
	u, _ := a.Signup(ctx, signup("ed@example.com"))

	k, secret, err := a.CreateKey(ctx, u.ID, "  My   agent ", "")
	if err != nil || k.Name != "My agent" || k.Scope != "editor" || !strings.HasPrefix(secret, KeyPrefix) || len(secret) < 40 || !strings.HasPrefix(secret, k.Prefix) {
		t.Fatalf("%+v %q %v", k, secret, err)
	}
	var stored string
	var n int
	_ = db.QueryRow(`SELECT key_hash FROM api_keys WHERE id = ?`, k.ID).Scan(&stored)
	_ = db.QueryRow(`SELECT COUNT(*) FROM api_keys WHERE key_hash = ? OR prefix = ? AND length(prefix) > 10`, secret, secret).Scan(&n)
	if stored == secret || stored != tokenHash(secret) || n != 0 {
		t.Fatalf("the key itself is never stored: %q", stored)
	}
	ks, _ := a.Keys(ctx, u.ID)
	if len(ks) != 1 || ks[0].ID != k.ID {
		t.Fatalf("%+v", ks)
	}
	if js := strings.Join([]string{ks[0].ID, ks[0].Name, ks[0].Prefix}, " "); strings.Contains(js, secret[8:]) {
		t.Fatal("a listing never carries the secret")
	}
	got, id, scope, err := a.AuthenticateKey(ctx, secret)
	if err != nil || got.ID != u.ID || id != k.ID || scope != "editor" {
		t.Fatalf("%+v %q %q %v", got, id, scope, err)
	}
	if ks, _ := a.Keys(ctx, u.ID); ks[0].LastUsedAt == "" {
		t.Fatal("use is recorded")
	}
	for _, bad := range []string{"", "cpk_", "cpk_short", KeyPrefix + strings.Repeat("x", 43), "Bearer " + secret, strings.ToUpper(secret)} {
		if _, _, _, err := a.AuthenticateKey(ctx, bad); !errors.Is(err, ErrUnauthorized) {
			t.Errorf("%q: %v", bad, err)
		}
	}
	// only its owner can revoke it, and then it stops working
	if err := a.RevokeKey(ctx, "someone-else", k.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := a.RevokeKey(ctx, u.ID, k.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := a.AuthenticateKey(ctx, secret); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("a revoked key must stop working at once")
	}
	if ks, _ := a.Keys(ctx, u.ID); len(ks) != 0 {
		t.Fatalf("%+v", ks)
	}
	if err := a.RevokeKey(ctx, u.ID, k.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
}

func TestKeyRulesAndWhoseKeyItIs(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	a.Signup(ctx, signup("admin@example.com"))
	u, _ := a.Signup(ctx, signup("ed@example.com"))
	for name, tc := range map[string][2]string{"no name": {"  ", "editor"}, "long name": {strings.Repeat("x", maxKeyName+1), "editor"}, "bad scope": {"k", "admin"}} {
		if _, _, err := a.CreateKey(ctx, u.ID, tc[0], tc[1]); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, _, err := a.CreateKey(ctx, "nobody", "k", "editor"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	var first, second string
	for i := 0; i < maxKeysPerUser; i++ {
		_, s, err := a.CreateKey(ctx, u.ID, "k", "editor")
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			first = s
		} else if i == 1 {
			second = s
		}
	}
	if first == second {
		t.Fatal("two keys must differ")
	}
	if _, _, err := a.CreateKey(ctx, u.ID, "one too many", "editor"); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
	// disabling the person ends their keys, without touching the keys
	if _, err := a.SetStatus(ctx, u.ID, "disabled"); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := a.AuthenticateKey(ctx, first); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("a disabled person's keys stop")
	}
	a.SetStatus(ctx, u.ID, "active")
	if _, _, _, err := a.AuthenticateKey(ctx, first); err != nil {
		t.Fatal("and work again when the person does")
	}
	_ = time.Now
}

func TestAKeyActsWithinItsScopeAndNeverAsAnAdmin(t *testing.T) {
	p := newPeople(t)
	keyOf := func(u User) Principal { return Principal{User: &u, Key: "k1", Scope: "editor"} }
	adminKey, editorKey := keyOf(p.admin), keyOf(p.ana)
	if adminKey.Admin() || adminKey.Can(PermUsers) {
		t.Fatal("an admin's key is not an admin")
	}
	for _, perm := range []Perm{PermWrite, PermApprove, PermPublish, PermSocial} {
		if !adminKey.Can(perm) || !editorKey.Can(perm) {
			t.Errorf("the editor scope allows %s", perm)
		}
	}
	// a writer's key is limited by the writer
	writer, _ := p.acc.SetRole(p.ctxSystem, p.ben.ID, RoleWriter)
	wk := keyOf(writer)
	if !wk.Can(PermWrite) || wk.Can(PermApprove) || wk.Can(PermPublish) || wk.Can(PermSocial) {
		t.Fatal("a key may do what its scope allows and its person may do: no more")
	}
	// an admin's key sees only the admin's own brands
	p.st.CreateProfile(p.ctxAdmin, brandJSON("admin-1"))
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-1"))
	via := WithPrincipal(p.ctxSystem, adminKey)
	if st, _ := p.st.State(via); len(st.Profiles) != 1 || brandIDs(st.Profiles)[0] != "admin-1" {
		t.Fatalf("an admin's key does not see everyone's work: %v", brandIDs(st.Profiles))
	}
	if st, _ := p.st.State(p.ctxAdmin); len(st.Profiles) != 2 {
		t.Fatalf("while the admin does: %v", brandIDs(st.Profiles))
	}
}
