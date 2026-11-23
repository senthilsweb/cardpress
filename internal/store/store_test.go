package store

import (
	"context"
	"path/filepath"
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
