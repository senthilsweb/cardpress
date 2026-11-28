// Package config reads flags and environment variables and checks that the chosen setup is safe to run.
package config

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config is the server configuration.
type Config struct {
	Addr            string        // listen address
	Base            string        // URL prefix the embedded web app is served under
	DBURL           string        // file:./data/cardpress.db or libsql://host
	DBToken         string        // auth token for libsql
	APIToken        string        // optional bearer token for /api/v1
	SecretKey       string        // encrypts stored social credentials (CARDPRESS_SECRET_KEY)
	MissedGrace     time.Duration // how late a scheduled post may still go out (CARDPRESS_MISSED_GRACE)
	VideoMaxBytes   int64         // the largest video a post may carry; 0 means the limit in package source (CARDPRESS_VIDEO_MAX_MB)
	MediaBrandMB    int           // each brand's media library allowance in MB (CARDPRESS_MEDIA_BRAND_MB); 0 means 200
	LinkedInVersion string        // LinkedIn-Version header (CARDPRESS_LINKEDIN_VERSION)
	LinkedInAPIBase string        // API address; only for tests and proxies (CARDPRESS_LINKEDIN_API_BASE)
	CORSOrigins     []string      // allowed browser origins for a separately hosted web app
	ServeWeb        bool          // serve the embedded web app
	MCPEnabled      bool          // serve the MCP endpoint at /mcp
	AllowedHosts    []string      // extra host names accepted when there is no token (CARDPRESS_ALLOWED_HOSTS)
	DefaultRole     string        // the role of a person who signs up (CARDPRESS_DEFAULT_ROLE): editor (default) or writer
	SignupClosed    bool          // CARDPRESS_SIGNUP=closed: only an administrator adds people after the first account
	AdminEmail      string        // CARDPRESS_ADMIN_EMAIL: if set, only this email may create the first (admin) account
	ClientIPHeader  string        // CARDPRESS_CLIENT_IP_HEADER: the header a proxy sets with the client's address
	SessionIdle     time.Duration // CARDPRESS_SESSION_IDLE: a sign-in ends after this long without use (20m)
	SessionMax      time.Duration // CARDPRESS_SESSION_MAX: and after this long in all (12h)
	PublicURL       string        // the address readers use, for the public pages (CARDPRESS_PUBLIC_URL), e.g. https://example.com
	SiteName        string        // names the public site in titles and previews (CARDPRESS_SITE_NAME); empty uses the brand
	Agent           string        // "off" (default) or "cma" (the Claude Managed Agents) (CARDPRESS_AGENT)
	AgentManifest   string        // CARDPRESS_AGENT_MANIFEST: a file, an https address or the JSON
	AgentWorkspace  string        // ANTHROPIC_WORKSPACE_ID, for a key that can act on several
	AgentBudget     int           // spend cap per conversation in US cents (CARDPRESS_AGENT_BUDGET_CENTS), default 200; 0 = none
	AgentTimeout    time.Duration // longest wait for one reply (CARDPRESS_AGENT_TIMEOUT)
	Insecure        bool          // allow a non-loopback address without a token
	ShowVersion     bool
}

const defaultDB = "file:./data/cardpress.db"

