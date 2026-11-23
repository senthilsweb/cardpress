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

	"github.com/senthilsweb/cardpress/internal/agent"
	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/mcpserver"
	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/source"
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

/* ---------------------------------------------------------------- chat */

type stubFetcher struct{ src source.Source }

func (f stubFetcher) Fetch(context.Context, string) (source.Source, error) { return f.src, nil }

const article = "Databases are everywhere in modern software. Teams choose Postgres because it handles many workloads well. " +
	"Migrations take planning and patience across several weeks. Backups and restores should be tested regularly by every team."

func chatHandler(t *testing.T, token string, f service.SourceFetcher) http.Handler {
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
	return New(Options{Studio: service.New(db.DB), Chat: service.NewChat(db.DB, &agent.Mock{}, f), Token: token, Version: "t", DBDriver: db.Driver})
}

type sse struct{ Name, Data string }

func parseSSE(body string) []sse {
	var out []sse
	for _, block := range strings.Split(strings.TrimSpace(body), "\n\n") {
		var e sse
		for _, line := range strings.Split(block, "\n") {
			switch {
			case strings.HasPrefix(line, "event: "):
				e.Name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				e.Data = strings.TrimPrefix(line, "data: ")
			}
		}
		out = append(out, e)
	}
	return out
}

func startChat(t *testing.T, h http.Handler) service.Conversation {
	t.Helper()
	r := do(h, "POST", "/api/v1/chat/conversations", `{"profileId":"p","text":"`+article+`"}`, nil)
	if r.Code != 201 {
		t.Fatalf("start: %d %s", r.Code, r.Body)
	}
	var c service.Conversation
	if err := json.Unmarshal(r.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestChatFromStartToApproval(t *testing.T) {
	h := chatHandler(t, "", stubFetcher{})
	conv := startChat(t, h)
	if conv.Agent.AI || conv.Agent.Name != "Demo agent" {
		t.Fatalf("the screen must be able to tell this is a demo: %+v", conv.Agent)
	}

	r := do(h, "POST", "/api/v1/chat/conversations/"+conv.ID+"/messages", `{"content":""}`, nil)
	if r.Code != 200 || r.Header().Get("Content-Type") != "text/event-stream" || r.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %v", r.Code, r.Header())
	}
	events := parseSSE(r.Body.String())
	var order []string
	var deltas, reply string
	var proposalID string
	for _, e := range events {
		if len(order) == 0 || order[len(order)-1] != e.Name {
			order = append(order, e.Name)
		}
		switch e.Name {
		case "delta":
			var d struct{ Text string }
			_ = json.Unmarshal([]byte(e.Data), &d)
			deltas += d.Text
		case "proposal":
			var p service.ProposalView
			_ = json.Unmarshal([]byte(e.Data), &p)
			proposalID = p.ID
			if p.Status != "pending" || p.Kind != "post" || p.Body == "" {
				t.Fatalf("%+v", p)
			}
		case "message":
			var m service.ChatMessage
			_ = json.Unmarshal([]byte(e.Data), &m)
			reply = m.Content
		}
	}
	if strings.Join(order, ",") != "user,delta,proposal,message,done" {
		t.Fatalf("event order: %v", order)
	}
	if deltas != reply || proposalID == "" {
		t.Fatalf("the streamed text must equal the stored reply: %q vs %q", deltas, reply)
	}

	// reload: everything is restored
	g := do(h, "GET", "/api/v1/chat/conversations/"+conv.ID, "", nil)
	var got service.Conversation
	_ = json.Unmarshal(g.Body.Bytes(), &got)
	if g.Code != 200 || len(got.Messages) != 2 || len(got.Proposals) != 1 {
		t.Fatalf("%d %s", g.Code, g.Body)
	}
	if l := do(h, "GET", "/api/v1/chat/conversations?profileId=p", "", nil); l.Code != 200 || !strings.Contains(l.Body.String(), conv.ID) || !strings.Contains(l.Body.String(), `"ai":false`) {
		t.Fatalf("%d %s", l.Code, l.Body)
	}

	// the person approves (with an edit); nothing is published or saved by the server
	d := do(h, "POST", "/api/v1/chat/proposals/"+proposalID+"/decision", `{"status":"approved","draftId":"d1","edited":{"kind":"post","title":"Mine","body":"Edited text.","hashtags":["#Go"],"altText":"x"}}`, nil)
	if d.Code != 200 || !strings.Contains(d.Body.String(), `"status":"approved"`) || !strings.Contains(d.Body.String(), `"edited":true`) {
		t.Fatalf("%d %s", d.Code, d.Body)
	}
	if again := do(h, "POST", "/api/v1/chat/proposals/"+proposalID+"/decision", `{"status":"rejected"}`, nil); again.Code != 409 {
		t.Fatalf("deciding twice: %d", again.Code)
	}
	if del := do(h, "DELETE", "/api/v1/chat/conversations/"+conv.ID, "", nil); del.Code != 204 {
		t.Fatalf("delete: %d", del.Code)
	}
	if gone := do(h, "GET", "/api/v1/chat/conversations/"+conv.ID, "", nil); gone.Code != 404 {
		t.Fatalf("after delete: %d", gone.Code)
	}
}

func TestChatErrorsAreNormalJSONBeforeAnythingStreams(t *testing.T) {
	h := chatHandler(t, "", stubFetcher{})
	conv := startChat(t, h)
	for _, c := range []struct {
		method, path, body string
		want               int
	}{
		{"POST", "/api/v1/chat/conversations", `{"profileId":"p"}`, 400},
		{"POST", "/api/v1/chat/conversations", `{"profileId":"p","url":"https://a.io","text":"` + article + `"}`, 400},
		{"POST", "/api/v1/chat/conversations", `{"profileId":"p","text":"tiny"}`, 400},
		{"POST", "/api/v1/chat/conversations", `not json`, 400},
		{"POST", "/api/v1/chat/conversations/nope/messages", `{"content":"x"}`, 404},
		{"GET", "/api/v1/chat/conversations/nope", ``, 404},
		{"GET", "/api/v1/chat/conversations", ``, 400},
		{"POST", "/api/v1/chat/conversations/" + conv.ID + "/messages", `{"content":"` + strings.Repeat("a", 20001) + `"}`, 400},
		{"POST", "/api/v1/chat/proposals/nope/decision", `{"status":"approved"}`, 404},
		{"POST", "/api/v1/chat/proposals/nope/decision", `{"status":"maybe"}`, 400},
	} {
		r := do(h, c.method, c.path, c.body, nil)
		if r.Code != c.want {
			t.Errorf("%s %s: %d, want %d (%s)", c.method, c.path, r.Code, c.want, r.Body)
		}
		if c.want >= 400 && r.Header().Get("Content-Type") == "text/event-stream" {
			t.Errorf("%s %s: an early error must not be a stream", c.method, c.path)
		}
	}
}

func TestAnAddressOnThisMachineIsRefusedByTheRealFetcher(t *testing.T) {
	h := chatHandler(t, "", source.New())
	for _, u := range []string{"http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://[::1]/", "file:///etc/passwd"} {
		r := do(h, "POST", "/api/v1/chat/conversations", `{"profileId":"p","url":"`+u+`"}`, nil)
		if r.Code != 400 {
			t.Errorf("%s: %d %s", u, r.Code, r.Body)
		}
	}
}

func TestChatNeedsTheTokenAndInfoShowsTheAgent(t *testing.T) {
	h := chatHandler(t, "0123456789abcdef", stubFetcher{})
	for _, c := range [][2]string{{"POST", "/api/v1/chat/conversations"}, {"GET", "/api/v1/chat/conversations?profileId=p"}, {"POST", "/api/v1/chat/conversations/x/messages"}, {"POST", "/api/v1/chat/proposals/x/decision"}} {
		if r := do(h, c[0], c[1], `{}`, nil); r.Code != 401 {
			t.Errorf("%s %s without a token: %d", c[0], c[1], r.Code)
		}
	}
	if r := do(h, "GET", "/api/v1/info", "", nil); !strings.Contains(r.Body.String(), `"agent":{"name":"Demo agent","ai":false}`) {
		t.Fatalf("%s", r.Body)
	}
}

func TestErrorMessagesAreForPeopleNotCode(t *testing.T) {
	h := chatHandler(t, "", stubFetcher{})
	r := do(h, "POST", "/api/v1/chat/conversations", `{"profileId":"p","text":"tiny"}`, nil)
	var out struct {
		Error struct{ Code, Message string }
	}
	_ = json.Unmarshal(r.Body.Bytes(), &out)
	if r.Code != 400 || out.Error.Code != "invalid" || strings.Contains(out.Error.Message, "invalid input") || out.Error.Message == "" || out.Error.Message[0] < 'A' || out.Error.Message[0] > 'Z' {
		t.Fatalf("%d %q", r.Code, out.Error.Message)
	}
}

/* ---------------------------------------------------------------- browser protections */

func guardedHandler(t *testing.T, o Options) http.Handler {
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
	o.Studio = service.New(db.DB)
	o.Version = "t"
	return New(o)
}

func doHost(h http.Handler, method, path, host string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(`{"profiles":[{"id":"p"}]}`))
	req.Host = host
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestWithNoTokenOnlyLocalhostNamesAreAnswered(t *testing.T) {
	h := guardedHandler(t, Options{LocalGuard: true, AllowedHosts: []string{"cards.lan:8080"}})
	for host, want := range map[string]int{
		"localhost:8080": 200, "localhost": 200, "LOCALHOST:4321": 200, "127.0.0.1:8080": 200, "[::1]:8080": 200,
		"cards.lan": 200, "cards.lan:9999": 200,
		"evil.example": 403, "evil.example:8080": 403, "127.0.0.1.evil.example": 403, "192.168.1.5:8080": 403, "": 403,
	} {
		if r := doHost(h, "GET", "/api/v1/state", host, nil); r.Code != want {
			t.Errorf("Host %q: %d, want %d (%s)", host, r.Code, want, r.Body)
		}
	}
	if r := doHost(h, "GET", "/api/v1/state", "evil.example", nil); !strings.Contains(r.Body.String(), "host_not_allowed") || !strings.Contains(r.Body.String(), "CARDPRESS_ALLOWED_HOSTS") {
		t.Fatalf("the refusal should say how to fix it: %s", r.Body)
	}
	// with a token the host does not matter: an attacker's page has no token to send
	tok := guardedHandler(t, Options{Token: "0123456789abcdef"})
	if r := doHost(tok, "GET", "/api/v1/state", "anything.example", map[string]string{"Authorization": "Bearer 0123456789abcdef"}); r.Code != 200 {
		t.Fatalf("%d", r.Code)
	}
}

func TestAnotherWebsiteCannotMakeYourBrowserChangeThings(t *testing.T) {
	h := guardedHandler(t, Options{CORSOrigins: []string{"https://studio.example"}})
	put := func(hdr map[string]string) int {
		return doHost(h, "PUT", "/api/v1/profiles", "localhost:8080", hdr).Code
	}
	if c := put(nil); c != 204 {
		t.Fatalf("a request with no browser headers (curl, a script, an MCP client): %d", c)
	}
	if c := put(map[string]string{"Sec-Fetch-Site": "same-origin", "Origin": "http://localhost:8080"}); c != 204 {
		t.Fatalf("the app itself: %d", c)
	}
	if c := put(map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}); c != 403 {
		t.Fatalf("another website: %d", c)
	}
	if c := put(map[string]string{"Origin": "https://evil.example"}); c != 403 {
		t.Fatalf("an Origin from another host, in a browser without Sec-Fetch-Site: %d", c)
	}
	if r := doHost(h, "PUT", "/api/v1/profiles", "localhost:8080", map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}); !strings.Contains(r.Body.String(), "cross_origin") {
		t.Fatalf("%s", r.Body)
	}
	if c := put(map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://studio.example"}); c != 204 {
		t.Fatalf("the separately hosted web app that was listed: %d", c)
	}
	// reading is a safe method, so it is not blocked here (CORS still stops the other site from reading the answer)
	if r := doHost(h, "GET", "/api/v1/info", "localhost:8080", map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}); r.Code != 200 || r.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("%d %v", r.Code, r.Header())
	}
}

