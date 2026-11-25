package store

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"strings"
	"testing"
)

// backends are the databases the same checks run against: the SQLite file always, and a libSQL server (Turso, or
// `turso dev` on this machine) when CARDPRESS_TEST_LIBSQL_URL names one, with CARDPRESS_TEST_LIBSQL_TOKEN if it needs it.
// Use a database kept for tests: the checks create and remove their own rows, and apply the migrations.
func backends(t *testing.T) map[string]*DB {
	t.Helper()
	out := map[string]*DB{"sqlite": open(t)}
	if u := os.Getenv("CARDPRESS_TEST_LIBSQL_URL"); u != "" {
		db, err := Open(context.Background(), u, os.Getenv("CARDPRESS_TEST_LIBSQL_TOKEN"))
		if err != nil {
			t.Fatalf("libsql: %v", err)
		}
		t.Cleanup(func() { db.Close() })
		out["libsql"] = db
	}
	return out
}

func id(t *testing.T) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return "compat-" + hex.EncodeToString(b)
}

// TestTheSchemaAndTheQueriesWorkOnEveryBackend runs the migrations and the kinds of statement the server depends on
// (large BLOBs, a transaction, INSERT ... SELECT with a window function, a subquery in VALUES, COUNT in a column list)
// on SQLite and, when one is configured, on libSQL.
func TestTheSchemaAndTheQueriesWorkOnEveryBackend(t *testing.T) {
	ctx := context.Background()
	for name, db := range backends(t) {
		t.Run(name, func(t *testing.T) {
			for i := 0; i < 2; i++ { // the second run must be a no-op
				if err := db.Migrate(ctx); err != nil {
					t.Fatalf("migrate: %v", err)
				}
			}
			draft, job := id(t), id(t)
			t.Cleanup(func() {
				for _, q := range []string{`DELETE FROM draft_images WHERE draft_id = ?`, `DELETE FROM drafts WHERE id = ?`} {
					_, _ = db.ExecContext(ctx, q, draft)
				}
				for _, q := range []string{`DELETE FROM job_images WHERE job_id = ?`, `DELETE FROM publish_jobs WHERE id = ?`} {
					_, _ = db.ExecContext(ctx, q, job)
				}
			})

			// a draft with a file of its own: a BLOB of a few megabytes goes in and comes back unchanged
			big := make([]byte, 3<<20)
			if _, err := rand.Read(big); err != nil {
				t.Fatal(err)
			}
			if _, err := db.ExecContext(ctx, `INSERT INTO drafts (id, profile_id, kind, status, doc, created_at, updated_at, attachment_kind, attachment, attachment_type, attachment_title)
				VALUES (?, 'compat', 'post', 'draft', '{"type":"doc"}', 'now', 'now', 'document', ?, 'application/pdf', 'A title')`, draft, big); err != nil {
				t.Fatalf("insert a draft with a file: %v", err)
			}
			var got []byte
			var kind, title string
			if err := db.QueryRowContext(ctx, `SELECT attachment_kind, attachment, attachment_title FROM drafts WHERE id = ?`, draft).Scan(&kind, &got, &title); err != nil {
				t.Fatalf("read the file: %v", err)
			}
			if kind != "document" || title != "A title" || !bytes.Equal(got, big) {
				t.Fatalf("the file came back changed: kind %q, %d bytes", kind, len(got))
			}

			// a NULL BLOB reads as empty, and the defaults of the added columns hold
			other := id(t)
			if _, err := db.ExecContext(ctx, `INSERT INTO drafts (id, profile_id, kind, status, doc, created_at, updated_at) VALUES (?, 'compat', 'post', 'draft', '{}', 'now', 'now')`, other); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM drafts WHERE id = ?`, other) })
			if err := db.QueryRowContext(ctx, `SELECT attachment_kind, attachment, attachment_title FROM drafts WHERE id = ?`, other).Scan(&kind, &got, &title); err != nil || kind != "card" || len(got) != 0 || title != "" {
				t.Fatalf("defaults: %q %d %q %v", kind, len(got), title, err)
			}

			// pictures: the position comes from a subquery in VALUES, inside a transaction
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			for i, pic := range []string{"first", "second", "third"} {
				if _, err := tx.ExecContext(ctx, `INSERT INTO draft_images (id, draft_id, position, data, type, alt_text, created_at)
					VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM draft_images WHERE draft_id = ?), ?, 'image/png', ?, 'now')`,
					draft+"-"+pic, draft, draft, []byte(pic), pic); err != nil {
					t.Fatalf("picture %d: %v", i, err)
				}
			}
			if _, err := tx.ExecContext(ctx, `UPDATE draft_images SET position = 10 WHERE id = ?`, draft+"-first"); err != nil { // first goes last
				t.Fatal(err)
			}
			if err := tx.Commit(); err != nil {
				t.Fatalf("commit: %v", err)
			}

			// a rolled-back transaction leaves nothing
			tx, _ = db.BeginTx(ctx, nil)
			_, _ = tx.ExecContext(ctx, `DELETE FROM draft_images WHERE draft_id = ?`, draft)
			if err := tx.Rollback(); err != nil {
				t.Fatal(err)
			}

			// the job's copy: INSERT ... SELECT with ROW_NUMBER, counted by RowsAffected
			if _, err := db.ExecContext(ctx, `INSERT INTO publish_jobs (id, profile_id, draft_id, status, body, image, created_at, updated_at, attachment_kind)
				VALUES (?, 'compat', ?, 'scheduled', 'text', ?, 'now', 'now', 'images')`, job, draft, []byte("thumb")); err != nil {
				t.Fatalf("insert a job: %v", err)
			}
			res, err := db.ExecContext(ctx, `INSERT INTO job_images (job_id, position, data, type, alt_text)
				SELECT ?, ROW_NUMBER() OVER (ORDER BY position, id) - 1, data, type, alt_text FROM draft_images WHERE draft_id = ?`, job, draft)
			if err != nil {
				t.Fatalf("copy the pictures: %v", err)
			}
			if n, err := res.RowsAffected(); err != nil || n != 3 {
				t.Fatalf("rows copied = %d, %v", n, err)
			}
			rows, err := db.QueryContext(ctx, `SELECT position, alt_text, data FROM job_images WHERE job_id = ? ORDER BY position`, job)
			if err != nil {
				t.Fatal(err)
			}
			var order []string
			for rows.Next() {
				var pos int
				var alt string
				var data []byte
				if err := rows.Scan(&pos, &alt, &data); err != nil {
					t.Fatal(err)
				}
				if pos != len(order) || string(data) != alt {
					t.Fatalf("position %d, alt %q, data %q", pos, alt, data)
				}
				order = append(order, alt)
			}
			if err := rows.Close(); err != nil {
				t.Fatal(err)
			}
			if strings.Join(order, ",") != "second,third,first" {
				t.Fatalf("order = %v", order)
			}

			// a count as a column, as the job list reads it
			var n int
			if err := db.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM job_images WHERE job_id = publish_jobs.id) FROM publish_jobs WHERE id = ?`, job).Scan(&n); err != nil || n != 3 {
				t.Fatalf("count = %d, %v", n, err)
			}
		})
	}
}

func TestPlainHTTPIsOnlyForThisMachine(t *testing.T) {
	for _, u := range []string{"http://db.example.com", "ws://10.0.0.5:8080", "http://192.168.1.2:8080"} {
		if _, err := Open(context.Background(), u, ""); err == nil || !strings.Contains(err.Error(), "only for a libSQL server on this machine") {
			t.Errorf("%s: %v", u, err)
		}
	}
	// a loopback address is accepted as a libSQL server (nothing listens here; the driver only finds that out on a query)
	db, err := Open(context.Background(), "http://127.0.0.1:1", "")
	if err != nil && strings.Contains(err.Error(), "unsupported") {
		t.Errorf("loopback: %v", err)
	}
	if db != nil {
		db.Close()
	}
}