// Load parses args, using getenv for defaults.
func Load(args []string, getenv func(string) string) (Config, error) {
	env := func(k, def string) string {
		if v := strings.TrimSpace(getenv(k)); v != "" {
			return v
		}
		return def
	}
	flagBool := func(k string, def bool) (bool, error) {
		v := strings.TrimSpace(getenv(k))
		if v == "" {
			return def, nil
		}
		b, err := strconv.ParseBool(v)
		if err != nil {
			return false, fmt.Errorf("%s must be true or false, got %q", k, v)
		}
		return b, nil
	}

	defAddr := env("ADDR", "")
	if defAddr == "" {
		defAddr = "127.0.0.1:" + env("PORT", "8080")
	}
	serveWeb, err := flagBool("CARDPRESS_SERVE_WEB", true)
	if err != nil {
		return Config{}, err
	}
	mcp, err := flagBool("CARDPRESS_MCP", true)
	if err != nil {
		return Config{}, err
	}
	insecure, err := flagBool("CARDPRESS_INSECURE", false)
	if err != nil {
		return Config{}, err
	}

	var c Config
	fs := flag.NewFlagSet("cardpress", flag.ContinueOnError)
	fs.StringVar(&c.Addr, "addr", defAddr, "listen address (default is loopback only)")
	fs.StringVar(&c.Base, "base", env("BASE_PATH", "/"), "URL prefix the app is served under (must match the Astro build)")
	fs.StringVar(&c.DBURL, "db", env("CARDPRESS_DB_URL", defaultDB), "database URL: file:./data/cardpress.db or libsql://...")
	fs.BoolVar(&c.ServeWeb, "serve-web", serveWeb, "serve the embedded web app")
	fs.BoolVar(&c.MCPEnabled, "mcp", mcp, "serve the MCP endpoint at /mcp for outside agents")
	fs.BoolVar(&c.ShowVersion, "version", false, "print version and exit")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	c.Insecure = insecure
	c.DBToken = env("CARDPRESS_DB_TOKEN", "")
	c.APIToken = env("CARDPRESS_API_TOKEN", "")
	c.SecretKey = env("CARDPRESS_SECRET_KEY", "")
	c.LinkedInVersion = env("CARDPRESS_LINKEDIN_VERSION", "")
	c.LinkedInAPIBase = env("CARDPRESS_LINKEDIN_API_BASE", "")
	c.MissedGrace = 15 * time.Minute
	if v := env("CARDPRESS_MISSED_GRACE", ""); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d < time.Minute || d > 24*time.Hour {
			return Config{}, fmt.Errorf("CARDPRESS_MISSED_GRACE must be a duration between 1m and 24h, got %q", v)
		}
		c.MissedGrace = d
	}
	if v := env("CARDPRESS_VIDEO_MAX_MB", ""); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			return Config{}, fmt.Errorf("CARDPRESS_VIDEO_MAX_MB must be a whole number from 1 to 500, got %q", v)
		}
		c.VideoMaxBytes = int64(n) << 20
	}
	if v := env("CARDPRESS_MEDIA_BRAND_MB", ""); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100_000 {
			return Config{}, fmt.Errorf("CARDPRESS_MEDIA_BRAND_MB must be a whole number from 1 to 100000, got %q", v)
		}
		c.MediaBrandMB = n
	}
	c.Agent = strings.ToLower(env("CARDPRESS_AGENT", "off"))
	if c.Agent == "mock" { // the demo assistant is gone
		c.Agent = "off"
	}
	c.AgentManifest = env("CARDPRESS_AGENT_MANIFEST", "")
	c.AgentWorkspace = env("ANTHROPIC_WORKSPACE_ID", "")
	c.AgentBudget = 200
	if v := env("CARDPRESS_AGENT_BUDGET_CENTS", ""); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 1<<24 {
			return Config{}, fmt.Errorf("CARDPRESS_AGENT_BUDGET_CENTS must be a whole number of at least 0, got %q", v)
		}
		c.AgentBudget = n
	}
	c.AgentTimeout = 12 * time.Minute
	if v := env("CARDPRESS_AGENT_TIMEOUT", ""); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d < 10*time.Second || d > 30*time.Minute {
			return Config{}, fmt.Errorf("CARDPRESS_AGENT_TIMEOUT must be a duration between 10s and 30m, got %q", v)
		}
		c.AgentTimeout = d
	}
	for _, t := range []struct {
		name     string
		into     *time.Duration
		def      time.Duration
		min, max time.Duration
	}{
		{"CARDPRESS_SESSION_IDLE", &c.SessionIdle, 20 * time.Minute, 5 * time.Minute, 24 * time.Hour},
		{"CARDPRESS_SESSION_MAX", &c.SessionMax, 12 * time.Hour, 15 * time.Minute, 30 * 24 * time.Hour},
	} {
		*t.into = t.def
		if v := env(t.name, ""); v != "" {
			d, err := time.ParseDuration(v)
			if err != nil || d < t.min || d > t.max {
				return Config{}, fmt.Errorf("%s must be a duration between %s and %s, got %q", t.name, t.min, t.max, v)
			}
			*t.into = d
		}
	}
	if c.SessionMax < c.SessionIdle {
		return Config{}, errors.New("CARDPRESS_SESSION_MAX must not be shorter than CARDPRESS_SESSION_IDLE")
	}
	for _, h := range strings.Split(env("CARDPRESS_ALLOWED_HOSTS", ""), ",") {
		if h = strings.TrimSpace(h); h != "" {
			c.AllowedHosts = append(c.AllowedHosts, h)
		}
	}
	c.DefaultRole = strings.ToLower(env("CARDPRESS_DEFAULT_ROLE", "editor"))
	c.SignupClosed = strings.EqualFold(env("CARDPRESS_SIGNUP", "open"), "closed")
	c.AdminEmail = strings.ToLower(env("CARDPRESS_ADMIN_EMAIL", ""))
	c.ClientIPHeader = env("CARDPRESS_CLIENT_IP_HEADER", "")
	c.PublicURL = strings.TrimRight(env("CARDPRESS_PUBLIC_URL", ""), "/")
	c.SiteName = env("CARDPRESS_SITE_NAME", "")
	for _, o := range strings.Split(env("CARDPRESS_CORS_ORIGINS", ""), ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			c.CORSOrigins = append(c.CORSOrigins, o)
		}
	}
	return c, nil
}