func TestProtectGuardsAnyHandlerLikeTheAPI(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	withToken := Protect(ProtectOptions{Token: "0123456789abcdef"}, ok)
	if r := doHost(withToken, "POST", "/mcp", "localhost", nil); r.Code != 401 {
		t.Fatalf("no token: %d", r.Code)
	}
	if r := doHost(withToken, "POST", "/mcp", "localhost", map[string]string{"Authorization": "Bearer wrong"}); r.Code != 401 {
		t.Fatalf("wrong token: %d", r.Code)
	}
	if r := doHost(withToken, "POST", "/mcp", "localhost", map[string]string{"Authorization": "Bearer 0123456789abcdef"}); r.Code != 200 {
		t.Fatalf("right token: %d", r.Code)
	}
	if r := doHost(withToken, "POST", "/mcp", "localhost", map[string]string{"Authorization": "Bearer 0123456789abcdef", "Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}); r.Code != 403 {
		t.Fatalf("even with a token, a cross-site browser request is refused: %d", r.Code)
	}
	local := Protect(ProtectOptions{LocalGuard: true}, ok)
	if r := doHost(local, "POST", "/mcp", "evil.example", nil); r.Code != 403 {
		t.Fatalf("rebinding: %d", r.Code)
	}
	if r := doHost(local, "POST", "/mcp", "127.0.0.1:8080", nil); r.Code != 200 {
		t.Fatalf("%d", r.Code)
	}
}

type fakeAudit struct{ entries []mcpserver.AuditEntry }

func (f fakeAudit) List(_ context.Context, limit int) ([]mcpserver.AuditEntry, error) {
	return f.entries, nil
}

func TestTheMCPAuditCanBeRead(t *testing.T) {
	h := guardedHandler(t, Options{Token: "0123456789abcdef", Audit: fakeAudit{[]mcpserver.AuditEntry{{ID: 1, Tool: "propose_content", Caller: "agent 1", Outcome: "ok", Args: "{}"}}}})
	if r := do(h, "GET", "/api/v1/mcp/audit", "", nil); r.Code != 401 {
		t.Fatalf("the audit needs the token: %d", r.Code)
	}
	r := do(h, "GET", "/api/v1/mcp/audit?limit=5", "", map[string]string{"Authorization": "Bearer 0123456789abcdef"})
	if r.Code != 200 || !strings.Contains(r.Body.String(), "propose_content") || !strings.Contains(r.Body.String(), `"enabled":true`) {
		t.Fatalf("%d %s", r.Code, r.Body)
	}
	off := guardedHandler(t, Options{})
	if r := do(off, "GET", "/api/v1/mcp/audit", "", nil); r.Code != 200 || !strings.Contains(r.Body.String(), `"enabled":false`) {
		t.Fatalf("%d %s", r.Code, r.Body)
	}
}
