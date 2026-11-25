package linkedin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestEscapeReservedCharacters(t *testing.T) {
	for in, want := range map[string]string{
		"plain text":             "plain text",
		"a_b *c* (d) [e] {f}":    `a\_b \*c\* \(d\) \[e\] \{f\}`,
		"mail me @ <here> | ~#1": `mail me \@ \<here\> \| \~\#1`,
		`back\slash`:             `back\\slash`,
		"line1\nline2":           "line1\nline2",
		"• bullet ünïcode 𝗕𝗼𝗹𝗱":  "• bullet ünïcode 𝗕𝗼𝗹𝗱",
		"":                       "",
	} {
		if got := Escape(in); got != want {
			t.Errorf("Escape(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCommentaryAddsHashtagTemplates(t *testing.T) {
	got := Commentary("  Hello (world)  ", []string{"Go", "#data_ai", "", "bad tag"})
	want := "Hello \\(world\\)\n\n{hashtag|\\#|Go} {hashtag|\\#|data\\_ai}"
	if got != want {
		t.Fatalf("%q\nwant %q", got, want)
	}
	if got := Commentary("", []string{"x"}); got != "{hashtag|\\#|x}" {
		t.Fatalf("hashtags only: %q", got)
	}
	if got := Commentary("only text", nil); got != "only text" {
		t.Fatalf("%q", got)
	}
}

/* ------------------------------------------------------------ the three-step publish against a fake */

type fake struct {
	srv        *httptest.Server
	mu         sync.Mutex
	calls      []string
	uploaded   []byte
	postBody   map[string]any
	headers    http.Header
	uploadAuth string
	// behaviour
	initStatus, uploadStatus, postStatus int
	postID                               string
	dropPost                             bool
	uploadURLOverride                    string
}

func newFake(t *testing.T) *fake {
	t.Helper()
	f := &fake{initStatus: 200, uploadStatus: 201, postStatus: 201, postID: "urn:li:share:123"}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.calls = append(f.calls, r.Method+" "+r.URL.Path)
		switch {
		case r.URL.Path == "/rest/images":
			f.headers = r.Header.Clone()
			if f.initStatus != 200 {
				w.WriteHeader(f.initStatus)
				fmt.Fprint(w, `{"message":"nope"}`)
				return
			}
			up := f.srv.URL + "/upload/abc?sig=SECRET"
			if f.uploadURLOverride != "" {
				up = f.uploadURLOverride
			}
			fmt.Fprintf(w, `{"value":{"uploadUrl":%q,"image":"urn:li:image:IMG1"}}`, up)
		case r.URL.Path == "/rest/documents":
			fmt.Fprintf(w, `{"value":{"uploadUrl":%q,"document":"urn:li:document:DOC1"}}`, f.srv.URL+"/upload/doc?sig=SECRET")
		case strings.HasPrefix(r.URL.Path, "/upload/"):
			f.uploadAuth = r.Header.Get("Authorization")
			f.uploaded, _ = io.ReadAll(r.Body)
			w.WriteHeader(f.uploadStatus)
		case r.URL.Path == "/rest/posts":
			_ = json.NewDecoder(r.Body).Decode(&f.postBody)
			if f.dropPost {
				hj, _ := w.(http.Hijacker)
				c, _, _ := hj.Hijack()
				c.Close()
				return
			}
			if f.postStatus == 201 && f.postID != "" {
				w.Header().Set("x-restli-id", f.postID)
			}
			w.WriteHeader(f.postStatus)
			if f.postStatus >= 400 && f.postStatus < 500 {
				fmt.Fprint(w, `{"message":"Field author is invalid"}`)
			}
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fake) client() *Client {
	c := New(f.srv.URL, "202610")
	c.AllowHTTP = true
	c.AllowUploadHost = func(host string) bool { return host == "127.0.0.1" }
	return c
}

var png = []byte("\x89PNG\r\n\x1a\nfake-image-bytes")

func post() Post {
	return Post{AuthorURN: "urn:li:person:Ab_1", Commentary: "Hello", AltText: "A card", Image: png, ContentType: "image/png"}
}

func TestPublishHappyPath(t *testing.T) {
	f := newFake(t)
	urn, err := f.client().Publish(context.Background(), "TOKEN-XYZ", post())
	if err != nil || urn != "urn:li:share:123" {
		t.Fatalf("%q %v", urn, err)
	}
	if got := strings.Join(f.calls, ", "); got != "POST /rest/images, PUT /upload/abc, POST /rest/posts" {
		t.Fatalf("steps: %s", got)
	}
	if string(f.uploaded) != string(png) || f.uploadAuth != "Bearer TOKEN-XYZ" {
		t.Fatalf("upload: %q auth %q", f.uploaded, f.uploadAuth)
	}
	if f.headers.Get("LinkedIn-Version") != "202610" || f.headers.Get("X-Restli-Protocol-Version") != "2.0.0" || f.headers.Get("Authorization") != "Bearer TOKEN-XYZ" {
		t.Fatalf("headers: %v", f.headers)
	}
	b := f.postBody
	media := b["content"].(map[string]any)["media"].(map[string]any)
	if b["author"] != "urn:li:person:Ab_1" || b["commentary"] != "Hello" || b["visibility"] != "PUBLIC" || b["lifecycleState"] != "PUBLISHED" ||
		media["id"] != "urn:li:image:IMG1" || media["altText"] != "A card" {
		t.Fatalf("post body: %v", b)
	}
}

func TestPublishOmitsEmptyAltText(t *testing.T) {
	f := newFake(t)
	p := post()
	p.AltText = ""
	if _, err := f.client().Publish(context.Background(), "t", p); err != nil {
		t.Fatal(err)
	}
	if _, has := f.postBody["content"].(map[string]any)["media"].(map[string]any)["altText"]; has {
		t.Fatal("empty alt text should not be sent")
	}
}

func TestFailuresBeforeThePostAreKnownNotPosted(t *testing.T) {
	for name, tc := range map[string]struct {
		set    func(*fake)
		status int
		want   string
	}{
		"expired token":   {func(f *fake) { f.initStatus = 401 }, 401, "may have expired"},
		"wrong scope":     {func(f *fake) { f.initStatus = 403 }, 403, "scope"},
		"rate limited":    {func(f *fake) { f.initStatus = 429 }, 429, "rate limit"},
		"retired version": {func(f *fake) { f.initStatus = 426 }, 426, "CARDPRESS_LINKEDIN_VERSION"},
		"upload rejected": {func(f *fake) { f.uploadStatus = 400 }, 400, "accept the image"},
		"post rejected":   {func(f *fake) { f.postStatus = 422 }, 422, "Field author is invalid"},
	} {
		f := newFake(t)
		tc.set(f)
		_, err := f.client().Publish(context.Background(), "t", post())
		var api *APIError
		if err == nil || IsUnknownOutcome(err) {
			t.Errorf("%s: want a known failure, got %v", name, err)
			continue
		}
		if !asAPI(err, &api) || api.Status != tc.status || !strings.Contains(api.Message, tc.want) {
			t.Errorf("%s: %v", name, err)
		}
		if strings.Contains(err.Error(), "TOKEN") {
			t.Errorf("%s: message leaks the token", name)
		}
	}
}

func asAPI(err error, target **APIError) bool {
	a, ok := err.(*APIError)
	if ok {
		*target = a
	}
	return ok
}

func TestAnUnclearAnswerToTheCreateCallIsUnknownNotFailed(t *testing.T) {
	cases := map[string]func(*fake){
		"connection dropped": func(f *fake) { f.dropPost = true },
		"server error":       func(f *fake) { f.postStatus = 503 },
		"no post id":         func(f *fake) { f.postID = "" },
	}
	for name, set := range cases {
		f := newFake(t)
		set(f)
		if _, err := f.client().Publish(context.Background(), "t", post()); !IsUnknownOutcome(err) {
			t.Errorf("%s: want unknown outcome, got %v", name, err)
		}
	}
}

func TestTheTokenIsOnlySentToLinkedInHosts(t *testing.T) {
	var evil int
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { evil++ }))
	defer target.Close()
	f := newFake(t)
	f.uploadURLOverride = target.URL + "/steal"
	c := f.client()
	c.AllowUploadHost = isLinkedInHost // the real rule: 127.0.0.1 is not LinkedIn
	if _, err := c.Publish(context.Background(), "SECRET", post()); err == nil || !strings.Contains(err.Error(), "not a LinkedIn host") {
		t.Fatalf("%v", err)
	}
	if evil != 0 {
		t.Fatal("the upload went to a non-LinkedIn host")
	}
	for host, want := range map[string]bool{"www.linkedin.com": true, "linkedin.com": true, "media.licdn.com": true, "evil-linkedin.com": false, "linkedin.com.evil.io": false} {
		if isLinkedInHost(host) != want {
			t.Errorf("isLinkedInHost(%q) != %v", host, want)
		}
	}
}

func TestRedirectsAreNotFollowed(t *testing.T) {
	hit := 0
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit++ }))
	defer target.Close()
	redir := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 307) }))
	defer redir.Close()
	if _, err := New(redir.URL, "").Publish(context.Background(), "t", post()); err == nil {
		t.Fatal("expected a failure")
	}
	if hit != 0 {
		t.Fatal("the redirect was followed")
	}
}

