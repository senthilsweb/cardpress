package secure

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestTheAppsInlineScriptsAreNamedByTheirHash(t *testing.T) {
	site := fstest.MapFS{
		"a/index.html": {Data: []byte(`<script>alert(1)</script><script src="/x.js"></script><script type="module">go()</script>`)},
		"b.html":       {Data: []byte(`<SCRIPT>alert(1)</SCRIPT>`)},
		"c.js":         {Data: []byte(`<script>no()</script>`)},
	}
	got, err := InlineScripts(site)
	if err != nil || len(got) != 2 { // alert(1) once, go() once
		t.Fatalf("%v %v", got, err)
	}
	// the well-known hash of alert(1)
	if !strings.Contains(strings.Join(got, " "), "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='") {
		t.Fatal(got)
	}
	p := AppPolicy(got)
	if strings.Contains(strings.Split(p, "style-src")[0], "unsafe") || !strings.Contains(p, "frame-ancestors 'none'") {
		t.Fatal(p)
	}
}

func TestEveryAnswerCarriesTheHeaders(t *testing.T) {
	h := Headers(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	for path, cached := range map[string]bool{"/studio/": true, "/api/v1/info": false} {
		req := httptest.NewRequest("GET", path, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		got := rec.Header()
		if got.Get("X-Frame-Options") != "DENY" || got.Get("X-Content-Type-Options") != "nosniff" || got.Get("Strict-Transport-Security") != "" {
			t.Fatalf("%s: %v", path, got)
		}
		if (got.Get("Cache-Control") != "no-store") != cached {
			t.Fatalf("%s: %q", path, got.Get("Cache-Control"))
		}
	}
	req := httptest.NewRequest("GET", "/studio/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("no HSTS over https")
	}
}
