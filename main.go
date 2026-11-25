// CardPress – a single binary that serves the built Astro app.
//
//	go build -o cardpress . && ./cardpress
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/senthilsweb/cardpress/internal/agent"
	"github.com/senthilsweb/cardpress/internal/api"
	"github.com/senthilsweb/cardpress/internal/cma"
	"github.com/senthilsweb/cardpress/internal/config"
	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/mcpserver"
	"github.com/senthilsweb/cardpress/internal/pages"
	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/source"
	"github.com/senthilsweb/cardpress/internal/store"
)

//go:embed all:web/dist
var dist embed.FS

var version = "dev" // set with -ldflags "-X main.version=v0.1.0"

func main() {
	// `cardpress mcp` speaks the Model Context Protocol on stdin/stdout, for an agent running on this machine
	if len(os.Args) > 1 && os.Args[1] == "mcp" {
		runMCP(os.Args[2:])
		return
	}
	// `cardpress user reset-password <email>` sets a new random password for someone who is locked out
	if len(os.Args) > 1 && os.Args[1] == "user" {
		os.Exit(runUser(os.Args[2:]))
	}
	// `cardpress healthcheck` is for the container health check: the image has no shell or curl
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(runHealthcheck())
	}
	// `cardpress agent-setup` creates the Claude Managed Agent once; the user runs it on purpose
	if len(os.Args) > 1 && os.Args[1] == "agent-setup" {
		runAgentSetup(os.Args[2:])
		return
	}
	cfg, err := config.Load(os.Args[1:], os.Getenv)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		log.Fatal(err)
	}
	if cfg.ShowVersion {
		fmt.Println(version)
		return
	}
	if err := cfg.Validate(); err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DBURL, cfg.DBToken)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		log.Fatal(err)
	}

	box, err := openSecretBox(cfg)
	if err != nil {
		log.Fatal(err)
	}
	if box == nil {
		log.Printf("credentials cannot be stored: set CARDPRESS_SECRET_KEY (at least 32 characters) to enable the social settings")
	}

	prefix := "/" + strings.Trim(cfg.Base, "/")
	if prefix != "/" {
		prefix += "/"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok " + version))
	})
	settings := service.NewSettings(db.DB, box, os.Getenv)
	publisher := service.NewPublisher(db.DB, settings, linkedin.New(cfg.LinkedInAPIBase, cfg.LinkedInVersion), cfg.MissedGrace)
	videos := source.NewVideos(cfg.VideoMaxBytes)
	publisher.Videos = videos
	schedulerDone := make(chan struct{})
	go func() { defer close(schedulerDone); publisher.Run(ctx, 20*time.Second) }()
	studio := service.New(db.DB)
	studio.Videos = videos
	fetcher := source.New()
	chatAgent, err := newAgent(cfg)
	if err != nil {
		log.Fatal(err)
	}
	chat := service.NewChat(db.DB, chatAgent, fetcher)
	accounts := service.NewAccounts(db.DB, service.AccountsOptions{DefaultRole: cfg.DefaultRole, SignupClosed: cfg.SignupClosed, AdminEmail: cfg.AdminEmail})
	opts := api.Options{
		Accounts: accounts, Studio: studio, Settings: settings, Publishing: publisher, Library: service.NewLibrary(db.DB), Chat: chat, Token: cfg.APIToken, CORSOrigins: cfg.CORSOrigins,
		LocalGuard: cfg.APIToken == "", AllowedHosts: cfg.AllowedHosts, Version: version, DBDriver: db.Driver,
	}
	if cfg.MCPEnabled {
		audit := mcpserver.NewAuditor(db.DB)
		opts.Audit = audit
		mcpSrv := mcpserver.New(mcpserver.Deps{Profiles: studio, Drafts: studio, Proposals: chat, Jobs: publisher, Access: studio, Fetcher: fetcher, Audit: audit, Transport: "http", Version: version})
		// the same access rules as the JSON API: token, localhost-only host names, and no cross-site browser requests
		mcpHandler := api.Protect(api.ProtectOptions{Token: cfg.APIToken, LocalGuard: cfg.APIToken == "", AllowedHosts: cfg.AllowedHosts, TrustedOrigins: cfg.CORSOrigins}, mcpserver.HTTPHandler(mcpSrv))
		// MCP acts as the system, outside any one person's workspace. Once anyone has an account it needs the token, so a
		// process on the same machine cannot use it to reach everyone's work without one.
		// An API key (cpk_...) makes the call act as the key's person, within its scope, so it reaches only that person's
		// brands; the access rules above then do not apply to it (the key is the credential).
		keyedHandler := api.Protect(api.ProtectOptions{TrustedOrigins: cfg.CORSOrigins}, mcpserver.HTTPHandler(mcpSrv))
		mux.Handle("/mcp", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "); got != r.Header.Get("Authorization") && strings.HasPrefix(got, service.KeyPrefix) {
				u, id, scope, err := accounts.AuthenticateKey(r.Context(), got)
				if err != nil {
					w.Header().Set("WWW-Authenticate", `Bearer realm="cardpress"`)
					http.Error(w, "that API key is not valid (it may have been revoked)", http.StatusUnauthorized)
					return
				}
				keyedHandler.ServeHTTP(w, r.WithContext(service.WithPrincipal(r.Context(), service.Principal{User: &u, Key: id, Scope: scope})))
				return
			}
			if n, err := accounts.Count(r.Context()); (err != nil || n > 0) && cfg.APIToken == "" {
				http.Error(w, "MCP over HTTP needs an API key (made in Account settings) or CARDPRESS_API_TOKEN, now that accounts exist", http.StatusForbidden)
				return
			}
			mcpHandler.ServeHTTP(w, r)
		}))
	}
	mux.Handle("/api/v1/", api.New(opts))
	// the public pages: articles and posts a person published, readable by anyone and by crawlers, so outside the token
	public := pages.New(pages.Options{Reader: service.NewPages(db.DB), PublicURL: cfg.PublicURL, SiteName: cfg.SiteName, Version: version})
	for _, p := range []string{"/articles", "/articles/", "/posts", "/posts/", "/sitemap.xml", "/robots.txt"} {
		mux.Handle(p, public)
	}
	if cfg.ServeWeb {
		site, err := fs.Sub(dist, "web/dist")
		if err != nil {
			log.Fatal(err)
		}
		_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
		_ = mime.AddExtensionType(".woff2", "font/woff2")
		mux.Handle(prefix, http.StripPrefix(strings.TrimSuffix(prefix, "/"), static(site)))
		if prefix != "/" {
			mux.Handle("/", http.RedirectHandler(prefix, http.StatusFound))
		}
	}

	srv := &http.Server{Addr: cfg.Addr, Handler: logRequests(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	web := "api only"
	if cfg.ServeWeb {
		web = displayAddr(cfg.Addr) + prefix
	}
	log.Printf("cardpress %s listening on %s (%s, %s database, token %s, MCP %s)", version, cfg.Addr, web, db.Driver, onOff(cfg.APIToken != ""), onOff(cfg.MCPEnabled))
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	// let a publish that is already under way finish before the database closes
	select {
	case <-schedulerDone:
	case <-time.After(100 * time.Second):
		log.Print("a publish was still running at shutdown; it will be flagged for review on the next start")
	}
}

func onOff(b bool) string {
	if b {
		return "on"
	}
	return "off"
}

// static serves the embedded files. Hashed assets under /_astro are cached for a year.
func static(site fs.FS) http.Handler {
	files := http.FileServer(http.FS(site))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if strings.HasPrefix(p, "/_astro/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if _, err := fs.Stat(site, strings.TrimPrefix(p, "/")); err != nil && p != "/" {
			// unknown path: fall back to the app shell
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		h.ServeHTTP(sw, r)
		if sw.status == 0 {
			sw.status = http.StatusOK
		}
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

// statusWriter remembers the status of an answer for the log. It passes Flush through, which streamed answers need.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func displayAddr(a string) string {
	if strings.HasPrefix(a, ":") {
		return "http://localhost" + a
	}
	return "http://" + a
}

// openSecretBox returns the key used to encrypt stored credentials: CARDPRESS_SECRET_KEY if set, otherwise (local,
// single-user setups only) a key file created next to the database. It is nil when neither applies.
func openSecretBox(cfg config.Config) (*secrets.Box, error) {
	if cfg.SecretKey != "" {
		return secrets.NewBox(cfg.SecretKey, "env")
	}
	if !cfg.LocalMode() {
		return nil, nil
	}
	path := filepath.Join(filepath.Dir(cfg.LocalDBPath()), "secret.key")
	secret, created, err := secrets.KeyFileSecret(path)
	if err != nil {
		return nil, err
	}
	if created {
		log.Printf("created an encryption key for stored credentials at %s: back it up together with the database", path)
	}
	return secrets.NewBox(secret, "file")
}

// runMCP serves the Model Context Protocol on stdin and stdout, for an agent started by a program on this machine (an
// editor or desktop assistant). It reads and writes the same database as the server. Nothing else may print to stdout,
// so log output goes to stderr (the log package's default).
func runMCP(args []string) {
	cfg, err := config.Load(args, os.Getenv)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := store.Open(ctx, cfg.DBURL, cfg.DBToken)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		log.Fatal(err)
	}
	studio := service.New(db.DB)
	fetcher := source.New()
	chatAgent, err := newAgent(cfg)
	if err != nil {
		log.Fatal(err)
	}
	chat := service.NewChat(db.DB, chatAgent, fetcher)
	// the publisher is only handed to the tools as a reader of jobs; it is never started here
	jobs := service.NewPublisher(db.DB, nil, nil, 0)
	srv := mcpserver.New(mcpserver.Deps{Profiles: studio, Drafts: studio, Proposals: chat, Jobs: jobs, Fetcher: fetcher, Audit: mcpserver.NewAuditor(db.DB), Transport: "stdio", Version: version})
	log.Printf("cardpress MCP over stdio is ready (%s database)", db.Driver)
	if err := mcpserver.RunStdio(ctx, srv); err != nil && ctx.Err() == nil {
		log.Fatal(err)
	}
}

// newAgent picks the chat's writer: the built-in demo, or a Claude Managed Agent.
func newAgent(cfg config.Config) (agent.Client, error) {
	if cfg.Agent != "cma" {
		return &agent.Mock{Delay: 25 * time.Millisecond}, nil
	}
	return cma.New(cma.Config{AgentID: cfg.AgentID, AgentVersion: cfg.AgentVersion, EnvironmentID: cfg.AgentEnvID, BudgetCents: cfg.AgentBudget}, cfg.AgentTimeout)
}

// runAgentSetup creates the managed agent and environment in the Anthropic account behind ANTHROPIC_API_KEY, and prints
// the settings to add to the environment.
func runAgentSetup(args []string) {
	fs := flag.NewFlagSet("agent-setup", flag.ExitOnError)
	model := fs.String("model", cma.DefaultModel, "model the agent uses")
	_ = fs.Parse(args)
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		log.Fatal("set ANTHROPIC_API_KEY first: this creates an agent and an environment in that Anthropic account")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	created, err := cma.Setup(ctx, cma.Config{}, *model)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Created agent %s (version %d) and environment %s.\n\nAdd to the server's environment:\n\n  CARDPRESS_AGENT=cma\n  CARDPRESS_AGENT_ID=%s\n  CARDPRESS_AGENT_ENVIRONMENT_ID=%s\n  ANTHROPIC_API_KEY=...   (the same key)\n\nOptional: CARDPRESS_AGENT_BUDGET_CENTS=500 caps what one conversation can spend.\n",
		created.AgentID, created.AgentVersion, created.EnvironmentID, created.AgentID, created.EnvironmentID)
}

// runHealthcheck asks the server on this machine whether it is up. It returns the exit code.
func runHealthcheck() int {
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = "127.0.0.1:" + envOr("PORT", "8080")
	}
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	client := http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get("http://" + addr + "/healthz")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "unhealthy:", resp.Status)
		return 1
	}
	return 0
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// runUser is the command-line side of accounts: there is no email, so a forgotten password is reset here, on the server.
func runUser(args []string) int {
	if len(args) != 2 || args[0] != "reset-password" {
		fmt.Fprintln(os.Stderr, "usage: cardpress user reset-password <email>")
		return 2
	}
	cfg, err := config.Load(nil, os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	ctx := context.Background()
	db, err := store.Open(ctx, cfg.DBURL, cfg.DBToken)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	pw, err := service.NewAccounts(db.DB, service.AccountsOptions{}).ResetPasswordByEmail(ctx, args[1])
	if errors.Is(err, service.ErrNotFound) {
		fmt.Fprintln(os.Stderr, "there is no account with that email")
		return 1
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	fmt.Printf("New password for %s: %s\nThey were signed out everywhere. Ask them to change it from Account settings.\n", args[1], pw)
	return 0
}