func TestPublishRequiresTokenAuthorAndImage(t *testing.T) {
	c := New("http://127.0.0.1:1", "")
	for _, p := range []Post{{AuthorURN: "u", Image: png}, {Image: png}, {AuthorURN: "u"}} {
		tok := "t"
		if p.AuthorURN == "u" && p.Image != nil {
			tok = ""
		}
		if _, err := c.Publish(context.Background(), tok, p); err == nil {
			t.Errorf("%+v: expected an error", p)
		}
	}
}

func TestPostURL(t *testing.T) {
	if PostURL("urn:li:share:9") != "https://www.linkedin.com/feed/update/urn:li:share:9/" || PostURL("") != "" {
		t.Fatal("wrong URL")
	}
}

func TestATraceRecordsEachAnswerAndNeverTheToken(t *testing.T) {
	f := newFake(t)
	ctx, tr := WithTrace(context.Background())
	if _, err := f.client().Publish(ctx, "TOKEN-XYZ", post()); err != nil {
		t.Fatal(err)
	}
	steps := tr.Steps()
	if len(steps) != 3 || steps[0].Step != "Reserve the image upload" || steps[1].Step != "Upload the image" || steps[2].Step != "Create the post" {
		t.Fatalf("%+v", steps)
	}
	if steps[2].Status != 201 || steps[2].Headers["X-Restli-Id"] != "urn:li:share:123" || steps[2].Path != "/rest/posts" {
		t.Fatalf("%+v", steps[2])
	}
	raw, _ := json.Marshal(steps)
	if strings.Contains(string(raw), "TOKEN-XYZ") || strings.Contains(string(raw), "SECRET") {
		t.Fatalf("a trace must hold neither the token nor a query string: %s", raw)
	}
}

