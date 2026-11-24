package pages

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/store"
)

type rig struct {
	st *service.Studio
	h  http.Handler
	t  *testing.T
}

var png = append([]byte("\x89PNG\r\n\x1a\n"), 0, 0, 0, 13, 'I', 'H', 'D', 'R', 0, 0, 4, 176, 0, 0, 2, 115, 8, 6, 0, 0, 0)

func newRig(t *testing.T, publicURL string) *rig {
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
	if _, err := db.DB.Exec(`INSERT INTO profiles (id, position, data, updated_at) VALUES ('p', 0, ?, '')`,
		`{"id":"p","name":"Personal","displayName":"Ada Writer","handle":"@ada","website":"https://ada.example"}`); err != nil {
		t.Fatal(err)
	}
	return &rig{st: service.New(db.DB), h: New(Options{Reader: service.NewPages(db.DB), PublicURL: publicURL, Version: "t"}), t: t}
}

func para(text string) string {
	return fmt.Sprintf(`{"type":"paragraph","content":[{"type":"text","text":%q}]}`, text)
}
func doc(blocks ...string) json.RawMessage {
	return json.RawMessage(`{"type":"doc","content":[` + strings.Join(blocks, ",") + `]}`)
}

// live makes an item, approves it and publishes its page.
func (r *rig) live(kind, title string, d json.RawMessage, tags []string, cover bool) service.Draft {
	r.t.Helper()
	ctx := context.Background()
	it, err := r.st.CreateDraft(ctx, service.DraftInput{ProfileID: "p", Kind: kind, Title: title, Doc: d, Hashtags: tags})
	if err != nil {
		r.t.Fatal(err)
	}
	if _, err := r.st.Approve(ctx, it.ID); err != nil {
		r.t.Fatal(err)
	}
	in := service.PageInput{}
	if cover {
		in.Cover = png
	}
	it, err = r.st.PublishPage(ctx, it.ID, in)
	if err != nil {
		r.t.Fatal(err)
	}
	return it
}

func (r *rig) get(method, path string, hdr ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for i := 0; i+1 < len(hdr); i += 2 {
		if hdr[i] == "Host" {
			req.Host = hdr[i+1] // a request's Host is not a header field in Go
			continue
		}
		req.Header.Set(hdr[i], hdr[i+1])
	}
	rec := httptest.NewRecorder()
	r.h.ServeHTTP(rec, req)
	return rec
}

func meta(body, prop string) string {
	m := regexp.MustCompile(`<meta (?:property|name)="` + regexp.QuoteMeta(prop) + `" content="([^"]*)"`).FindStringSubmatch(body)
	if m == nil {
		return ""
	}
	return m[1]
}

