// Package secure adds the response headers that tell a browser what a page of the app may and may not do.
package secure

import (
	"crypto/sha256"
	"encoding/base64"
	"io/fs"
	"net/http"
	"regexp"
	"slices"
	"strings"
)

var (
	scriptTag = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script>`)
	hasSrc    = regexp.MustCompile(`(?i)(^|\s)src\s*=`)
)

// InlineScripts returns the policy source ('sha256-...') of every script written into a page of site. The pages are
// built once and embedded, so these are the only inline scripts that may run.
func InlineScripts(site fs.FS) ([]string, error) {
	var out []string
	err := fs.WalkDir(site, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".html") {
			return err
		}
		b, err := fs.ReadFile(site, path)
		if err != nil {
			return err
		}
		for _, m := range scriptTag.FindAllSubmatch(b, -1) {
			if hasSrc.Match(m[1]) {
				continue
			}
			sum := sha256.Sum256(m[2])
			out = append(out, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
		}
		return nil
	})
	slices.Sort(out)
	return slices.Compact(out), err
}

// AppPolicy is the content security policy of the app's pages: its own scripts and no others; styles and fonts also
// from Google Fonts; pictures and videos from the addresses a person gives; never inside another site's frame.
func AppPolicy(scripts []string) string {
	return strings.Join([]string{
		"default-src 'self'",
		"script-src " + strings.Join(append([]string{"'self'"}, scripts...), " "),
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' data: https://fonts.gstatic.com",
		"img-src 'self' data: blob: https:",
		"media-src 'self' data: blob: https:",
		"connect-src 'self' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com",
		"frame-src 'self' blob:",
		"worker-src 'self' blob:",
		"object-src 'self' blob:", // the browser's own viewer of a PDF preview
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	}, "; ")
}

// Headers sets what every answer carries. A handler that needs something stricter sets its own afterwards.
func Headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/mcp" {
			h.Set("Cache-Control", "no-store")
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
		next.ServeHTTP(w, r)
	})
}
