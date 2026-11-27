package pages

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/service"
)

// Reader is what the public pages need to read.
type Reader interface {
	Get(ctx context.Context, kind, slug string) (service.PublicPage, error)
	Cover(ctx context.Context, kind, slug string) ([]byte, string, error)
	List(ctx context.Context, kind string, page, size int) ([]service.PublicPage, int, error)
	Entries(ctx context.Context) ([]service.Entry, error)
}

// Options configure the public pages.
type Options struct {
	Reader Reader
	// PublicURL is the address readers use (https://example.com). Without it the request's own host is used, which is right
	// for a trial and wrong behind a proxy that rewrites it.
	PublicURL string
	// SiteName names the site in titles and previews; empty uses the brand of the item.
	SiteName string
	Version  string
	Now      func() time.Time
}

type site struct {
	Options
	page, index *template.Template
}

const pageSize = 20

// kinds maps the first path segment to an item kind.
var kinds = map[string]string{"articles": service.KindArticle, "posts": service.KindPost}

var hostRe = regexp.MustCompile(`^[A-Za-z0-9.\-]+(:[0-9]{1,5})?$|^\[[0-9A-Fa-f:.]+\](:[0-9]{1,5})?$`)

// New returns the handler for /articles, /posts, /sitemap.xml and /robots.txt.
func New(o Options) http.Handler {
	if o.Now == nil {
		o.Now = time.Now
	}
	o.PublicURL = strings.TrimRight(o.PublicURL, "/")
	s := &site{Options: o}
	funcs := template.FuncMap{
		"date": func(iso string) string {
			t, err := time.Parse(time.RFC3339, iso)
			if err != nil {
				return iso
			}
			return t.Format("2 Jan 2006")
		},
		"iso": func(iso string) string { return iso },
		"add": func(a, b int) int { return a + b },
	}
	s.page = template.Must(template.New("page").Funcs(funcs).Parse(pageTmpl))
	s.index = template.Must(template.New("index").Funcs(funcs).Parse(indexTmpl))
	mux := http.NewServeMux()
	mux.HandleFunc("/articles", s.serve)
	mux.HandleFunc("/articles/", s.serve)
	mux.HandleFunc("/posts", s.serve)
	mux.HandleFunc("/posts/", s.serve)
	mux.HandleFunc("/sitemap.xml", s.sitemap)
	mux.HandleFunc("/robots.txt", s.robots)
	return mux
}