func TestAnArticlePageCarriesWhatASocialNetworkAndASearchEngineRead(t *testing.T) {
	r := newRig(t, "https://ada.example")
	img := `{"type":"image","attrs":{"src":"data:image/png;base64,iVBORw0KGgo=","alt":"a chart"}}`
	it := r.live("article", "A Fine Title", doc(
		`{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"A Fine Title"}]}`,
		para("The opening paragraph, which is the description."), `{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Part one"}]}`, img,
		`{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[`+para("Name")+`]}]},{"type":"tableRow","content":[{"type":"tableCell","content":[`+para("orders")+`]}]}]}`,
	), nil, true)
	rec := r.get("GET", "/articles/"+it.Slug)
	body := rec.Body.String()
	if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("%d %s", rec.Code, rec.Header())
	}
	for prop, want := range map[string]string{
		"og:title": "A Fine Title", "og:type": "article", "og:url": "https://ada.example/articles/a-fine-title", "og:site_name": "Ada Writer",
		"og:description": "The opening paragraph, which is the description.", "twitter:card": "summary_large_image",
		"og:image:width": "1200", "og:image:height": "627", "description": "The opening paragraph, which is the description.",
	} {
		if got := meta(body, prop); got != want {
			t.Errorf("%s = %q, want %q", prop, got, want)
		}
	}
	if !strings.HasPrefix(meta(body, "og:image"), "https://ada.example/articles/a-fine-title/cover.png?v=") {
		t.Errorf("og:image: %q", meta(body, "og:image"))
	}
	if !strings.Contains(body, `<link rel="canonical" href="https://ada.example/articles/a-fine-title">`) || !strings.Contains(body, "<h1>A Fine Title</h1>") {
		t.Error("canonical link or heading missing")
	}
	// the title appears once as the h1: the same heading in the text is not repeated
	if strings.Count(body, "A Fine Title</h") != 1 {
		t.Errorf("the title is repeated in the body")
	}
	if !strings.Contains(body, "<h2>Part one</h2>") || !strings.Contains(body, "<th>Name</th>") || !strings.Contains(body, "<td>orders</td>") {
		t.Error("the body is not rendered")
	}
	if strings.Contains(body, "data:image") || !strings.Contains(body, `src="/articles/a-fine-title/img/1"`) {
		t.Error("a picture is its own address, never inlined")
	}
	m := regexp.MustCompile(`<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)
	var ld map[string]any
	if m == nil || json.Unmarshal([]byte(m[1]), &ld) != nil || ld["@type"] != "Article" || ld["headline"] != "A Fine Title" || ld["datePublished"] == "" {
		t.Fatalf("json-ld: %v", m)
	}
	if rec.Header().Get("Content-Security-Policy") == "" || rec.Header().Get("X-Content-Type-Options") != "nosniff" || strings.Contains(body, "<script src") {
		t.Error("security headers or a script are wrong")
	}
	// the cover and the picture are served as files
	if c := r.get("GET", "/articles/a-fine-title/cover.png"); c.Code != 200 || c.Header().Get("Content-Type") != "image/png" || !strings.HasPrefix(c.Body.String(), "\x89PNG") {
		t.Errorf("cover: %d", c.Code)
	}
	if p := r.get("GET", "/articles/a-fine-title/img/1"); p.Code != 200 || p.Header().Get("Content-Type") != "image/png" || !strings.Contains(p.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Errorf("picture: %d %v", p.Code, p.Header())
	}
	if p := r.get("GET", "/articles/a-fine-title/img/2"); p.Code != 404 {
		t.Errorf("no second picture: %d", p.Code)
	}
}

func TestAPostPageIsASocialMediaPostingWithItsHashtags(t *testing.T) {
	r := newRig(t, "")
	it := r.live("post", "", doc(para("First line of the post."), para("More of it.")), []string{"Go", "AI"}, false)
	rec := r.get("GET", "/posts/"+it.Slug, "Host", "blog.example:8443", "X-Forwarded-Proto", "https")
	body := rec.Body.String()
	if rec.Code != 200 || meta(body, "og:url") != "https://blog.example:8443/posts/first-line-of-the-post" || meta(body, "twitter:card") != "summary" {
		t.Fatalf("%d og:url=%q card=%q", rec.Code, meta(body, "og:url"), meta(body, "twitter:card"))
	}
	// a post's title is its first line, so its description is the text after it
	if meta(body, "og:description") != "More of it." {
		t.Errorf("a post's description repeats its title: %q", meta(body, "og:description"))
	}
	if !strings.Contains(body, `"@type":"SocialMediaPosting"`) || !strings.Contains(body, "#Go #AI") || meta(body, "og:image") != "" {
		t.Error("post structured data or hashtags missing")
	}
	if tags := regexp.MustCompile(`property="article:tag" content="([^"]+)"`).FindAllStringSubmatch(body, -1); len(tags) != 2 {
		t.Errorf("tags: %v", tags)
	}
	// a hostile Host header never reaches an absolute address
	bad := r.get("GET", "/posts/"+it.Slug, "Host", `x"><script>alert(1)</script>`)
	if strings.Contains(bad.Body.String(), "alert(1)") {
		t.Error("the Host header was reflected")
	}
}

func TestNothingThatIsNotPublishedIsEverServed(t *testing.T) {
	r := newRig(t, "")
	d, _ := r.st.CreateDraft(context.Background(), service.DraftInput{ProfileID: "p", Kind: "article", Title: "Secret", Doc: doc(para("Private words"))})
	r.st.Approve(context.Background(), d.ID)
	for _, p := range []string{"/articles/secret", "/articles/nope", "/posts/secret", "/articles/secret/cover.png", "/articles/secret/img/1", "/articles/a/b/c/d", "/articles/..%2fetc"} {
		if rec := r.get("GET", p); rec.Code != 404 || strings.Contains(rec.Body.String(), "Private words") {
			t.Errorf("%s: %d", p, rec.Code)
		}
	}
	if rec := r.get("POST", "/articles/secret"); rec.Code != 405 {
		t.Errorf("POST: %d", rec.Code)
	}
	// approved but never published still gives nothing; the list and the sitemap are empty
	if l := r.get("GET", "/articles"); strings.Contains(l.Body.String(), "Secret") {
		t.Error("an unpublished title is listed")
	}
	if s := r.get("GET", "/sitemap.xml"); strings.Contains(s.Body.String(), "secret") {
		t.Error("an unpublished address is in the sitemap")
	}
}

