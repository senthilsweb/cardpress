package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // read a picture's size
	_ "image/png"  // read a picture's size
	"maps"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// The media library keeps a brand's pictures and PDF documents in the database, and links to videos. The browser reduces
// a picture and draws its thumbnail before sending them, so the server never has to unpack a picture: it only reads the
// size from the file's first bytes, which a small machine can afford.

// Media is the media library over the database.
type Media struct {
	db *sql.DB
	// BrandLimit is how many bytes of files one brand may hold.
	BrandLimit int64
	// Disk says how full the disk holding the database is, in percent; nil when that is not known.
	Disk func() (int, bool)
}

// Limits on what is taken in.
const (
	MaxImageBytes  = 10 << 20
	MaxPDFBytes    = 20 << 20
	MaxImageSide   = 2400
	maxThumbBytes  = 300 << 10
	maxThumbSide   = 400
	maxAssetName   = 120
	maxAssetTags   = 10
	maxTagLength   = 30
	maxLinkLength  = 2000
	defaultBrandMB = 200
	// from this share of the disk in use, the library says so
	diskWarnPercent = 70
)

// NewMedia returns the library over db; limitMB is each brand's allowance (0 for the usual 200).
func NewMedia(db *sql.DB, limitMB int) *Media {
	if limitMB <= 0 {
		limitMB = defaultBrandMB
	}
	return &Media{db: db, BrandLimit: int64(limitMB) << 20}
}

// Asset is one entry of a brand's library.
type Asset struct {
	ID        string   `json:"id"`
	ProfileID string   `json:"profileId"`
	Kind      string   `json:"kind"` // "image", "pdf" or "video"
	Name      string   `json:"name"`
	Tags      []string `json:"tags"`
	Mime      string   `json:"mime,omitempty"`
	Size      int64    `json:"size,omitempty"`
	Width     int      `json:"width,omitempty"`
	Height    int      `json:"height,omitempty"`
	Link      string   `json:"link,omitempty"`
	HasThumb  bool     `json:"hasThumb"`
	CreatedBy string   `json:"createdBy,omitempty"` // a person's name
	CreatedAt string   `json:"createdAt"`
}

// Assets is one page of a brand's library, with what is true of the whole of it: how many entries, every tag, and how
// full it is. A file listed twice is counted once.
type Assets struct {
	Items      []Asset  `json:"items"`
	Total      int      `json:"total"` // entries that match
	Page       int      `json:"page"`  // the page returned (1-based, kept within range)
	PageSize   int      `json:"pageSize"`
	Pages      int      `json:"pages"` // at least 1
	Count      int      `json:"count"` // entries in the library
	Tags       []string `json:"tags"`
	UsedBytes  int64    `json:"usedBytes"`
	LimitBytes int64    `json:"limitBytes"`
	// DiskPercent is how full the server's disk is, told only when that is worth a warning.
	DiskPercent int `json:"diskPercent,omitempty"`
}

// AssetQuery says which entries to list: those of a kind ("" for all), with a tag, whose name or tags hold every word.
type AssetQuery struct {
	Q, Kind, Tag   string
	Page, PageSize int // 0: the first page, 24 entries
}

// AssetPageSizes are the page sizes a caller may ask for.
var AssetPageSizes = []int{12, 24, 48}

const assetDefaultPageSize = 24

// NewAsset is what is added: a file with its thumbnail, or a video's address.
type NewAsset struct {
	Name  string
	Tags  []string
	Data  []byte
	Thumb []byte
	Link  string
	// Reuse gives back the entry the brand already has for the same file or link, instead of refusing it.
	Reuse bool
}

// AssetFile is a stored file.
type AssetFile struct {
	Name, Mime string
	Data       []byte
}

// sniff says what a file is from its first bytes; the name and the type the browser claims are not trusted.
func sniff(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(b, []byte("\xff\xd8\xff")):
		return "image/jpeg"
	case len(b) >= 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "image/webp"
	case bytes.HasPrefix(b, []byte("%PDF-")):
		return "application/pdf"
	}
	return ""
}

