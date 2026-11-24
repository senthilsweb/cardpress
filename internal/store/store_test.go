package store

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func open(t *testing.T) *DB {
	t.Helper()
	db, err := Open(context.Background(), "file:"+filepath.Join(t.TempDir(), "nested", "t.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestOpenCreatesDirectoryAndMigratesOnce(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	if db.Driver != "sqlite" {
		t.Fatalf("driver = %s", db.Driver)
	}
	for i := 0; i < 2; i++ { // second run must be a no-op
		if err := db.Migrate(ctx); err != nil {
			t.Fatal(err)
		}
	}
	files, _ := migrationFiles.ReadDir("migrations")
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n); err != nil || n != len(files) {
		t.Fatalf("applied migrations = %d, want %d, err %v", n, len(files), err)
	}
	if _, err := db.Exec(`INSERT INTO profiles (id, position, data, updated_at) VALUES ('a', 0, '{}', 'x')`); err != nil {
		t.Fatalf("profiles table missing: %v", err)
	}
}

func TestUnsupportedURL(t *testing.T) {
	if _, err := Open(context.Background(), "postgres://x", ""); err == nil {
		t.Fatal("expected error")
	}
}

func TestSplitStatements(t *testing.T) {
	got := splitStatements("-- c\nCREATE TABLE a (x INT);\n\nCREATE TABLE b (y INT);\n")
	if len(got) != 2 || got[0] != "CREATE TABLE a (x INT)" {
		t.Fatalf("%q", got)
	}
}

func TestBrandsMigrationCarriesCredentialsToTheFirstProfile(t *testing.T) {
	for name, withProfile := range map[string]bool{"with a profile": true, "no profile yet": false} {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			db, err := Open(ctx, "file:"+filepath.Join(t.TempDir(), "t.db"), "")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			// the database as it was before this migration
			if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
				t.Fatal(err)
			}
			entries, _ := migrationFiles.ReadDir("migrations")
			for _, e := range entries {
				if e.Name() >= "0007" {
					continue
				}
				body, _ := migrationFiles.ReadFile("migrations/" + e.Name())
				if err := db.applyOne(ctx, strings.TrimSuffix(e.Name(), ".sql"), string(body)); err != nil {
					t.Fatal(err)
				}
			}
			if withProfile {
				for i, id := range []string{"first", "second"} {
					if _, err := db.ExecContext(ctx, `INSERT INTO profiles (id, position, data, updated_at) VALUES (?, ?, '{}', 'now')`, id, i); err != nil {
						t.Fatal(err)
					}
				}
			}
			if _, err := db.ExecContext(ctx, `INSERT INTO credentials (network, field, value, updated_at) VALUES ('linkedin', 'accessToken', 'SEALED-VALUE', 'then')`); err != nil {
				t.Fatal(err)
			}

			if err := db.Migrate(ctx); err != nil {
				t.Fatal(err)
			}
			want := ""
			if withProfile {
				want = "first"
			}
			var owner, value string
			if err := db.QueryRowContext(ctx, `SELECT profile_id, value FROM credentials WHERE network = 'linkedin' AND field = 'accessToken'`).Scan(&owner, &value); err != nil {
				t.Fatal(err)
			}
			if owner != want || value != "SEALED-VALUE" {
				t.Fatalf("owner %q (want %q), value %q: the value must be carried over untouched", owner, want, value)
			}
			var env string
			err = db.QueryRowContext(ctx, `SELECT value FROM preferences WHERE key = 'envProfile'`).Scan(&env)
			if withProfile && (err != nil || env != `"first"`) {
				t.Fatalf("envProfile = %q (%v)", env, err)
			}
			if !withProfile && err == nil {
				t.Fatalf("no envProfile expected without a profile, got %q", env)
			}
			// the new columns work
			if _, err := db.ExecContext(ctx, `INSERT INTO credentials (profile_id, network, field, value, updated_at) VALUES ('other', 'linkedin', 'accessToken', 'X', 'now')`); err != nil {
				t.Fatalf("credentials must allow the same field for another profile: %v", err)
			}
			if withProfile {
				if _, err := db.ExecContext(ctx, `UPDATE profiles SET archived_at = 'now' WHERE id = 'second'`); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}