func TestWhatAPersonWroteCannotBreakOutOfThePage(t *testing.T) {
	r := newRig(t, "https://ada.example")
	evil := `{"type":"paragraph","content":[{"type":"text","text":"<img src=x onerror=alert(1)>"},` +
		`{"type":"text","text":"bad link","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]},` +
		`{"type":"text","text":"good link","marks":[{"type":"link","attrs":{"href":"https://ok.example/?a=1&b=2"}}]}]}`
	code := `{"type":"codeBlock","attrs":{"language":"x\"><script>alert(2)</script>"},"content":[{"type":"text","text":"</code></pre><script>alert(3)</script>"}]}`
	badImg := `{"type":"image","attrs":{"src":"javascript:alert(4)","alt":"\"><script>alert(5)</script>"}}`
	it := r.live("article", `Title </title><script>alert(6)</script>`, doc(evil, code, badImg), nil, false)
	rec := r.get("GET", "/articles/"+it.Slug)
	body := rec.Body.String()
	if rec.Code != 200 {
		t.Fatalf("%d", rec.Code)
	}
	for _, bad := range []string{"<script>alert", "onerror=alert(1)>", "javascript:", "<img src=x"} {
		if strings.Contains(body, bad) {
			t.Errorf("the page contains %q", bad)
		}
	}
	if !strings.Contains(body, `href="https://ok.example/?a=1&amp;b=2"`) || !strings.Contains(body, "&lt;img src=x onerror=alert(1)&gt;") {
		t.Errorf("good content was lost or not escaped")
	}
	// the structured data stays valid JSON that cannot close its script element
	m := regexp.MustCompile(`<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)
	var ld map[string]any
	if m == nil || json.Unmarshal([]byte(m[1]), &ld) != nil || ld["headline"] != `Title </title><script>alert(6)</script>` {
		t.Fatalf("json-ld: %v", m)
	}
	// a picture whose source is not a data URL is not served
	if p := r.get("GET", "/articles/"+it.Slug+"/img/1"); p.Code != 404 {
		t.Errorf("%d", p.Code)
	}
}

func TestPagesAreCacheableAndRevalidate(t *testing.T) {
	r := newRig(t, "")
	it := r.live("article", "Cached", doc(para("Text")), nil, true)
	first := r.get("GET", "/articles/"+it.Slug)
	tag := first.Header().Get("ETag")
	if tag == "" || !strings.Contains(first.Header().Get("Cache-Control"), "max-age") {
		t.Fatalf("%v", first.Header())
	}
	if again := r.get("GET", "/articles/"+it.Slug, "If-None-Match", tag); again.Code != 304 || again.Body.Len() != 0 {
		t.Errorf("revalidate: %d", again.Code)
	}
	if head := r.get("HEAD", "/articles/"+it.Slug); head.Code != 200 || head.Body.Len() != 0 {
		t.Errorf("HEAD: %d %d", head.Code, head.Body.Len())
	}
	if c := r.get("GET", "/articles/"+it.Slug+"/cover.png"); c.Header().Get("ETag") == "" || !strings.Contains(c.Header().Get("Cache-Control"), "86400") {
		t.Errorf("cover caching: %v", c.Header())
	}
}

func TestTheListPagesWithLinksForCrawlers(t *testing.T) {
	r := newRig(t, "https://ada.example")
	for i := 0; i < 23; i++ {
		r.live("article", fmt.Sprintf("Article number %02d", i), doc(para("Body "+fmt.Sprint(i))), nil, i%2 == 0)
	}
	one := r.get("GET", "/articles")
	body := one.Body.String()
	if one.Code != 200 || strings.Count(body, `<li>`) != 20 || !strings.Contains(body, `rel="next" href="/articles?page=2"`) || strings.Contains(body, `rel="prev"`) {
		t.Fatalf("page 1: %d items=%d", one.Code, strings.Count(body, "<li>"))
	}
	if !strings.Contains(body, `<link rel="canonical" href="https://ada.example/articles">`) || !strings.Contains(body, "23 pages") {
		t.Error("canonical or total missing")
	}
	two := r.get("GET", "/articles?page=2").Body.String()
	if strings.Count(two, "<li>") != 3 || !strings.Contains(two, `rel="prev" href="/articles"`) || strings.Contains(two, `rel="next"`) {
		t.Errorf("page 2: %d", strings.Count(two, "<li>"))
	}
	if past := r.get("GET", "/articles?page=99").Body.String(); strings.Count(past, "<li>") != 3 {
		t.Error("a page past the end shows the last")
	}
	if posts := r.get("GET", "/posts").Body.String(); !strings.Contains(posts, "Nothing is published here yet.") {
		t.Error("an empty list says so")
	}
	// newest first: the last one made is the first listed
	if !strings.Contains(r.get("GET", "/articles").Body.String(), "Article number 22") {
		t.Error("order")
	}
}

func TestSitemapAndRobots(t *testing.T) {
	r := newRig(t, "https://ada.example")
	r.live("article", "In the map", doc(para("x")), nil, false)
	r.live("post", "", doc(para("A post line")), nil, false)
	sm := r.get("GET", "/sitemap.xml")
	body := sm.Body.String()
	if sm.Code != 200 || !strings.Contains(sm.Header().Get("Content-Type"), "xml") {
		t.Fatal(sm.Code)
	}
	for _, loc := range []string{"https://ada.example/articles", "https://ada.example/posts", "https://ada.example/articles/in-the-map", "https://ada.example/posts/a-post-line"} {
		if !strings.Contains(body, "<loc>"+loc+"</loc>") {
			t.Errorf("sitemap lacks %s", loc)
		}
	}
	rb := r.get("GET", "/robots.txt").Body.String()
	if !strings.Contains(rb, "Disallow: /api/") || !strings.Contains(rb, "Sitemap: https://ada.example/sitemap.xml") || !strings.Contains(rb, "Disallow: /studio/") {
		t.Errorf("%s", rb)
	}
}
