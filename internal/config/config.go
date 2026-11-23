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
	LinkedInVersion string        // LinkedIn-Version header (CARDPRESS_LINKEDIN_VERSION)
	LinkedInAPIBase string        // API address; only for tests and proxies (CARDPRESS_LINKEDIN_API_BASE)
	CORSOrigins     []string      // allowed browser origins for a separately hosted web app
	ServeWeb        bool          // serve the embedded web app
	MCPEnabled      bool          // serve the MCP endpoint at /mcp
	AllowedHosts    []string      // extra host names accepted when there is no token (CARDPRESS_ALLOWED_HOSTS)
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
	for _, h := range strings.Split(env("CARDPRESS_ALLOWED_HOSTS", ""), ",") {
		if h = strings.TrimSpace(h); h != "" {
			c.AllowedHosts = append(c.AllowedHosts, h)
		}
	}
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
	if c.SecretKey != "" && len(c.SecretKey) < 32 {
		return errors.New("CARDPRESS_SECRET_KEY is too short: use at least 32 characters (for example `openssl rand -hex 32`)")
	}
	if c.APIToken != "" && len(c.APIToken) < 16 {
		return errors.New("CARDPRESS_API_TOKEN is too short: use at least 16 characters")
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
