package api

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBackgroundRequestsDoNotExtendASession(t *testing.T) {
	r := newRig(t, rigOpts{})
	c := r.browser(t)
	c.mustSignup("ada@example.com", "Ada")
	age := func() { // as if nothing had been done for ten minutes
		past := time.Now().UTC().Add(-10 * time.Minute).Format(time.RFC3339)
		if _, err := r.db.Exec(`UPDATE sessions SET last_seen_at = ?`, past); err != nil {
			t.Fatal(err)
		}
	}
	left := func() int {
		var out struct {
			RemainingSeconds, IdleSeconds int
			Limit                         string
		}
		if code := c.json("GET", "/api/v1/auth/session", "", &out); code != 200 || out.IdleSeconds != 1200 || out.Limit != "idle" {
			t.Fatalf("%d %+v", code, out)
		}
		return out.RemainingSeconds
	}
	age()
	req := httptest.NewRequest("GET", "/api/v1/state", strings.NewReader(""))
	req.Header.Set(backgroundHeader, "1")
	if code := c.send(req).Code; code != 200 {
		t.Fatalf("%d", code)
	}
	if got := left(); got > 601 {
		t.Fatalf("a background request or a look extended the session: %d", got)
	}
	if code := c.do("POST", "/api/v1/auth/session", "").Code; code != 200 {
		t.Fatalf("%d", code)
	}
	if got := left(); got < 1180 {
		t.Fatalf("using the app starts the idle time again: %d", got)
	}
	if _, err := r.db.Exec(`UPDATE sessions SET last_seen_at = ?`, time.Now().UTC().Add(-21*time.Minute).Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	if code := c.do("GET", "/api/v1/state", "").Code; code != 401 {
		t.Fatalf("an ended session: %d", code)
	}
}