// Validate refuses setups that would expose the API without any protection.
func (c Config) Validate() error {
	if c.APIToken == "" && !c.Insecure && !IsLoopback(c.Addr) {
		return fmt.Errorf("refusing to listen on %q without a token: the API can read settings and publish. "+
			"Set CARDPRESS_API_TOKEN to a long random value, bind to 127.0.0.1, or set CARDPRESS_INSECURE=1 if something else protects it", c.Addr)
	}
	if c.LinkedInAPIBase != "" {
		u, err := url.Parse(c.LinkedInAPIBase)
		if err != nil || u.Host == "" || (u.Scheme != "https" && !(u.Scheme == "http" && IsLoopback(net.JoinHostPort(u.Hostname(), "0")))) {
			return errors.New("CARDPRESS_LINKEDIN_API_BASE must be an https address (plain http only for localhost): your access token is sent there")
		}
	}
	if c.DefaultRole != "editor" && c.DefaultRole != "writer" {
		return fmt.Errorf("CARDPRESS_DEFAULT_ROLE must be editor or writer, got %q", c.DefaultRole)
	}
	if c.PublicURL != "" {
		u, err := url.Parse(c.PublicURL)
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return errors.New("CARDPRESS_PUBLIC_URL must be an address with no path, such as https://example.com")
		}
	}
	if c.SecretKey != "" && len(c.SecretKey) < 32 {
		return errors.New("CARDPRESS_SECRET_KEY is too short: use at least 32 characters (for example `openssl rand -hex 32`)")
	}
	if c.APIToken != "" && len(c.APIToken) < 16 {
		return errors.New("CARDPRESS_API_TOKEN is too short: use at least 16 characters")
	}
	switch c.Agent {
	case "off":
	case "cma":
		if c.AgentManifest == "" {
			return errors.New("CARDPRESS_AGENT=cma needs CARDPRESS_AGENT_MANIFEST: the agent manifest as a file, an https address or the JSON")
		}
	default:
		return fmt.Errorf("CARDPRESS_AGENT must be off or cma, got %q", c.Agent)
	}
	return nil
}

// IsLoopback reports whether addr only accepts connections from this machine.
// An empty host (":8080") listens on every interface, so it is not loopback.
func IsLoopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// LocalDBPath is the database file when DBURL is a local file, and "" for a hosted database.
func (c Config) LocalDBPath() string {
	if !strings.HasPrefix(c.DBURL, "file:") {
		return ""
	}
	p := strings.TrimPrefix(c.DBURL, "file:")
	if i := strings.IndexByte(p, '?'); i >= 0 {
		p = p[:i]
	}
	return p
}

// LocalMode reports a single-user setup: a database file on this machine and an address only this machine can reach.
// Only then may the server create its own encryption key file.
func (c Config) LocalMode() bool { return c.LocalDBPath() != "" && IsLoopback(c.Addr) }
