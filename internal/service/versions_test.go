package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func picture(n int) string {
	return fmt.Sprintf(`{"type":"image","attrs":{"src":"data:image/png;base64,%s","alt":"p%d"}}`, strings.Repeat("QUJD", 50+n), n)
}

func labels(vs []Version) string {
	var out []string
	for i := len(vs) - 1; i >= 0; i-- { // oldest first
		out = append(out, vs[i].Label)
	}
	return strings.Join(out, ",")
}

func TestAnItemKeepsAHistoryAtTheMomentsThatMatter(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	clock := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
	versionNow = func() time.Time { return clock }
	t.Cleanup(func() { versionNow = func() time.Time { return time.Now().UTC() } })

	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Title: "T", Doc: docOf(para("one"))})
	edit := func(text string) {
		if _, err := l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "article", Title: "T", Doc: docOf(para(text))}); err != nil {
			t.Fatal(err)
		}
	}
	edit("two") // right after creating: too soon for an automatic version
	clock = clock.Add(11 * time.Minute)
	edit("three") // after a pause, a change is kept
	edit("three and a bit")
	clock = clock.Add(2 * time.Minute)
	if _, err := l.st.Approve(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	m, err := l.st.SaveVersion(ctx, d.ID, "  before the big rewrite ")
	if err != nil || m.Label != VersionManual || m.Note != "before the big rewrite" {
		t.Fatalf("%+v %v", m, err)
	}
	vs, _ := l.st.Versions(ctx, d.ID)
	if got := labels(vs); got != "created,auto,approved,manual" {
		t.Fatalf("%s", got)
	}
	if vs[0].Seq != 4 || !strings.Contains(vs[2].Preview, "three") {
		t.Fatalf("%+v", vs)
	}
	if _, err := l.st.SaveVersion(ctx, d.ID, strings.Repeat("x", maxVersionNote+1)); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if _, err := l.st.Versions(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

func TestRestoringAVersionIsAnEditAndKeepsWhatWasThere(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("original")), Hashtags: []string{"Go"}})
	l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("changed")), Hashtags: []string{"AI"}})
	l.st.Approve(ctx, d.ID)
	got, err := l.st.RestoreVersion(ctx, d.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(got.Doc), "original") || got.Hashtags[0] != "Go" || got.Status != StatusDraft || got.ApprovedAt != "" {
		t.Fatalf("a restore is an edit: an approved item goes back to draft: %+v", got)
	}
	vs, _ := l.st.Versions(ctx, d.ID)
	// the state before it was already a version, so only the restored one is added
	if !strings.HasSuffix(labels(vs), "approved,restored") || vs[0].Note != "from version 1" || vs[0].Revision != got.Revision {
		t.Fatalf("%s %+v", labels(vs), vs[0])
	}
	if v2, _ := l.st.Version(ctx, d.ID, 2); v2.Label != VersionApproved && v2.Label != VersionAuto {
		t.Fatalf("%+v", v2)
	}
	if _, err := l.st.RestoreVersion(ctx, d.ID, 99); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	// not while a post is waiting
	l.st.Approve(ctx, d.ID)
	at := l.clk.Add(time.Hour)
	if _, err := l.p.Create(ctx, JobInput{ProfileID: "p", DraftID: d.ID, Body: "original", Image: testPNG, ScheduledAt: &at, Timezone: "UTC"}); err != nil {
		t.Fatal(err)
	}
	if _, err := l.st.RestoreVersion(ctx, d.ID, 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
	if vs, _ := l.st.Versions(ctx, d.ID); !strings.Contains(labels(vs), "sent") {
		t.Fatalf("what went out is kept: %s", labels(vs))
	}
}

func TestAPictureKeptInManyVersionsIsStoredOnceAndComesBackIntact(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	clock := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
	versionNow = func() time.Time { return clock }
	t.Cleanup(func() { versionNow = func() time.Time { return time.Now().UTC() } })

	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "article", Doc: docOf(para("start"), picture(1))})
	for i := 0; i < 4; i++ {
		clock = clock.Add(11 * time.Minute)
		l.st.UpdateDraft(ctx, d.ID, DraftInput{ProfileID: "p", Kind: "article", Doc: docOf(para(fmt.Sprint("edit ", i)), picture(1))})
	}
	var blobs int
	_ = l.db.DB.QueryRow(`SELECT COUNT(*) FROM doc_blobs`).Scan(&blobs)
	if blobs != 1 {
		t.Fatalf("one picture in five versions is stored once, not %d times", blobs)
	}
	var stored int
	_ = l.db.DB.QueryRow(`SELECT MAX(length(doc)) FROM draft_versions`).Scan(&stored)
	if stored > 600 {
		t.Fatalf("a version holds a reference, not the picture (%d bytes)", stored)
	}
	v, err := l.st.Version(ctx, d.ID, 1)
	if err != nil || !strings.Contains(string(v.Doc), strings.Repeat("QUJD", 51)) || strings.Contains(string(v.Doc), blobPrefix) {
		t.Fatalf("the picture comes back whole: %v %.200s", err, v.Doc)
	}
	// deleting the item forgets its history and the pictures nothing uses
	if err := l.st.DeleteDraft(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	_ = l.db.DB.QueryRow(`SELECT COUNT(*) FROM doc_blobs`).Scan(&blobs)
	var n int
	_ = l.db.DB.QueryRow(`SELECT COUNT(*) FROM draft_versions`).Scan(&n)
	if blobs != 0 || n != 0 {
		t.Fatalf("%d pictures and %d versions left", blobs, n)
	}
}

func TestOldAutomaticVersionsAreDroppedFirstWhenThereAreTooMany(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("x"))})
	if _, err := l.st.SaveVersion(ctx, d.ID, "keep me"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxVersions+10; i++ {
		l.db.DB.Exec(`INSERT INTO draft_versions (id, draft_id, seq, label, kind, doc, created_at) VALUES (?, ?, ?, 'auto', 'post', '{}', '2026-01-01T00:00:00Z')`, fmt.Sprint("v", i), d.ID, 100+i)
	}
	if _, err := l.st.SaveVersion(ctx, d.ID, "latest"); err != nil {
		t.Fatal(err)
	}
	var total, manual int
	_ = l.db.DB.QueryRow(`SELECT COUNT(*) FROM draft_versions WHERE draft_id = ?`, d.ID).Scan(&total)
	_ = l.db.DB.QueryRow(`SELECT COUNT(*) FROM draft_versions WHERE draft_id = ? AND label IN ('manual', 'created')`, d.ID).Scan(&manual)
	if total != maxVersions || manual != 3 {
		t.Fatalf("%d versions, %d kept by hand or at creation", total, manual)
	}
	_ = json.Valid
}