func TestATraceKeepsAFailedAnswer(t *testing.T) {
	f := newFake(t)
	f.postStatus = 422
	ctx, tr := WithTrace(context.Background())
	if _, err := f.client().Publish(ctx, "T", post()); err == nil {
		t.Fatal("expected a failure")
	}
	steps := tr.Steps()
	last := steps[len(steps)-1]
	if last.Status != 422 || !strings.Contains(last.Body, "Field author is invalid") {
		t.Fatalf("%+v", last)
	}
}

func TestPublishADocument(t *testing.T) {
	f := newFake(t)
	pdf := []byte("%PDF-1.7 pages")
	p := Post{AuthorURN: "urn:li:person:Ab_1", Commentary: "Hello", AltText: "not for a document", Image: pdf, ContentType: "application/pdf", Document: true, Title: " Our deck "}
	urn, err := f.client().Publish(context.Background(), "TOKEN-XYZ", p)
	if err != nil || urn != "urn:li:share:123" {
		t.Fatalf("%q %v", urn, err)
	}
	if got := strings.Join(f.calls, ", "); got != "POST /rest/documents, PUT /upload/doc, POST /rest/posts" {
		t.Fatalf("steps: %s", got)
	}
	if string(f.uploaded) != string(pdf) || f.uploadAuth != "Bearer TOKEN-XYZ" {
		t.Fatalf("upload: %q auth %q", f.uploaded, f.uploadAuth)
	}
	media := f.postBody["content"].(map[string]any)["media"].(map[string]any)
	if media["id"] != "urn:li:document:DOC1" || media["title"] != "Our deck" {
		t.Fatalf("media: %v", media)
	}
	if _, has := media["altText"]; has {
		t.Fatal("a document has no alt text")
	}

	// a document without a title is refused before anything is sent
	f2 := newFake(t)
	p.Title = "  "
	if _, err := f2.client().Publish(context.Background(), "t", p); err == nil || len(f2.calls) != 0 {
		t.Fatalf("no title: %v, calls %v", err, f2.calls)
	}
}

