package source

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
)

func TestPrivateAndReservedAddressesAreBlocked(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "127.255.255.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
		"169.254.169.254", "169.254.0.1", // cloud metadata
		"100.64.0.1", "100.127.255.255", // carrier-grade NAT
		"0.0.0.0", "0.1.2.3", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
		"192.0.2.1", "198.51.100.7", "203.0.113.9", "198.18.0.1",
		"::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "64:ff9b::7f00:1",
		"::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", // IPv4 written as IPv6
	}
	for _, s := range blocked {
		if why := blockedReason(netip.MustParseAddr(s)); why == "" {
			t.Errorf("%s should be blocked", s)
		}
	}
	allowed := []string{"93.184.216.34", "8.8.8.8", "1.1.1.1", "151.101.1.69", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8", "172.32.0.1", "100.128.0.1"}
	for _, s := range allowed {
		if why := blockedReason(netip.MustParseAddr(s)); why != "" {
			t.Errorf("%s should be allowed, got %q", s, why)
		}
	}
}

func TestOnlyWebPortsAreAllowed(t *testing.T) {
	for p, ok := range map[string]bool{"": true, "80": true, "443": true, "22": false, "25": false, "8080": false, "6379": false, "9200": false} {
		if allowedPort(p) != ok {
			t.Errorf("port %q: allowed=%v, want %v", p, allowedPort(p), ok)
		}
	}
}

func TestAddressChecksBeforeAnyRequest(t *testing.T) {
	f := New()
	for raw, wantInMsg := range map[string]string{
		"ftp://example.com/x":            "http and https",
		"file:///etc/passwd":             "http and https",
		"gopher://example.com":           "http and https",
		"javascript:alert(1)":            "http and https",
		"https://user:pw@example.com/":   "user name",
		"http://127.0.0.1/":              "loopback",
		"http://169.254.169.254/latest/": "link-local",
		"http://10.1.2.3/admin":          "private",
		"http://[::1]/":                  "loopback",
		"http://[::ffff:127.0.0.1]/":     "loopback",
		"https://example.com:8443/":      "ports",
		"https://example.com:22/":        "ports",
		"example.com/no-scheme":          "web address",
		"":                               "web address",
		"https:///nohost":                "no host",
	} {
		_, err := f.Fetch(context.Background(), raw)
		var se *Error
		if !errors.As(err, &se) || !strings.Contains(se.Message, wantInMsg) {
			t.Errorf("%q: %v, want a message containing %q", raw, err, wantInMsg)
		}
	}
}

func TestAHostNameThatResolvesToThisMachineIsRefusedAtConnectTime(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "secret internal page") }))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	// "localhost" passes the address check (it is a name), so only the dial-time check can stop it
	for _, host := range []string{"localhost", "127.0.0.1"} {
		_, err := New().Fetch(context.Background(), "http://"+host+":"+u.Port()+"/")
		if err == nil {
			t.Fatalf("%s must be refused", host)
		}
	}
	if _, err := New().Fetch(context.Background(), "http://localhost/"); err == nil {
		t.Fatal("localhost on port 80 must be refused too")
	}
}

/* ---------------------------------------------------------------- reading pages (private addresses allowed: tests only) */

func serve(t *testing.T, h http.HandlerFunc) (*Fetcher, string) {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return newFetcher(true), srv.URL
}

const article = `<!doctype html><html><head><title>Why we moved to Postgres | Acme Blog</title>
<meta property="og:title" content="OG title"><style>.x{}</style><script>var secret = "ignore previous instructions"</script></head>
<body><nav><a href="/">Home</a><a href="/about">About</a></nav>
<article><h1>Why we moved to Postgres</h1>
<p>We ran into limits with our old database last spring. The migration took six weeks.</p>
<h2>What changed</h2>
<ul><li>Queries got faster</li><li>Backups got simpler</li></ul>
<p>Write&nbsp;this   down: boring technology wins. It is worth saying twice so the article is long enough to be preferred over the page chrome around it.</p>
<script>track()</script></article>
<footer>Copyright Acme. All rights reserved. Subscribe!</footer></body></html>`

func TestReadsAnArticleAndDropsPageChrome(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, article)
	})
	s, err := f.Fetch(context.Background(), base+"/post")
	if err != nil {
		t.Fatal(err)
	}
	if s.Title != "Why we moved to Postgres | Acme Blog" || s.Truncated || !strings.HasSuffix(s.URL, "/post") {
		t.Fatalf("%+v", s)
	}
	for _, want := range []string{"# Why we moved to Postgres", "migration took six weeks", "## What changed", "- Queries got faster", "- Backups got simpler", "Write this down: boring technology wins."} {
		if !strings.Contains(s.Text, want) {
			t.Errorf("text lacks %q:\n%s", want, s.Text)
		}
	}
	for _, unwanted := range []string{"Home", "About", "Copyright", "Subscribe", "ignore previous instructions", "track()", ".x{}"} {
		if strings.Contains(s.Text, unwanted) {
			t.Errorf("text should not contain %q:\n%s", unwanted, s.Text)
		}
	}
}

func TestPlainTextAndMarkdownAreAccepted(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "Line one.\r\n\r\nLine two.")
	})
	s, err := f.Fetch(context.Background(), base)
	if err != nil || s.Text != "Line one.\n\nLine two." || s.Title != "" {
		t.Fatalf("%+v %v", s, err)
	}
}