// imageSize reads a picture's width and height from its header.
func imageSize(b []byte, mime string) (int, int, bool) {
	if mime != "image/webp" {
		c, _, err := image.DecodeConfig(bytes.NewReader(b))
		return c.Width, c.Height, err == nil && c.Width > 0 && c.Height > 0
	}
	if len(b) < 30 {
		return 0, 0, false
	}
	le24 := func(p []byte) int { return int(p[0]) | int(p[1])<<8 | int(p[2])<<16 }
	switch string(b[12:16]) {
	case "VP8X": // extended: the canvas size, less one
		return le24(b[24:27]) + 1, le24(b[27:30]) + 1, true
	case "VP8 ": // lossy: 14 bits each after the start code
		if string(b[23:26]) != "\x9d\x01\x2a" {
			return 0, 0, false
		}
		w, h := int(binary.LittleEndian.Uint16(b[26:28])&0x3fff), int(binary.LittleEndian.Uint16(b[28:30])&0x3fff)
		return w, h, w > 0 && h > 0
	case "VP8L": // lossless: 14 bits each, less one
		if b[20] != 0x2f {
			return 0, 0, false
		}
		v := binary.LittleEndian.Uint32(b[21:25])
		return int(v&0x3fff) + 1, int(v>>14&0x3fff) + 1, true
	}
	return 0, 0, false
}

func assetName(name string) (string, error) {
	name = squash(name)
	switch {
	case name == "":
		return "", invalid("give it a name")
	case !utf8.ValidString(name) || strings.IndexFunc(name, unicode.IsControl) >= 0:
		return "", invalid("the name holds characters that cannot be kept")
	case utf8.RuneCountInString(name) > maxAssetName:
		return "", invalid("the name is too long (at most %d characters)", maxAssetName)
	}
	return name, nil
}

// assetTags trims tags and drops empty and repeated ones, whatever their case.
func assetTags(in []string) ([]string, error) {
	out, seen := []string{}, map[string]bool{}
	for _, t := range in {
		t = squash(t)
		k := strings.ToLower(t)
		if t == "" || seen[k] {
			continue
		}
		if !utf8.ValidString(t) || strings.IndexFunc(t, unicode.IsControl) >= 0 || utf8.RuneCountInString(t) > maxTagLength {
			return nil, invalid("a tag is at most %d characters", maxTagLength)
		}
		seen[k] = true
		out = append(out, t)
	}
	if len(out) > maxAssetTags {
		return nil, invalid("at most %d tags", maxAssetTags)
	}
	return out, nil
}

// videoLink accepts a public https address.
func videoLink(s string) (string, error) {
	s = strings.TrimSpace(s)
	u, err := url.Parse(s)
	if err != nil || len(s) > maxLinkLength || u.Scheme != "https" || u.User != nil || !strings.Contains(u.Hostname(), ".") || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return "", invalid("a video is a web address that starts with https://")
	}
	return u.String(), nil
}

const assetColumns = `a.id, a.profile_id, a.kind, a.name, a.tags, a.mime, a.size, a.width, a.height, a.link, a.thumb_mime <> '',
	COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = a.created_by), ''), a.created_at`

func scanAsset(row interface{ Scan(...any) error }) (Asset, error) {
	var a Asset
	var tags string
	err := row.Scan(&a.ID, &a.ProfileID, &a.Kind, &a.Name, &tags, &a.Mime, &a.Size, &a.Width, &a.Height, &a.Link, &a.HasThumb, &a.CreatedBy, &a.CreatedAt)
	if json.Unmarshal([]byte(tags), &a.Tags) != nil || a.Tags == nil {
		a.Tags = []string{}
	}
	return a, err
}

// used is how many bytes of distinct files a brand holds.
func (m *Media) used(ctx context.Context, q rowQuerier, profileID string) (int64, error) {
	var n int64
	err := q.QueryRowContext(ctx, `SELECT COALESCE(SUM(size), 0) FROM (SELECT MAX(size) AS size FROM assets WHERE profile_id = ? AND hash <> '' GROUP BY hash)`, profileID).Scan(&n)
	return n, err
}

