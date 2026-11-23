package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/store"
)

func handler(t *testing.T, token string, origins ...string) http.Handler {
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
	return New(Options{Studio: service.New(db.DB), Token: token, CORSOrigins: origins, Version: "test", DBDriver: db.Driver})
}

func do(h http.Handler, method, path, body string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStateRoundTrip(t *testing.T) {
	h := handler(t, "")
	if r := do(h, "PUT", "/api/v1/profiles", `{"profiles":[{"id":"p","name":"Me"}]}`, nil); r.Code != 204 {
		t.Fatalf("put profiles: %d %s", r.Code, r.Body)
	}
	if r := do(h, "PUT", "/api/v1/designs", `{"designs":{"p":{"title":"T"}}}`, nil); r.Code != 204 {
		t.Fatalf("put designs: %d %s", r.Code, r.Body)
	}
	if r := do(h, "PUT", "/api/v1/preferences/theme", `"dark"`, nil); r.Code != 204 {
		t.Fatalf("put pref: %d %s", r.Code, r.Body)
	}
	r := do(h, "GET", "/api/v1/state", "", nil)
	var st service.State
	if err := json.Unmarshal(r.Body.Bytes(), &st); err != nil || r.Code != 200 {
		t.Fatalf("state: %d %v", r.Code, err)
	}
	if len(st.Profiles) != 1 || string(st.Designs["p"]) != `{"title":"T"}` || string(st.Preferences["theme"]) != `"dark"` {
		t.Fatalf("%+v", st)
	}
}

func TestErrors(t *testing.T) {
	h := handler(t, "")
	cases := []struct {
		method, path, body string
		want               int
	}{
		{"PUT", "/api/v1/profiles", `{"profiles":[]}`, 400},
		{"PUT", "/api/v1/profiles", `not json`, 400},
		{"PUT", "/api/v1/preferences/secret", `"x"`, 400},
		{"GET", "/api/v1/nope", ``, 404},
		{"POST", "/api/v1/import/legacy", `{"profiles":[{"id":"a"}]}`, 204},
		{"POST", "/api/v1/import/legacy", `{"profiles":[{"id":"a"}]}`, 409},
	}
	for _, c := range cases {
		r := do(h, c.method, c.path, c.body, nil)
		if r.Code != c.want {
			t.Errorf("%s %s %q: %d, want %d (%s)", c.method, c.path, c.body, r.Code, c.want, r.Body)
		}
		if c.want >= 400 && !strings.Contains(r.Body.String(), `"requestId"`) {
			t.Errorf("error body lacks requestId: %s", r.Body)
		}
	}
}

func TestTokenGuard(t *testing.T) {
	h := handler(t, "0123456789abcdef")
	if r := do(h, "GET", "/api/v1/info", "", nil); r.Code != 200 || !strings.Contains(r.Body.String(), `"authRequired":true`) {
		t.Fatalf("info must stay open: %d %s", r.Code, r.Body)
	}
	if r := do(h, "GET", "/api/v1/state", "", nil); r.Code != 401 {
		t.Fatalf("no token: %d", r.Code)
	}
	if r := do(h, "GET", "/api/v1/state", "", map[string]string{"Authorization": "Bearer wrong"}); r.Code != 401 {
		t.Fatalf("wrong token: %d", r.Code)
	}
	if r := do(h, "GET", "/api/v1/state", "", map[string]string{"Authorization": "0123456789abcdef"}); r.Code != 401 {
		t.Fatalf("missing Bearer scheme: %d", r.Code)
	}
	if r := do(h, "GET", "/api/v1/state", "", map[string]string{"Authorization": "Bearer 0123456789abcdef"}); r.Code != 200 {
		t.Fatalf("right token: %d", r.Code)
	}
}

func TestCORS(t *testing.T) {
	h := handler(t, "0123456789abcdef", "https://studio.example")
	pre := do(h, "OPTIONS", "/api/v1/state", "", map[string]string{"Origin": "https://studio.example", "Access-Control-Request-Method": "GET"})
	if pre.Code != 204 || pre.Header().Get("Access-Control-Allow-Origin") != "https://studio.example" {
		t.Fatalf("preflight from allowed origin: %d %v", pre.Code, pre.Header())
	}
	other := do(h, "GET", "/api/v1/info", "", map[string]string{"Origin": "https://evil.example"})
	if other.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("CORS header sent to a disallowed origin")
	}
}

