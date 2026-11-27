package service

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"path/filepath"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/store"
)

func mediaPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewGray(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestMediaLibrary(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+filepath.Join(t.TempDir(), "m.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"a", "b"} {
		if _, err := db.ExecContext(ctx, `INSERT INTO profiles (id, position, data, updated_at, owner_id) VALUES (?, 0, '{}', '', ?)`, id, "owner-"+id); err != nil {
			t.Fatal(err)
		}
	}
	m := NewMedia(db.DB, 1)
	pic, thumb := mediaPNG(t, 800, 600), mediaPNG(t, 320, 240)
	blobs := func() (n int) {
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM asset_blobs`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return
	}

	a, err := m.Add(ctx, "a", NewAsset{Name: "  Team  photo ", Tags: []string{"Team", "team", " ", "2026"}, Data: pic, Thumb: thumb})
	if err != nil {
		t.Fatal(err)
	}
	if a.Kind != "image" || a.Name != "Team photo" || a.Width != 800 || a.Height != 600 || !a.HasThumb || strings.Join(a.Tags, ",") != "Team,2026" {
		t.Errorf("added: %+v", a)
	}
	if _, err := m.Add(ctx, "a", NewAsset{Name: "Again", Data: pic}); !errors.Is(err, ErrConflict) {
		t.Errorf("the same file twice: %v", err)
	}
	same, err := m.Add(ctx, "b", NewAsset{Name: "Shared", Data: pic})
	if err != nil || same.HasThumb || blobs() != 1 {
		t.Errorf("another brand keeps its own entry and thumbnail over one file: %+v %d %v", same, blobs(), err)
	}
	if _, err := m.Add(ctx, "a", NewAsset{Name: "Doc", Data: []byte("%PDF-1.7 words")}); err != nil {
		t.Fatal(err)
	}
	v, err := m.Add(ctx, "a", NewAsset{Name: "Talk", Link: "https://video.example/watch?v=1"})
	if err != nil || v.Kind != "video" || v.Size != 0 {
		t.Errorf("video: %+v %v", v, err)
	}

	list, err := m.List(ctx, "a")
	if err != nil || len(list.Items) != 3 || list.Items[0].ID != v.ID || list.UsedBytes != int64(len(pic)+14) || list.LimitBytes != 1<<20 {
		t.Errorf("list: %d items, %d bytes, %v", len(list.Items), list.UsedBytes, err)
	}

	for name, bad := range map[string]NewAsset{
		"no name":         {Data: pic},
		"svg":             {Name: "x", Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`)},
		"video file":      {Name: "x", Data: []byte("\x00\x00\x00\x18ftypmp42")},
		"too wide":        {Name: "x", Data: mediaPNG(t, 2401, 10)},
		"http link":       {Name: "x", Link: "http://video.example/1"},
		"script link":     {Name: "x", Link: "javascript:alert(1)"},
		"both":            {Name: "x", Link: "https://video.example/1", Data: pic},
		"big thumbnail":   {Name: "x", Data: mediaPNG(t, 10, 10), Thumb: mediaPNG(t, 500, 500)},
		"not a thumbnail": {Name: "x", Data: mediaPNG(t, 11, 11), Thumb: []byte("%PDF-1.7")},
	} {
		if _, err := m.Add(ctx, "a", bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s was accepted: %v", name, err)
		}
	}
	big := append([]byte("%PDF-1.7 "), make([]byte, 1<<20)...)
	if _, err := m.Add(ctx, "a", NewAsset{Name: "Big", Data: big}); !errors.Is(err, ErrConflict) {
		t.Errorf("over the brand's allowance: %v", err)
	}

	// another person's brand answers as missing, and an entry is only reached through its own brand
	other := WithPrincipal(ctx, Principal{User: &User{ID: "owner-b", Roles: []string{"editor"}}})
	for _, err := range []error{
		func() error { _, err := m.List(other, "a"); return err }(),
		func() error { _, err := m.File(other, "a", a.ID); return err }(),
		func() error { _, err := m.File(other, "b", a.ID); return err }(),
		func() error { _, err := m.Thumb(other, "b", a.ID); return err }(),
		func() error { _, err := m.Update(other, "b", a.ID, "Mine", nil); return err }(),
		m.Delete(other, "b", a.ID),
		m.Delete(other, "a", a.ID),
	} {
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("reached another brand: %v", err)
		}
	}

	f, err := m.File(ctx, "a", a.ID)
	if err != nil || f.Mime != "image/png" || !bytes.Equal(f.Data, pic) {
		t.Errorf("file: %s %v", f.Mime, err)
	}
	if _, err := m.File(ctx, "a", v.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("a video has no file: %v", err)
	}
	renamed, err := m.Update(ctx, "a", a.ID, "Team", []string{"people"})
	if err != nil || renamed.Name != "Team" || renamed.Tags[0] != "people" {
		t.Errorf("update: %+v %v", renamed, err)
	}
	if err := m.Delete(ctx, "a", a.ID); err != nil || blobs() != 2 {
		t.Errorf("the other brand still uses the file: %d %v", blobs(), err)
	}
	if err := m.Delete(ctx, "b", same.ID); err != nil || blobs() != 1 {
		t.Errorf("the last use removes the file: %d %v", blobs(), err)
	}
}

func TestWebPSize(t *testing.T) {
	head := func(kind string, rest []byte) []byte {
		b := append([]byte("RIFF\x00\x00\x00\x00WEBP"+kind+"\x00\x00\x00\x00"), rest...)
		return append(b, make([]byte, 16)...)
	}
	for name, c := range map[string]struct {
		b    []byte
		w, h int
	}{
		"extended": {head("VP8X", []byte{0, 0, 0, 0, 0x1f, 0x03, 0, 0x57, 0x02, 0}), 800, 600},
		"lossy":    {head("VP8 ", []byte{0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02}), 800, 600},
		"lossless": {head("VP8L", []byte{0x2f, 0x1f, 0xc3, 0x95, 0x00}), 800, 600},
	} {
		if w, h, ok := imageSize(c.b, sniff(c.b)); !ok || w != c.w || h != c.h {
			t.Errorf("%s: %d x %d %v", name, w, h, ok)
		}
	}
}