func TestPublishSeveralImages(t *testing.T) {
	f := newFake(t)
	loaded := 0
	pic := func(alt string) Picture {
		return Picture{AltText: alt, Load: func() ([]byte, error) { loaded++; return png, nil }}
	}
	p := Post{AuthorURN: "urn:li:person:Ab_1", Commentary: "Hello", Pictures: []Picture{pic("first"), pic(""), pic("third")}}
	urn, err := f.client().Publish(context.Background(), "TOKEN-XYZ", p)
	if err != nil || urn != "urn:li:share:123" || loaded != 3 {
		t.Fatalf("%q %v loaded %d", urn, err, loaded)
	}
	if got := strings.Join(f.calls, ", "); got != "POST /rest/images, PUT /upload/abc, POST /rest/images, PUT /upload/abc, POST /rest/images, PUT /upload/abc, POST /rest/posts" {
		t.Fatalf("steps: %s", got)
	}
	content := f.postBody["content"].(map[string]any)
	if _, has := content["media"]; has {
		t.Fatal("a multi-image post has no single media")
	}
	images := content["multiImage"].(map[string]any)["images"].([]any)
	if len(images) != 3 || images[0].(map[string]any)["altText"] != "first" || images[0].(map[string]any)["id"] != "urn:li:image:IMG1" {
		t.Fatalf("images: %v", images)
	}
	if _, has := images[1].(map[string]any)["altText"]; has {
		t.Fatal("empty alt text should not be sent")
	}

	// a picture that fails to upload stops the post before it is created
	f2 := newFake(t)
	f2.uploadStatus = 500
	if _, err := f2.client().Publish(context.Background(), "t", p); err == nil || IsUnknownOutcome(err) || strings.Contains(strings.Join(f2.calls, ","), "/rest/posts") {
		t.Fatalf("failed upload: %v, calls %v", err, f2.calls)
	}
	// one that cannot be read does too, and says which
	f3 := newFake(t)
	p.Pictures[1].Load = func() ([]byte, error) { return nil, fmt.Errorf("gone") }
	if _, err := f3.client().Publish(context.Background(), "t", p); err == nil || !strings.Contains(err.Error(), "image 2 of 3") || strings.Contains(strings.Join(f3.calls, ","), "/rest/posts") {
		t.Fatalf("unreadable picture: %v", err)
	}
}