func (m *Media) open(ctx context.Context, profileID string) error {
	return brandVisible(ctx, m.db, profileID)
}

// matches says whether an entry is one the query asks for. Words and tags are compared without case.
func (q AssetQuery) matches(a Asset) bool {
	if q.Kind != "" && a.Kind != q.Kind {
		return false
	}
	if q.Tag != "" && !slices.ContainsFunc(a.Tags, func(t string) bool { return strings.EqualFold(t, q.Tag) }) {
		return false
	}
	text := strings.ToLower(a.Name + " " + strings.Join(a.Tags, " "))
	for _, w := range strings.Fields(strings.ToLower(q.Q)) {
		if !strings.Contains(text, w) {
			return false
		}
	}
	return true
}

// List is a page of a brand's library, newest first. The entries are read without their files or thumbnails.
func (m *Media) List(ctx context.Context, profileID string, q AssetQuery) (Assets, error) {
	out := Assets{Items: []Asset{}, Tags: []string{}, LimitBytes: m.BrandLimit}
	if err := m.open(ctx, profileID); err != nil {
		return out, err
	}
	if q.Kind != "" && q.Kind != "image" && q.Kind != "pdf" && q.Kind != "video" {
		return out, invalid("kind must be image, pdf or video")
	}
	size := q.PageSize
	if size == 0 {
		size = assetDefaultPageSize
	}
	if !slices.Contains(AssetPageSizes, size) {
		return out, invalid("pageSize must be 12, 24 or 48")
	}
	if q.Page < 0 {
		return out, invalid("page must be 1 or more")
	}
	rs, err := m.db.QueryContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.profile_id = ? ORDER BY a.created_at DESC, a.rowid DESC`, profileID)
	if err != nil {
		return out, err
	}
	var found []Asset
	tags := map[string]string{}
	for rs.Next() {
		a, err := scanAsset(rs)
		if err != nil {
			rs.Close()
			return out, err
		}
		out.Count++
		for _, t := range a.Tags {
			tags[strings.ToLower(t)] = t
		}
		if q.matches(a) {
			found = append(found, a)
		}
	}
	if err := closeRows(rs); err != nil {
		return out, err
	}
	for _, k := range slices.Sorted(maps.Keys(tags)) {
		out.Tags = append(out.Tags, tags[k])
	}
	out.Total, out.PageSize = len(found), size
	out.Pages = max(1, (len(found)+size-1)/size)
	out.Page = min(max(1, q.Page), out.Pages) // a page past the end (after a delete, say) shows the last one
	out.Items = append(out.Items, found[(out.Page-1)*size:min(len(found), out.Page*size)]...)
	if m.Disk != nil {
		if p, ok := m.Disk(); ok && p >= diskWarnPercent {
			out.DiskPercent = p
		}
	}
	out.UsedBytes, err = m.used(ctx, m.db, profileID)
	return out, err
}

func (m *Media) get(ctx context.Context, profileID, id string) (Asset, error) {
	a, err := scanAsset(m.db.QueryRowContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.id = ? AND a.profile_id = ?`, id, profileID))
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	return a, err
}