func TestDraftEndpoints(t *testing.T) {
	h := handler(t, "")
	body := `{"profileId":"p","kind":"post","doc":{"type":"doc","content":[]},"hashtags":["a"]}`
	r := do(h, "POST", "/api/v1/drafts", body, nil)
	if r.Code != 201 {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	var d service.Draft
	if err := json.Unmarshal(r.Body.Bytes(), &d); err != nil || d.ID == "" {
		t.Fatalf("%v %s", err, r.Body)
	}
	if r := do(h, "GET", "/api/v1/drafts?profileId=p", "", nil); r.Code != 200 || !strings.Contains(r.Body.String(), d.ID) {
		t.Fatalf("list: %d %s", r.Code, r.Body)
	}
	if r := do(h, "GET", "/api/v1/drafts", "", nil); r.Code != 400 {
		t.Fatalf("list without profileId: %d", r.Code)
	}
	if r := do(h, "PUT", "/api/v1/drafts/"+d.ID, strings.Replace(body, `"post"`, `"article"`, 1), nil); r.Code != 200 || !strings.Contains(r.Body.String(), `"article"`) {
		t.Fatalf("update: %d %s", r.Code, r.Body)
	}
	if r := do(h, "PUT", "/api/v1/drafts/nope", body, nil); r.Code != 404 {
		t.Fatalf("update missing: %d", r.Code)
	}
	if r := do(h, "POST", "/api/v1/drafts", `{"profileId":"p","kind":"x","doc":{"type":"doc"}}`, nil); r.Code != 400 {
		t.Fatalf("bad kind: %d", r.Code)
	}
	if r := do(h, "DELETE", "/api/v1/drafts/"+d.ID, "", nil); r.Code != 204 {
		t.Fatalf("delete: %d", r.Code)
	}
	if r := do(h, "GET", "/api/v1/drafts/"+d.ID, "", nil); r.Code != 404 {
		t.Fatalf("get after delete: %d", r.Code)
	}
}

/* ---------------------------------------------------------------- settings */

const (
	testKey    = "0123456789abcdef0123456789abcdef"
	testSecret = "AQV-very-long-access-token-1234"
)

func settingsHandler(t *testing.T, token string, withKey bool, env map[string]string) http.Handler {
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
	if withKey {
		if box, err = secrets.NewBox(testKey, "env"); err != nil {
			t.Fatal(err)
		}
	}
	return New(Options{
		Studio: service.New(db.DB), Settings: service.NewSettings(db.DB, box, func(k string) string { return env[k] }),
		Token: token, Version: "test", DBDriver: db.Driver,
	})
}

func TestSettingsNeverReturnASecret(t *testing.T) {
	h := settingsHandler(t, "", true, nil)
	put := `{"fields":{"clientId":"77abc","clientSecret":"client-secret-ABCDEFGH-9876","accessToken":"` + testSecret + `","authorUrn":"urn:li:person:Ab_12"}}`
	r := do(h, "PUT", "/api/v1/settings/linkedin", put, nil)
	if r.Code != 200 {
		t.Fatalf("put: %d %s", r.Code, r.Body)
	}
	for _, path := range []string{"/api/v1/settings", "/api/v1/settings/linkedin", "/api/v1/state", "/api/v1/info"} {
		resp := do(h, "GET", path, "", nil)
		if resp.Code != 200 {
			t.Fatalf("%s: %d", path, resp.Code)
		}
		body := resp.Body.String()
		if strings.Contains(body, testSecret) || strings.Contains(body, "client-secret-ABCDEFGH") {
			t.Fatalf("%s leaks a secret: %s", path, body)
		}
		if resp.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s must not be cacheable", path)
		}
	}
	if body := do(h, "GET", "/api/v1/settings/linkedin", "", nil).Body.String(); !strings.Contains(body, "••••1234") || !strings.Contains(body, "77abc") {
		t.Fatalf("expected a masked token and the client ID in full: %s", body)
	}
	// the secret is also not echoed in an error
	if bad := do(h, "PUT", "/api/v1/settings/linkedin", `{"fields":{"nope":"`+testSecret+`"}}`, nil); strings.Contains(bad.Body.String(), testSecret) {
		t.Fatalf("error echoes the submitted value: %s", bad.Body)
	}
}

