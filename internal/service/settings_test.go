package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/store"
)

// testBrand is the first (and environment) brand in these tests.
const testBrand = "p1"

const (
	keyA        = "0123456789abcdef0123456789abcdef"
	keyB        = "ffffffffffffffffffffffffffffffff"
	tokenSecret = "AQV-very-long-access-token-1234"
	clientSec   = "client-secret-ABCDEFGH-9876"
)

func newSettings(t *testing.T, secret string, env map[string]string) (*Settings, *store.DB) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+filepath.Join(t.TempDir(), "t.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	var box *secrets.Box
	if secret != "" {
		if box, err = secrets.NewBox(secret, "env"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO profiles (id, position, data, updated_at) VALUES (?, 0, ?, 'now')`, testBrand, `{"id":"`+testBrand+`"}`); err != nil {
		t.Fatal(err)
	}
	return NewSettings(db.DB, box, func(k string) string { return env[k] }), db
}

func ptr(s string) *string { return &s }

func linkedinAll() map[string]*string {
	return map[string]*string{
		"clientId": ptr("77abc"), "clientSecret": ptr(clientSec), "accessToken": ptr(tokenSecret), "authorUrn": ptr("urn:li:person:Ab_12"),
	}
}

func TestPutEncryptsAndViewMasks(t *testing.T) {
	s, db := newSettings(t, keyA, nil)
	ctx := context.Background()
	v, err := s.Put(ctx, testBrand, "linkedin", linkedinAll())
	if err != nil {
		t.Fatal(err)
	}
	if !v.Complete {
		t.Fatalf("all four fields set but not complete: %+v", v)
	}
	// nothing readable in the database
	rows, _ := db.Query(`SELECT value FROM credentials`)
	n := 0
	for rows.Next() {
		var raw string
		_ = rows.Scan(&raw)
		n++
		for _, plain := range []string{tokenSecret, clientSec, "77abc", "urn:li:person"} {
			if strings.Contains(raw, plain) {
				t.Fatalf("plaintext %q found in the database", plain)
			}
		}
	}
	rows.Close()
	if n != 4 {
		t.Fatalf("rows = %d", n)
	}
	got := map[string]FieldView{}
	for _, f := range v.Fields {
		got[f.Key] = f
	}
	if got["accessToken"].Value != "••••1234" || got["clientSecret"].Value != "••••9876" {
		t.Fatalf("secrets not masked to the last four: %+v", got)
	}
	if got["clientId"].Value != "77abc" || got["authorUrn"].Value != "urn:li:person:Ab_12" {
		t.Fatalf("identifiers should be shown in full: %+v", got)
	}
	all, _ := s.View(ctx, testBrand)
	js, _ := json.Marshal(all)
	for _, secret := range []string{tokenSecret, clientSec} {
		if strings.Contains(string(js), secret) {
			t.Fatalf("a secret appears in the view JSON: %s", js)
		}
	}
	if !all.CanStore || all.KeySource != "env" {
		t.Fatalf("%+v", all)
	}
}

func TestShortSecretsAreFullyMasked(t *testing.T) {
	if mask("abcd1234") != "••••" || mask("abcdefgh1234") != "••••1234" {
		t.Fatalf("%q %q", mask("abcd1234"), mask("abcdefgh1234"))
	}
}

func TestPutSemantics(t *testing.T) {
	s, _ := newSettings(t, keyA, nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, testBrand, "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	// nil leaves a field alone, whitespace is trimmed, "" removes
	v, err := s.Put(ctx, testBrand, "linkedin", map[string]*string{"clientId": nil, "authorUrn": ptr("  urn:li:organization:99  \n"), "accessToken": ptr("")})
	if err != nil {
		t.Fatal(err)
	}
	creds, _ := s.Resolve(ctx, testBrand, "linkedin")
	if creds["clientId"] != "77abc" || creds["authorUrn"] != "urn:li:organization:99" || creds["accessToken"] != "" {
		t.Fatalf("%v", creds)
	}
	if v.Complete {
		t.Fatal("a removed field must make the network incomplete")
	}
	for name, ch := range map[string]map[string]*string{
		"unknown field": {"nope": ptr("x")},
		"control char":  {"clientId": ptr("ab\ncd")},
		"too long":      {"clientId": ptr(strings.Repeat("a", maxCredentialLen+1))},
	} {
		if _, err := s.Put(ctx, testBrand, "linkedin", ch); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", name, err)
		}
	}
	if _, err := s.Put(ctx, testBrand, "myspace", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown network: %v", err)
	}
}

func TestEnvironmentOverridesAndLocks(t *testing.T) {
	env := map[string]string{"CARDPRESS_LINKEDIN_ACCESS_TOKEN": "env-token-env-token-9999"}
	s, _ := newSettings(t, keyA, env)
	ctx := context.Background()
	if _, err := s.Put(ctx, testBrand, "linkedin", map[string]*string{"accessToken": ptr("typed-in-ui")}); !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "CARDPRESS_LINKEDIN_ACCESS_TOKEN") {
		t.Fatalf("changing an environment field must be refused and name the variable: %v", err)
	}
	if _, err := s.Put(ctx, testBrand, "linkedin", map[string]*string{"clientId": ptr("c1")}); err != nil {
		t.Fatal(err)
	}
	v, _ := s.Network(ctx, testBrand, "linkedin")
	for _, f := range v.Fields {
		if f.Key == "accessToken" && (!f.Locked || f.Source != "env" || f.Value != "••••9999") {
			t.Fatalf("%+v", f)
		}
	}
	creds, _ := s.Resolve(ctx, testBrand, "linkedin")
	if creds["accessToken"] != "env-token-env-token-9999" || creds["clientId"] != "c1" {
		t.Fatalf("%v", creds)
	}
}

func TestEnvironmentWorksWithoutAKey(t *testing.T) {
	env := map[string]string{"CARDPRESS_X_API_KEY": "k", "CARDPRESS_X_API_SECRET": "s", "CARDPRESS_X_ACCESS_TOKEN": "a", "CARDPRESS_X_ACCESS_TOKEN_SECRET": "b"}
	s, _ := newSettings(t, "", env)
	v, err := s.Network(context.Background(), testBrand, "x")
	if err != nil || !v.Complete {
		t.Fatalf("%v %+v", err, v)
	}
}

func TestNoKeyRefusesToStoreButAllowsRemoving(t *testing.T) {
	s, _ := newSettings(t, "", nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, testBrand, "x", map[string]*string{"apiKey": ptr("abc")}); !errors.Is(err, ErrSecretsUnavailable) {
		t.Fatalf("%v", err)
	}
	if _, err := s.Put(ctx, testBrand, "x", map[string]*string{"apiKey": ptr("")}); err != nil {
		t.Fatalf("removing needs no key: %v", err)
	}
	if v, _ := s.View(ctx, testBrand); v.CanStore {
		t.Fatal("CanStore should be false")
	}
}

func TestWrongKeyIsReportedNotCrashed(t *testing.T) {
	s, db := newSettings(t, keyA, nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, testBrand, "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	other := NewSettings(db.DB, mustBox(t, keyB), func(string) string { return "" })
	v, err := other.Network(ctx, testBrand, "linkedin")
	if err != nil {
		t.Fatal(err)
	}
	if v.Complete {
		t.Fatal("unreadable values must not count as set")
	}
	for _, f := range v.Fields {
		if !f.Unreadable {
			t.Fatalf("%s should be flagged unreadable", f.Key)
		}
	}
	if _, err := other.Resolve(ctx, testBrand, "linkedin"); err == nil || !strings.Contains(err.Error(), "CARDPRESS_SECRET_KEY") {
		t.Fatalf("%v", err)
	}
	// entering the value again replaces the unreadable one
	if _, err := other.Put(ctx, testBrand, "linkedin", map[string]*string{"clientId": ptr("new")}); err != nil {
		t.Fatal(err)
	}
}

func mustBox(t *testing.T, s string) *secrets.Box {
	t.Helper()
	b, err := secrets.NewBox(s, "env")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

/* ------------------------------------------------------------ LinkedIn test connection */

func fakeLinkedIn(t *testing.T, status int, body string, seen *url.Values) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if seen != nil {
			*seen = r.PostForm
		}
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func ready(t *testing.T, srvURL string) *Settings {
	t.Helper()
	s, _ := newSettings(t, keyA, nil)
	s.linkedinIntrospect = srvURL
	if _, err := s.Put(context.Background(), testBrand, "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	return s
}

func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestLinkedInValidShowsExpiry(t *testing.T) {
	exp := time.Now().Add(40 * 24 * time.Hour).Unix()
	var seen url.Values
	srv := fakeLinkedIn(t, 200, fmt.Sprintf(`{"active":true,"expires_at":%d,"scope":"r_liteprofile,w_member_social"}`, exp), &seen)
	res, err := ready(t, srv.URL).Test(context.Background(), testBrand, "linkedin")
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != TestValid || res.ExpiresAt == nil || res.ExpiresAt.Unix() != exp {
		t.Fatalf("%+v", res)
	}
	if seen.Get("token") != tokenSecret || seen.Get("client_id") != "77abc" || seen.Get("client_secret") != clientSec {
		t.Fatalf("LinkedIn was not sent the credentials: %v", seen)
	}
	if js := mustJSON(res); strings.Contains(js, tokenSecret) || strings.Contains(js, clientSec) {
		t.Fatalf("result leaks a credential: %s", js)
	}
}

func TestLinkedInOutcomes(t *testing.T) {
	past := time.Now().Add(-time.Hour).Unix()
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"expired", 200, fmt.Sprintf(`{"active":false,"status":"expired","expires_at":%d}`, past), TestExpired},
		{"expired by date", 200, fmt.Sprintf(`{"active":false,"expires_at":%d}`, past), TestExpired},
		{"inactive", 200, `{"active":false}`, TestInvalid},
		{"bad client credentials", 401, `{"error":"invalid_client"}`, TestInvalid},
		{"missing scope", 200, `{"active":true,"scope":"r_liteprofile"}`, TestInvalid},
		{"server error", 503, ``, TestError},
		{"garbage", 200, `<html>`, TestError},
	} {
		srv := fakeLinkedIn(t, tc.status, tc.body, nil)
		res, err := ready(t, srv.URL).Test(context.Background(), testBrand, "linkedin")
		if err != nil || res.Status != tc.want {
			t.Errorf("%s: %+v %v, want %s", tc.name, res, err, tc.want)
		}
	}
}

func TestLinkedInOrganizationNeedsOrganizationScope(t *testing.T) {
	srv := fakeLinkedIn(t, 200, `{"active":true,"scope":"w_member_social"}`, nil)
	s := ready(t, srv.URL)
	if _, err := s.Put(context.Background(), testBrand, "linkedin", map[string]*string{"authorUrn": ptr("urn:li:organization:5")}); err != nil {
		t.Fatal(err)
	}
	if res, _ := s.Test(context.Background(), testBrand, "linkedin"); res.Status != TestInvalid || !strings.Contains(mustJSON(res), "w_organization_social") {
		t.Fatalf("%+v", res)
	}
}

func TestLinkedInBadURNAndIncomplete(t *testing.T) {
	srv := fakeLinkedIn(t, 200, `{"active":true,"scope":"w_member_social"}`, nil)
	s := ready(t, srv.URL)
	if _, err := s.Put(context.Background(), testBrand, "linkedin", map[string]*string{"authorUrn": ptr("not-a-urn")}); err != nil {
		t.Fatal(err)
	}
	if res, _ := s.Test(context.Background(), testBrand, "linkedin"); res.Status != TestInvalid {
		t.Fatalf("a token that works but has a bad author URN must not be 'valid': %+v", res)
	}
	if _, err := s.Put(context.Background(), testBrand, "linkedin", map[string]*string{"clientSecret": ptr("")}); err != nil {
		t.Fatal(err)
	}
	if res, _ := s.Test(context.Background(), testBrand, "linkedin"); res.Status != TestIncomplete || !strings.Contains(res.Message, "Client secret") {
		t.Fatalf("%+v", res)
	}
}

func TestLinkedInUnreachable(t *testing.T) {
	srv := fakeLinkedIn(t, 200, `{}`, nil)
	s := ready(t, srv.URL)
	srv.Close()
	if res, _ := s.Test(context.Background(), testBrand, "linkedin"); res.Status != TestError {
		t.Fatalf("%+v", res)
	}
}

func TestCredentialsAreNeverSentToARedirectTarget(t *testing.T) {
	hit := false
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit = true }))
	defer target.Close()
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()
	res, _ := ready(t, redirector.URL).Test(context.Background(), testBrand, "linkedin")
	if hit {
		t.Fatal("the request was forwarded to the redirect target")
	}
	if res.Status == TestValid {
		t.Fatalf("%+v", res)
	}
}

func TestOtherNetworksCannotBeTestedYet(t *testing.T) {
	s, _ := newSettings(t, keyA, nil)
	for _, id := range []string{"x", "instagram"} {
		if _, err := s.Test(context.Background(), testBrand, id); !errors.Is(err, ErrUnsupported) {
			t.Errorf("%s: %v", id, err)
		}
	}
	if _, err := s.Test(context.Background(), testBrand, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatal("unknown network")
	}
}