// Add puts a file or a video link in a brand's library.
func (m *Media) Add(ctx context.Context, profileID string, in NewAsset) (Asset, error) {
	var none Asset
	if err := m.open(ctx, profileID); err != nil {
		return none, err
	}
	name, err := assetName(in.Name)
	if err != nil {
		return none, err
	}
	tags, err := assetTags(in.Tags)
	if err != nil {
		return none, err
	}
	a := Asset{ID: newID(), Name: name, Tags: tags}
	hash, thumbMime := "", ""
	switch {
	case in.Link != "" && len(in.Data) > 0:
		return none, invalid("add a file or a video link, not both")
	case in.Link != "":
		a.Kind = "video"
		if a.Link, err = videoLink(in.Link); err != nil {
			return none, err
		}
	default:
		a.Mime, a.Size = sniff(in.Data), int64(len(in.Data))
		switch {
		case a.Mime == "":
			return none, invalid("the library takes PNG, JPEG and WebP pictures and PDF documents; add a video as a link")
		case a.Mime == "application/pdf":
			a.Kind = "pdf"
			if a.Size > MaxPDFBytes {
				return none, invalid("a PDF is at most %d MB", MaxPDFBytes>>20)
			}
		default:
			a.Kind = "image"
			if a.Size > MaxImageBytes {
				return none, invalid("a picture is at most %d MB", MaxImageBytes>>20)
			}
			w, h, ok := imageSize(in.Data, a.Mime)
			if !ok {
				return none, invalid("that picture cannot be read")
			}
			if w > MaxImageSide || h > MaxImageSide {
				return none, invalid("a picture is at most %d pixels on its long side", MaxImageSide)
			}
			a.Width, a.Height = w, h
		}
		sum := sha256.Sum256(in.Data)
		hash = hex.EncodeToString(sum[:])
		if len(in.Thumb) > 0 {
			thumbMime = sniff(in.Thumb)
			w, h, ok := imageSize(in.Thumb, thumbMime)
			if !strings.HasPrefix(thumbMime, "image/") || len(in.Thumb) > maxThumbBytes || !ok || w > maxThumbSide || h > maxThumbSide {
				return none, invalid("that thumbnail cannot be used")
			}
		}
	}
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return none, err
	}
	defer tx.Rollback() //nolint:errcheck
	var there string
	var thereID string
	err = tx.QueryRowContext(ctx, `SELECT id, name FROM assets WHERE profile_id = ? AND hash = ? AND link = ?`, profileID, hash, a.Link).Scan(&thereID, &there)
	switch {
	case err == nil && in.Reuse:
		if err := tx.Rollback(); err != nil { // one connection: let it go before reading again
			return none, err
		}
		return m.get(ctx, profileID, thereID)
	case err == nil:
		return none, fmt.Errorf("%w: this is already in the library, as %q", ErrConflict, there)
	case !errors.Is(err, sql.ErrNoRows):
		return none, err
	}
	if hash != "" {
		used, err := m.used(ctx, tx, profileID)
		if err != nil {
			return none, err
		}
		if used+a.Size > m.BrandLimit {
			return none, fmt.Errorf("%w: the library is full: %d MB for each brand. Delete something first", ErrConflict, m.BrandLimit>>20)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO asset_blobs (hash, data) VALUES (?, ?) ON CONFLICT (hash) DO NOTHING`, hash, in.Data); err != nil {
			return none, err
		}
	}
	by := ""
	if p, ok := PrincipalFrom(ctx); ok {
		by = p.UserID()
	}
	list, _ := json.Marshal(tags)
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var thumb any
	if thumbMime != "" {
		thumb = in.Thumb
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO assets (id, profile_id, kind, name, tags, hash, link, mime, size, width, height, thumb, thumb_mime, created_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, profileID, a.Kind, a.Name, string(list), hash, a.Link, a.Mime, a.Size, a.Width, a.Height, thumb, thumbMime, by, now, now); err != nil {
		return none, err
	}
	if err := tx.Commit(); err != nil {
		return none, err
	}
	return m.get(ctx, profileID, a.ID)
}

// Update renames an entry and replaces its tags.
func (m *Media) Update(ctx context.Context, profileID, id, name string, tags []string) (Asset, error) {
	var none Asset
	if err := m.open(ctx, profileID); err != nil {
		return none, err
	}
	name, err := assetName(name)
	if err != nil {
		return none, err
	}
	if tags, err = assetTags(tags); err != nil {
		return none, err
	}
	list, _ := json.Marshal(tags)
	res, err := m.db.ExecContext(ctx, `UPDATE assets SET name = ?, tags = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
		name, string(list), time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), id, profileID)
	if err != nil {
		return none, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return none, ErrNotFound
	}
	return m.get(ctx, profileID, id)
}

// dropOrphans removes files no entry points at any more.
const dropOrphans = `DELETE FROM asset_blobs WHERE NOT EXISTS (SELECT 1 FROM assets a WHERE a.hash = asset_blobs.hash)`