func TestSettingsErrors(t *testing.T) {
	noKey := settingsHandler(t, "", false, nil)
	if r := do(noKey, "PUT", "/api/v1/settings/linkedin", `{"fields":{"clientId":"x"}}`, nil); r.Code != 409 || !strings.Contains(r.Body.String(), "no_secret_key") {
		t.Fatalf("no key: %d %s", r.Code, r.Body)
	}
	if r := do(noKey, "GET", "/api/v1/settings", "", nil); r.Code != 200 || !strings.Contains(r.Body.String(), `"canStore":false`) {
		t.Fatalf("%d %s", r.Code, r.Body)
	}
	h := settingsHandler(t, "", true, map[string]string{"CARDPRESS_LINKEDIN_CLIENT_ID": "from-env"})
	for _, c := range []struct {
		method, path, body string
		want               int
	}{
		{"GET", "/api/v1/settings/myspace", "", 404},
		{"PUT", "/api/v1/settings/linkedin", `{"fields":{"nope":"x"}}`, 400},
		{"PUT", "/api/v1/settings/linkedin", `{"fields":{"clientId":"typed"}}`, 400}, // locked by environment
		{"PUT", "/api/v1/settings/linkedin", `not json`, 400},
		{"POST", "/api/v1/settings/x/test", "", 501},
		{"POST", "/api/v1/settings/myspace/test", "", 404},
		{"POST", "/api/v1/settings/linkedin/test", "", 200}, // incomplete, reported in the body
	} {
		if r := do(h, c.method, c.path, c.body, nil); r.Code != c.want {
			t.Errorf("%s %s %q: %d, want %d (%s)", c.method, c.path, c.body, r.Code, c.want, r.Body)
		}
	}
	if r := do(h, "POST", "/api/v1/settings/linkedin/test", "", nil); !strings.Contains(r.Body.String(), `"status":"incomplete"`) {
		t.Fatalf("%s", r.Body)
	}
}

func TestSettingsNeedTheTokenWhenOneIsSet(t *testing.T) {
	h := settingsHandler(t, "0123456789abcdef", true, nil)
	for _, path := range []string{"/api/v1/settings", "/api/v1/settings/linkedin"} {
		if r := do(h, "GET", path, "", nil); r.Code != 401 {
			t.Fatalf("%s without a token: %d", path, r.Code)
		}
	}
	if r := do(h, "PUT", "/api/v1/settings/linkedin", `{"fields":{}}`, nil); r.Code != 401 {
		t.Fatalf("put without a token: %d", r.Code)
	}
}

/* ---------------------------------------------------------------- publishing */

var apiPNG = append([]byte("\x89PNG\r\n\x1a\n"), []byte("pixels")...)

type apiPoster struct {
	mu    sync.Mutex
	calls []linkedin.Post
	err   error
}

func (p *apiPoster) Publish(_ context.Context, _ string, post linkedin.Post) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, post)
	if p.err != nil {
		return "", p.err
	}
	return "urn:li:share:42", nil
}
func (p *apiPoster) n() int { p.mu.Lock(); defer p.mu.Unlock(); return len(p.calls) }

type okCreds map[string]string

func (c okCreds) Resolve(context.Context, string) (map[string]string, error) { return c, nil }

func publishHandler(t *testing.T, token string, creds okCreds) (http.Handler, *apiPoster) {
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
	if creds == nil {
		creds = okCreds{"accessToken": "TOK", "authorUrn": "urn:li:person:Me"}
	}
	li := &apiPoster{}
	pub := service.NewPublisher(db.DB, creds, li, 0)
	t.Cleanup(pub.Wait)
	return New(Options{Studio: service.New(db.DB), Publishing: pub, Token: token, Version: "t", DBDriver: db.Driver}), li
}