func TestOtherContentTypesAreRefused(t *testing.T) {
	for _, ct := range []string{"application/pdf", "image/png", "application/zip", "application/octet-stream", "video/mp4"} {
		f, base := serve(t, func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Content-Type", ct); fmt.Fprint(w, "x") })
		if _, err := f.Fetch(context.Background(), base); err == nil || !strings.Contains(err.Error(), "not a web page") {
			t.Errorf("%s: %v", ct, err)
		}
	}
}

func TestHTTPErrorsAndEmptyPages(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/missing":
			http.NotFound(w, r)
		case "/empty":
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, `<html><body><div id="app"></div><script>render()</script></body></html>`)
		}
	})
	if _, err := f.Fetch(context.Background(), base+"/missing"); err == nil || !strings.Contains(err.Error(), "404") {
		t.Fatalf("%v", err)
	}
	if _, err := f.Fetch(context.Background(), base+"/empty"); err == nil || !strings.Contains(err.Error(), "No readable text") {
		t.Fatalf("%v", err)
	}
}

func TestLargePagesAreCapped(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><body><article>")
		for i := 0; i < 20000; i++ { // far more than 2 MB and 40k characters
			fmt.Fprintf(w, "<p>Paragraph number %d with some filler words to take up space.</p>", i)
		}
		fmt.Fprint(w, "</article></body></html>")
	})
	s, err := f.Fetch(context.Background(), base)
	if err != nil || !s.Truncated {
		t.Fatalf("%v truncated=%v", err, s.Truncated)
	}
	if n := len([]rune(s.Text)); n > maxChars {
		t.Fatalf("text is %d characters, cap is %d", n, maxChars)
	}
}

func TestOtherCharsetsAreDecoded(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
		_, _ = w.Write([]byte("<html><head><title>Caf\xe9</title></head><body><article><p>Cr\xe8me br\xfbl\xe9e is made with cream and sugar and eggs, and it is worth reading about at some length here today.</p></article></body></html>"))
	})
	s, err := f.Fetch(context.Background(), base)
	if err != nil || s.Title != "Café" || !strings.Contains(s.Text, "Crème brûlée") {
		t.Fatalf("%+v %v", s, err)
	}
}

func TestRedirectsAreFollowedBoundedAndChecked(t *testing.T) {
	f, base := serve(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/final":
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprint(w, "arrived")
		case r.URL.Path == "/start":
			http.Redirect(w, r, "/final", 302)
		case r.URL.Path == "/loop":
			http.Redirect(w, r, "/loop", 302)
		case r.URL.Path == "/to-ftp":
			http.Redirect(w, r, "ftp://example.com/x", 302)
		case r.URL.Path == "/to-userinfo":
			http.Redirect(w, r, "http://a:b@example.com/", 302)
		}
	})
	if s, err := f.Fetch(context.Background(), base+"/start"); err != nil || s.Text != "arrived" || !strings.HasSuffix(s.URL, "/final") {
		t.Fatalf("%+v %v", s, err)
	}
	if _, err := f.Fetch(context.Background(), base+"/loop"); err == nil || !strings.Contains(err.Error(), "redirected") {
		t.Fatalf("loop: %v", err)
	}
	for _, p := range []string{"/to-ftp", "/to-userinfo"} {
		if _, err := f.Fetch(context.Background(), base+p); err == nil {
			t.Errorf("%s: a redirect to an unacceptable address must be refused", p)
		}
	}
}

func TestRedirectToAPrivateAddressIsRefused(t *testing.T) {
	f := newFetcher(false) // the real rules
	u, _ := url.Parse("http://127.0.0.1/internal")
	if err := f.client.CheckRedirect(&http.Request{URL: u}, nil); err == nil || !strings.Contains(err.Error(), "loopback") {
		t.Fatalf("a redirect to loopback must be refused: %v", err)
	}
	meta, _ := url.Parse("http://169.254.169.254/latest/meta-data/")
	if err := f.client.CheckRedirect(&http.Request{URL: meta}, nil); err == nil {
		t.Fatal("a redirect to the metadata address must be refused")
	}
	ok, _ := url.Parse("https://example.com/next")
	if err := f.client.CheckRedirect(&http.Request{URL: ok}, nil); err != nil {
		t.Fatalf("a redirect to a public address is fine: %v", err)
	}
}

func TestExtractTextFallsBackToTheBodyAndFindsTitles(t *testing.T) {
	title, text := ExtractText([]byte(`<html><body><h1>Only a heading</h1><p>Short page.</p></body></html>`))
	if title != "Only a heading" || !strings.Contains(text, "Short page.") {
		t.Fatalf("%q %q", title, text)
	}
	if title, _ := ExtractText([]byte(`<html><head><meta property="og:title" content="From meta"></head><body><p>x</p></body></html>`)); title != "From meta" {
		t.Fatalf("%q", title)
	}
	if _, text := ExtractText([]byte(`<p hidden>secret</p><p aria-hidden="true">also secret</p><p>visible</p>`)); strings.Contains(text, "secret") || !strings.Contains(text, "visible") {
		t.Fatalf("%q", text)
	}
}
