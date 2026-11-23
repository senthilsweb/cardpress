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

	"github.com/senthilsweb/cardpress/internal/api"
	"github.com/senthilsweb/cardpress/internal/config"
	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/store"
)

//go:embed all:web/dist
var dist embed.FS

var version = "dev" // set with -ldflags "-X main.version=v0.1.0"

func main() {
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
	schedulerDone := make(chan struct{})
	go func() { defer close(schedulerDone); publisher.Run(ctx, 20*time.Second) }()
	mux.Handle("/api/v1/", api.New(api.Options{
		Studio: service.New(db.DB), Settings: settings, Publishing: publisher, Token: cfg.APIToken, CORSOrigins: cfg.CORSOrigins, Version: version, DBDriver: db.Driver,
	}))
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
	log.Printf("cardpress %s listening on %s (%s, %s database, token %s)", version, cfg.Addr, web, db.Driver, onOff(cfg.APIToken != ""))
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
		h.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

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