func postJob(h http.Handler, meta string, image []byte, hdr map[string]string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("meta", meta)
	if image != nil {
		fw, _ := mw.CreateFormFile("image", "card.png")
		_, _ = fw.Write(image)
	}
	_ = mw.Close()
	req := httptest.NewRequest("POST", "/api/v1/publish/jobs", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func waitStatus(t *testing.T, h http.Handler, id, want string) service.Job {
	t.Helper()
	var j service.Job
	for i := 0; i < 100; i++ {
		r := do(h, "GET", "/api/v1/publish/jobs/"+id, "", nil)
		_ = json.Unmarshal(r.Body.Bytes(), &j)
		if j.Status == want {
			return j
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("job never reached %q, last %+v", want, j)
	return j
}

func TestPublishNowThroughTheAPI(t *testing.T) {
	h, li := publishHandler(t, "", nil)
	r := postJob(h, `{"profileId":"p","draftId":"d","body":"Hello","hashtags":["Go"],"altText":"card"}`, apiPNG, nil)
	if r.Code != 201 {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	var j service.Job
	_ = json.Unmarshal(r.Body.Bytes(), &j)
	if j.Status != service.JobPublishing && j.Status != service.JobPublished {
		t.Fatalf("%+v", j)
	}
	done := waitStatus(t, h, j.ID, service.JobPublished)
	if done.PostURL != "https://www.linkedin.com/feed/update/urn:li:share:42/" || li.n() != 1 {
		t.Fatalf("%+v calls=%d", done, li.n())
	}
	list := do(h, "GET", "/api/v1/publish/jobs?profileId=p", "", nil)
	if list.Code != 200 || !strings.Contains(list.Body.String(), j.ID) {
		t.Fatalf("%d %s", list.Code, list.Body)
	}
	if strings.Contains(list.Body.String(), "pixels") || strings.Contains(list.Body.String(), "PNG") {
		t.Fatal("the job list must not carry the image")
	}
	img := do(h, "GET", "/api/v1/publish/jobs/"+j.ID+"/image", "", nil)
	if img.Code != 200 || img.Header().Get("Content-Type") != "image/png" || !bytes.Equal(img.Body.Bytes(), apiPNG) {
		t.Fatalf("image: %d %q", img.Code, img.Header().Get("Content-Type"))
	}
}

func TestScheduleRescheduleCancelDeleteThroughTheAPI(t *testing.T) {
	h, li := publishHandler(t, "", nil)
	at := time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)
	r := postJob(h, `{"profileId":"p","body":"Later","scheduledAt":"`+at+`","timezone":"Europe/London"}`, apiPNG, nil)
	var j service.Job
	_ = json.Unmarshal(r.Body.Bytes(), &j)
	if r.Code != 201 || j.Status != service.JobScheduled || j.Timezone != "Europe/London" {
		t.Fatalf("%d %s", r.Code, r.Body)
	}
	time.Sleep(50 * time.Millisecond)
	if li.n() != 0 {
		t.Fatal("a scheduled post must not publish at creation")
	}
	later := time.Now().Add(5 * time.Hour).UTC().Format(time.RFC3339)
	if rr := do(h, "PUT", "/api/v1/publish/jobs/"+j.ID+"/schedule", `{"scheduledAt":"`+later+`","timezone":"America/New_York"}`, nil); rr.Code != 200 || !strings.Contains(rr.Body.String(), "America/New_York") {
		t.Fatalf("reschedule: %d %s", rr.Code, rr.Body)
	}
	if rr := do(h, "DELETE", "/api/v1/publish/jobs/"+j.ID, "", nil); rr.Code != 409 {
		t.Fatalf("deleting a scheduled job must be refused: %d", rr.Code)
	}
	if rr := do(h, "POST", "/api/v1/publish/jobs/"+j.ID+"/cancel", "", nil); rr.Code != 200 || !strings.Contains(rr.Body.String(), `"cancelled"`) {
		t.Fatalf("cancel: %d %s", rr.Code, rr.Body)
	}
	if rr := do(h, "POST", "/api/v1/publish/jobs/"+j.ID+"/cancel", "", nil); rr.Code != 409 {
		t.Fatalf("cancel twice: %d", rr.Code)
	}
	if rr := do(h, "DELETE", "/api/v1/publish/jobs/"+j.ID, "", nil); rr.Code != 204 {
		t.Fatalf("delete: %d", rr.Code)
	}
	if rr := do(h, "GET", "/api/v1/publish/jobs/"+j.ID, "", nil); rr.Code != 404 {
		t.Fatalf("get after delete: %d", rr.Code)
	}
}

func TestAFailedPublishShowsTheReasonAndCanBeRepeatedByAPerson(t *testing.T) {
	h, li := publishHandler(t, "", nil)
	li.err = &linkedin.APIError{Status: 401, Message: "LinkedIn rejected the access token."}
	var j service.Job
	_ = json.Unmarshal(postJob(h, `{"profileId":"p","body":"x"}`, apiPNG, nil).Body.Bytes(), &j)
	failed := waitStatus(t, h, j.ID, service.JobFailed)
	if !strings.Contains(failed.Error, "rejected the access token") {
		t.Fatalf("%+v", failed)
	}
	li.mu.Lock()
	li.err = nil
	li.mu.Unlock()
	if rr := do(h, "POST", "/api/v1/publish/jobs/"+j.ID+"/publish-now", "", nil); rr.Code != 202 {
		t.Fatalf("publish again: %d %s", rr.Code, rr.Body)
	}
	waitStatus(t, h, j.ID, service.JobPublished)
	if li.n() != 2 {
		t.Fatalf("calls = %d, want 2 (the original and the person's retry)", li.n())
	}
}

func TestPublishingValidationAndGuards(t *testing.T) {
	h, _ := publishHandler(t, "", nil)
	if r := postJob(h, `{"profileId":"p","body":"x"}`, nil, nil); r.Code != 400 {
		t.Fatalf("no image: %d", r.Code)
	}
	if r := postJob(h, `{"profileId":"p","body":"x"}`, []byte("not a png"), nil); r.Code != 400 {
		t.Fatalf("not a png: %d", r.Code)
	}
	if r := postJob(h, `{"profileId":"p","body":"  "}`, apiPNG, nil); r.Code != 400 {
		t.Fatalf("no text: %d", r.Code)
	}
	if r := postJob(h, `not json`, apiPNG, nil); r.Code != 400 {
		t.Fatalf("bad meta: %d", r.Code)
	}
	if r := postJob(h, `{"profileId":"p","body":"x","scheduledAt":"tomorrow","timezone":"UTC"}`, apiPNG, nil); r.Code != 400 {
		t.Fatalf("bad time: %d", r.Code)
	}
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	if r := postJob(h, `{"profileId":"p","body":"x","scheduledAt":"`+past+`","timezone":"UTC"}`, apiPNG, nil); r.Code != 400 {
		t.Fatalf("past: %d", r.Code)
	}
	if r := do(h, "POST", "/api/v1/publish/jobs", "{}", map[string]string{"Content-Type": "application/json"}); r.Code != 400 {
		t.Fatalf("json instead of multipart: %d", r.Code)
	}
	if r := do(h, "GET", "/api/v1/publish/jobs", "", nil); r.Code != 400 {
		t.Fatalf("list without profileId: %d", r.Code)
	}
	for _, p := range []string{"/api/v1/publish/jobs/nope", "/api/v1/publish/jobs/nope/image"} {
		if r := do(h, "GET", p, "", nil); r.Code != 404 {
			t.Fatalf("%s: %d", p, r.Code)
		}
	}
	if r := do(h, "POST", "/api/v1/publish/jobs/nope/publish-now", "", nil); r.Code != 404 {
		t.Fatalf("publish-now unknown: %d", r.Code)
	}
}

func TestNoJobWithoutLinkedInCredentials(t *testing.T) {
	h, li := publishHandler(t, "", okCreds{"clientId": "only"})
	r := postJob(h, `{"profileId":"p","body":"x"}`, apiPNG, nil)
	if r.Code != 400 || !strings.Contains(r.Body.String(), "Social accounts") {
		t.Fatalf("%d %s", r.Code, r.Body)
	}
	if li.n() != 0 {
		t.Fatal("nothing should be sent")
	}
}

func TestPublishingNeedsTheToken(t *testing.T) {
	h, li := publishHandler(t, "0123456789abcdef", nil)
	if r := postJob(h, `{"profileId":"p","body":"x"}`, apiPNG, nil); r.Code != 401 {
		t.Fatalf("create without token: %d", r.Code)
	}
	for _, c := range [][2]string{{"GET", "/api/v1/publish/jobs?profileId=p"}, {"POST", "/api/v1/publish/jobs/x/publish-now"}, {"DELETE", "/api/v1/publish/jobs/x"}, {"GET", "/api/v1/publish/jobs/x/image"}} {
		if r := do(h, c[0], c[1], "", nil); r.Code != 401 {
			t.Errorf("%s %s without token: %d", c[0], c[1], r.Code)
		}
	}
	if r := postJob(h, `{"profileId":"p","body":"x"}`, apiPNG, map[string]string{"Authorization": "Bearer 0123456789abcdef"}); r.Code != 201 {
		t.Fatalf("create with token: %d %s", r.Code, r.Body)
	}
	time.Sleep(100 * time.Millisecond)
	_ = li
}
