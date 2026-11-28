package service

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestSignInsAndAccountChangesAreRecordedWithoutSecrets(t *testing.T) {
	a, db := newAccounts(t, AccountsOptions{})
	ctx := WithAddress(context.Background(), "203.0.113.7")
	admin, err := a.Signup(ctx, signup("admin@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	as := WithPrincipal(ctx, Principal{User: &admin})
	s, _ := a.Security(ctx)
	s.Attempts = 3
	if err := a.SetSecurity(as, s); err != nil {
		t.Fatal(err)
	}
	for range 5 {
		a.Login(ctx, "admin@example.com", "a wrong secret phrase", "198.51.100.2")
	}
	_, token, err := a.Login(ctx, "admin@example.com", "correct horse battery", "198.51.100.3")
	if err != nil {
		t.Fatal(err)
	}
	if err := a.Logout(as, token); err != nil {
		t.Fatal(err)
	}
	events, more, err := a.SecurityLog(ctx, 0)
	if err != nil || more {
		t.Fatal(err, more)
	}
	var got []string
	for _, e := range events {
		got = append(got, e.Event)
		if all := fmt.Sprintf("%+v", e); strings.Contains(all, "wrong secret") || strings.Contains(all, "horse") || strings.Contains(all, token) {
			t.Fatalf("a secret in the log: %s", all)
		}
	}
	// newest first; once paused, further tries add nothing
	want := "sign_out sign_in sign_in_paused sign_in_failed sign_in_failed sign_in_failed security_changed sign_up"
	if strings.Join(got, " ") != want {
		t.Fatalf("%v", got)
	}
	if events[1].Address != "198.51.100.3" || events[6].Actor != "admin@example.com" || events[7].Address != "203.0.113.7" {
		t.Fatalf("%+v", events)
	}
	// only the newest are kept, a page at a time
	for range keptEvents + 5 {
		a.record(ctx, EventSignIn, "x@example.com", "")
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM security_events`).Scan(&n)
	page, more, _ := a.SecurityLog(ctx, 0)
	older, _, _ := a.SecurityLog(ctx, page[len(page)-1].ID)
	if n != keptEvents || len(page) != eventsPage || !more || older[0].ID != page[len(page)-1].ID-1 {
		t.Fatal(n, len(page), more)
	}
}
