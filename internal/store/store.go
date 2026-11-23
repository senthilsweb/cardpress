// Package store opens the database (local SQLite or Turso/libSQL) and applies migrations.
package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "github.com/tursodatabase/libsql-client-go/libsql" // driver "libsql"
	_ "modernc.org/sqlite"                               // driver "sqlite"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// DB is a database handle that remembers which backend it uses.
type DB struct {
	*sql.DB
	Driver string // "sqlite" or "libsql"
}

// Open connects to rawURL: "file:path" for a local SQLite file, or a libsql://, https:// or wss:// URL for Turso.
// token is the libSQL auth token and is ignored for files.
func Open(ctx context.Context, rawURL, token string) (*DB, error) {
	var (
		db     *sql.DB
		driver string
		err    error
	)
	switch {
	case strings.HasPrefix(rawURL, "file:"):
		driver = "sqlite"
		path := strings.TrimPrefix(rawURL, "file:")
		if i := strings.IndexByte(path, '?'); i >= 0 {
			path = path[:i]
		}
		if dir := filepath.Dir(path); dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0o750); err != nil {
				return nil, fmt.Errorf("create data directory: %w", err)
			}
		}
		sep := "?"
		if strings.Contains(rawURL, "?") {
			sep = "&"
		}
		dsn := rawURL + sep + "_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
		if db, err = sql.Open("sqlite", dsn); err != nil {
			return nil, err
		}
		db.SetMaxOpenConns(1) // one writer; keeps a local file free of "database is locked"
	case strings.HasPrefix(rawURL, "libsql://"), strings.HasPrefix(rawURL, "https://"), strings.HasPrefix(rawURL, "wss://"):
		driver = "libsql"
		u, perr := url.Parse(rawURL)
		if perr != nil {
			return nil, fmt.Errorf("bad database URL: %w", perr)
		}
		if token != "" {
			q := u.Query()
			q.Set("authToken", token)
			u.RawQuery = q.Encode()
		}
		if db, err = sql.Open("libsql", u.String()); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported database URL %q: use file:./data/cardpress.db or libsql://...", redact(rawURL))
	}
	pctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := db.PingContext(pctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect to %s database: %w", driver, err)
	}
	return &DB{DB: db, Driver: driver}, nil
}

func redact(s string) string {
	if i := strings.IndexByte(s, '?'); i >= 0 {
		return s[:i] + "?…"
	}
	return s
}

// Migrate applies pending migrations in filename order, each in its own transaction.
func (d *DB) Migrate(ctx context.Context) error {
	if _, err := d.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")
		var n int
		if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, version).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		if err := d.applyOne(ctx, version, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", version, err)
		}
	}
	return nil
}

func (d *DB) applyOne(ctx context.Context, version, body string) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for _, stmt := range splitStatements(body) {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, version, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}
	return tx.Commit()
}

// splitStatements splits a migration into statements and drops "--" comment lines.
func splitStatements(body string) []string {
	var lines []string
	for _, l := range strings.Split(body, "\n") {
		if strings.HasPrefix(strings.TrimSpace(l), "--") {
			continue
		}
		lines = append(lines, l)
	}
	var out []string
	for _, s := range strings.Split(strings.Join(lines, "\n"), ";") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}