// Delete removes an entry, and its file when nothing else uses it.
func (m *Media) Delete(ctx context.Context, profileID, id string) error {
	if err := m.open(ctx, profileID); err != nil {
		return err
	}
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	uses, err := assetUses(ctx, tx, profileID, id)
	if err != nil {
		return err
	}
	if len(uses) > 0 {
		return fmt.Errorf("%w: it is used by %s. Take it off there first", ErrConflict, listed(uses))
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE id = ? AND profile_id = ?`, id, profileID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, dropOrphans); err != nil {
		return err
	}
	return tx.Commit()
}

// AssetRef is how a card or a brand points at a library file instead of holding a copy of it.
func AssetRef(id string) string { return "asset:" + id }

// assetUses names what points at a library file: the brand's logo or headshot, its own card, the cards of its items
// and of their saved versions. A post waiting or sent has the picture of its card already, so it holds no reference.
func assetUses(ctx context.Context, tx *sql.Tx, profileID, id string) ([]string, error) {
	ref := `"` + AssetRef(id) + `"` // a whole string in the stored JSON
	var uses []string
	for _, q := range []struct{ name, query string }{
		{"the brand's logo or headshot", `SELECT '' , '' FROM profiles WHERE id = ? AND instr(data, ?) > 0`},
		{"the brand's own card", `SELECT '', '' FROM designs WHERE profile_id = ? AND instr(data, ?) > 0`},
		{"the card of", `SELECT title, doc FROM drafts WHERE profile_id = ? AND instr(design, ?) > 0 ORDER BY updated_at DESC`},
		{"a saved version of", `SELECT d.title, d.doc FROM drafts d WHERE d.profile_id = ?1 AND instr(d.design, ?2) = 0
			AND EXISTS (SELECT 1 FROM draft_versions v WHERE v.draft_id = d.id AND instr(v.design, ?2) > 0) ORDER BY d.updated_at DESC`},
	} {
		rs, err := tx.QueryContext(ctx, q.query, profileID, ref)
		if err != nil {
			return nil, err
		}
		for rs.Next() {
			var title, doc string
			if err := rs.Scan(&title, &doc); err != nil {
				rs.Close()
				return nil, err
			}
			if !strings.HasSuffix(q.name, " of") {
				uses = append(uses, q.name)
				continue
			}
			if title = draftTitle(title, doc); title == "" {
				title = "an untitled item"
			} else {
				title = "“" + cut(title, 40) + "”"
			}
			uses = append(uses, q.name+" "+title)
		}
		if err := closeRows(rs); err != nil {
			return nil, err
		}
	}
	return uses, nil
}

// listed writes a few uses out, and says how many more there are.
func listed(uses []string) string {
	const most = 3
	if len(uses) > most {
		return strings.Join(uses[:most], ", ") + fmt.Sprintf(" and %d more", len(uses)-most)
	}
	if len(uses) == 1 {
		return uses[0]
	}
	return strings.Join(uses[:len(uses)-1], ", ") + " and " + uses[len(uses)-1]
}

// File is an entry's file; a video has none.
func (m *Media) File(ctx context.Context, profileID, id string) (AssetFile, error) {
	var f AssetFile
	if err := m.open(ctx, profileID); err != nil {
		return f, err
	}
	err := m.db.QueryRowContext(ctx, `SELECT a.name, a.mime, b.data FROM assets a JOIN asset_blobs b ON b.hash = a.hash WHERE a.id = ? AND a.profile_id = ?`, id, profileID).Scan(&f.Name, &f.Mime, &f.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}

// Thumb is an entry's small picture.
func (m *Media) Thumb(ctx context.Context, profileID, id string) (AssetFile, error) {
	var f AssetFile
	if err := m.open(ctx, profileID); err != nil {
		return f, err
	}
	err := m.db.QueryRowContext(ctx, `SELECT name, thumb_mime, thumb FROM assets WHERE id = ? AND profile_id = ? AND thumb_mime <> ''`, id, profileID).Scan(&f.Name, &f.Mime, &f.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}
