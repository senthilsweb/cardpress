package api

import (
	"crypto/subtle"
	"log"
	"net"
	"net/http"
	"strings"
)

// ProtectOptions are the access rules shared by the JSON API and the MCP endpoint.
type ProtectOptions struct {
	// Token, when set, must be sent as "Authorization: Bearer <token>".
	Token string
	// LocalGuard is for a server with no token. A web page you visit can make your browser send requests to
	// http://localhost:<port>, and a hostile DNS name can be pointed at 127.0.0.1 ("DNS rebinding"). With the guard on,
	// only requests addressed to localhost (and AllowedHosts) are answered, and cross-site browser requests that
	// change things are refused.
	LocalGuard   bool
	AllowedHosts []string
	// TrustedOrigins may make cross-site requests, such as a separately hosted web app. They also get CORS headers on the API.
	TrustedOrigins []string
}

// hostOnly returns the lower-case host of a Host header, without port or brackets.
func hostOnly(h string) string {
	if host, _, err := net.SplitHostPort(h); err == nil {
		h = host
	}
	return strings.ToLower(strings.Trim(h, "[]"))
}

// hostGuard answers only for localhost names and the configured extras.
func hostGuard(allowed []string) func(http.Handler) http.Handler {
	ok := map[string]bool{"localhost": true, "127.0.0.1": true, "::1": true}
	for _, a := range allowed {
		if a = hostOnly(strings.TrimSpace(a)); a != "" {
			ok[a] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !ok[hostOnly(r.Host)] {
				writeError(w, r, http.StatusForbidden, "host_not_allowed",
					"This server only answers requests addressed to localhost. To reach it under another name, list that name in CARDPRESS_ALLOWED_HOSTS, or set CARDPRESS_API_TOKEN.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// crossOriginGuard refuses state-changing requests that a browser makes from another site (CSRF). Requests with no
// browser headers (curl, other programs, an MCP client) and same-site requests pass.
func crossOriginGuard(trusted []string) func(http.Handler) http.Handler {
	cop := http.NewCrossOriginProtection()
	for _, o := range trusted {
		if err := cop.AddTrustedOrigin(o); err != nil {
			log.Printf("ignoring trusted origin %q: %v", o, err)
		}
	}
	cop.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusForbidden, "cross_origin", "This request came from another website and was blocked. Use the CardPress app itself, or list that site's address in CARDPRESS_CORS_ORIGINS.")
	}))
	return cop.Handler
}

// bearerGuard requires the token. exempt names paths that stay open.
func bearerGuard(token string, exempt ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if token == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, p := range exempt {
				if r.URL.Path == p {
					next.ServeHTTP(w, r)
					return
				}
			}
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if got == r.Header.Get("Authorization") || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
				w.Header().Set("WWW-Authenticate", `Bearer realm="cardpress"`)
				writeError(w, r, http.StatusUnauthorized, "unauthorized", "a valid bearer token is required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// browserGuards is the host and cross-origin protection, in the order they should run.
func browserGuards(o ProtectOptions) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		h := crossOriginGuard(o.TrustedOrigins)(next)
		if o.LocalGuard {
			h = hostGuard(o.AllowedHosts)(h)
		}
		return h
	}
}

// Protect wraps a handler (such as the MCP endpoint) with the same access rules as /api/v1: the host and cross-origin
// checks first, then the bearer token.
func Protect(o ProtectOptions, next http.Handler) http.Handler {
	return browserGuards(o)(bearerGuard(o.Token)(next))
}