// abs is an absolute address on this site.
func (s *site) abs(r *http.Request, path string) string {
	if s.PublicURL != "" {
		return s.PublicURL + path
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Host
	if !hostRe.MatchString(host) {
		host = "localhost"
	}
	return scheme + "://" + host + path
}

func secure(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
}

// fresh answers 304 when the reader already has this version.
func fresh(w http.ResponseWriter, r *http.Request, parts ...string) bool {
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	tag := `"` + hex.EncodeToString(sum[:8]) + `"`
	w.Header().Set("ETag", tag)
	if r.Header.Get("If-None-Match") == tag {
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	return false
}

func (s *site) notFound(w http.ResponseWriter, r *http.Request) {
	secure(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNotFound)
	_, _ = fmt.Fprint(w, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Not found</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Not found</h1><p>There is nothing at this address.</p>`)
}

// serve routes /articles[/slug[/cover.png|/img/n]] and the same for /posts.
func (s *site) serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	kind, ok := kinds[parts[0]]
	if !ok {
		s.notFound(w, r)
		return
	}
	switch {
	case len(parts) == 1:
		s.list(w, r, parts[0], kind)
	case len(parts) == 2:
		s.article(w, r, parts[0], kind, parts[1])
	case len(parts) == 3 && parts[2] == "cover.png":
		s.cover(w, r, kind, parts[1])
	case len(parts) == 4 && parts[2] == "img":
		s.picture(w, r, kind, parts[1], parts[3])
	default:
		s.notFound(w, r)
	}
}

type pageData struct {
	Title, Description, Site, Canonical, Section, Kind string
	Body                                               template.HTML
	Cover                                              string
	CoverW, CoverH                                     int
	CoverAlt                                           string
	Published, Modified                                string
	Tags                                               []string
	Author, Handle, Website                            string
	JSONLD                                             template.JS
	Slug                                               string
	Items                                              []itemData
	Page, Pages, Total                                 int
	Prev, Next                                         string
	HasCover                                           bool
	Robots                                             string
}

type itemData struct{ Title, Description, URL, Cover, Published string }

func (s *site) siteName(b service.Brand) string {
	for _, n := range []string{s.SiteName, b.DisplayName, b.Name} {
		if n = strings.TrimSpace(n); n != "" {
			return n
		}
	}
	return "CardPress"
}

func (s *site) article(w http.ResponseWriter, r *http.Request, seg, kind, slug string) {
	p, err := s.Reader.Get(r.Context(), kind, slug)
	if errors.Is(err, service.ErrNotFound) {
		s.notFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "something went wrong", http.StatusInternalServerError)
		return
	}
	secure(w)
	w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=60")
	if fresh(w, r, "page", p.ID, p.Slug, p.PageAt, p.UpdatedAt, s.PublicURL, r.Host) {
		return
	}
	base := "/" + seg + "/" + url.PathEscape(p.Slug)
	body, _ := RenderDoc(p.Doc, p.Title, func(n int) string { return base + "/img/" + strconv.Itoa(n) })
	d := pageData{
		Title: p.Title, Description: p.Description, Site: s.siteName(p.Brand), Canonical: s.abs(r, base), Section: seg, Kind: kind,
		Body: body, Slug: p.Slug, Published: p.PageAt, Modified: p.UpdatedAt, Tags: p.Hashtags,
		Author: firstNonEmpty(p.Brand.DisplayName, p.Brand.Name), Handle: p.Brand.Handle, Website: p.Brand.Website, Robots: "index,follow,max-image-preview:large",
	}
	if p.HasCover {
		d.HasCover = true
		d.Cover = s.abs(r, base+"/cover.png") + "?v=" + url.QueryEscape(p.UpdatedAt)
		d.CoverW, d.CoverH = p.CoverW, p.CoverH
		d.CoverAlt = firstNonEmpty(p.AltText, p.Title)
	}
	d.JSONLD = s.jsonLD(d)
	s.render(w, r, s.page, d)
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s = strings.TrimSpace(s); s != "" {
			return s
		}
	}
	return ""
}

// jsonLD is the structured data a search engine reads: an Article, or a SocialMediaPosting for a post.
func (s *site) jsonLD(d pageData) template.JS {
	kind := "Article"
	if d.Kind == service.KindPost {
		kind = "SocialMediaPosting"
	}
	doc := map[string]any{
		"@context": "https://schema.org", "@type": kind, "headline": d.Title, "description": d.Description,
		"mainEntityOfPage": d.Canonical, "url": d.Canonical, "datePublished": d.Published, "dateModified": d.Modified,
	}
	if d.Author != "" {
		author := map[string]any{"@type": "Person", "name": d.Author}
		if d.Website != "" {
			author["url"] = d.Website
		}
		doc["author"] = author
	}
	if d.HasCover {
		doc["image"] = d.Cover
	}
	if len(d.Tags) > 0 {
		doc["keywords"] = strings.Join(d.Tags, ", ")
	}
	b, _ := json.Marshal(doc) // json.Marshal escapes <, > and &, so this cannot close the script element
	return template.JS(b)     //nolint:gosec // see above
}

func (s *site) render(w http.ResponseWriter, r *http.Request, t *template.Template, d pageData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if r.Method == http.MethodHead {
		return
	}
	if err := t.Execute(w, d); err != nil {
		// the status line is already sent; nothing more can be done for this reader
		return
	}
}

func (s *site) list(w http.ResponseWriter, r *http.Request, seg, kind string) {
	pageNo, _ := strconv.Atoi(r.URL.Query().Get("page"))
	items, total, err := s.Reader.List(r.Context(), kind, pageNo, pageSize)
	if err != nil {
		http.Error(w, "something went wrong", http.StatusInternalServerError)
		return
	}
	pages := max(1, (total+pageSize-1)/pageSize)
	pageNo = min(max(pageNo, 1), pages)
	secure(w)
	w.Header().Set("Cache-Control", "public, max-age=120")
	stamp := ""
	if len(items) > 0 {
		stamp = items[0].UpdatedAt
	}
	if fresh(w, r, "list", kind, strconv.Itoa(pageNo), strconv.Itoa(total), stamp, s.PublicURL, r.Host) {
		return
	}
	title := map[string]string{"articles": "Articles", "posts": "Posts"}[seg]
	d := pageData{Title: title, Section: seg, Kind: kind, Page: pageNo, Pages: pages, Total: total, Robots: "index,follow"}
	for _, it := range items {
		u := "/" + seg + "/" + url.PathEscape(it.Slug)
		x := itemData{Title: it.Title, Description: it.Description, URL: u, Published: it.PageAt}
		if it.HasCover {
			x.Cover = u + "/cover.png?v=" + url.QueryEscape(it.UpdatedAt)
		}
		d.Items = append(d.Items, x)
	}
	if len(items) > 0 {
		d.Site = s.siteName(items[0].Brand)
	} else {
		d.Site = s.siteName(service.Brand{})
	}
	d.Description = title + " by " + d.Site
	q := func(n int) string {
		if n <= 1 {
			return "/" + seg
		}
		return "/" + seg + "?page=" + strconv.Itoa(n)
	}
	d.Canonical = s.abs(r, q(pageNo))
	if pageNo > 1 {
		d.Prev = q(pageNo - 1)
	}
	if pageNo < pages {
		d.Next = q(pageNo + 1)
	}
	s.render(w, r, s.index, d)
}

func (s *site) cover(w http.ResponseWriter, r *http.Request, kind, slug string) {
	img, updated, err := s.Reader.Cover(r.Context(), kind, slug)
	if err != nil {
		s.notFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if fresh(w, r, "cover", kind, slug, updated) {
		return
	}
	if r.Method != http.MethodHead {
		_, _ = w.Write(img)
	}
}

func (s *site) picture(w http.ResponseWriter, r *http.Request, kind, slug, n string) {
	i, err := strconv.Atoi(n)
	p, gerr := s.Reader.Get(r.Context(), kind, slug)
	if err != nil || gerr != nil {
		s.notFound(w, r)
		return
	}
	b, mime, ok := Picture(p.Doc, i)
	if !ok {
		s.notFound(w, r)
		return
	}
	h := w.Header()
	h.Set("Content-Type", mime)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox") // a picture is only ever a picture
	h.Set("Cache-Control", "public, max-age=86400")
	if fresh(w, r, "img", p.ID, p.UpdatedAt, n) {
		return
	}
	if r.Method != http.MethodHead {
		_, _ = w.Write(b)
	}
}

type urlset struct {
	XMLName xml.Name   `xml:"urlset"`
	NS      string     `xml:"xmlns,attr"`
	URLs    []sitemapU `xml:"url"`
}
type sitemapU struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

func (s *site) sitemap(w http.ResponseWriter, r *http.Request) {
	entries, err := s.Reader.Entries(r.Context())
	if err != nil {
		http.Error(w, "something went wrong", http.StatusInternalServerError)
		return
	}
	set := urlset{NS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: []sitemapU{{Loc: s.abs(r, "/articles")}, {Loc: s.abs(r, "/posts")}}}
	for _, e := range entries {
		seg := map[string]string{service.KindArticle: "articles", service.KindPost: "posts"}[e.Kind]
		last := e.UpdatedAt
		if len(last) >= 10 {
			last = last[:10]
		}
		set.URLs = append(set.URLs, sitemapU{Loc: s.abs(r, "/"+seg+"/"+url.PathEscape(e.Slug)), LastMod: last})
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write([]byte(xml.Header))
	_ = xml.NewEncoder(w).Encode(set)
}

func (s *site) robots(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = fmt.Fprintf(w, "User-agent: *\nAllow: /articles\nAllow: /posts\nDisallow: /api/\nDisallow: /mcp\nDisallow: /studio/\nDisallow: /library/\nDisallow: /dashboard/\nDisallow: /media/\n\nSitemap: %s\n", s.abs(r, "/sitemap.xml"))
}
