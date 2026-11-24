package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Version labels.
const (
	VersionCreated  = "created"
	VersionAuto     = "auto"
	VersionManual   = "manual"
	VersionApproved = "approved"
	VersionSent     = "sent"
	VersionRestored = "restored"
)

const (
	maxVersions       = 100
	autoVersionEvery  = 10 * time.Minute
	maxVersionNote    = 120
	blobPrefix        = "blob:"
	maxPictureDataURL = 12 << 20
)

// versionNow is the clock for versions; tests move it.
var versionNow = func() time.Time { return time.Now().UTC() }

// Version is one saved state of an item.
type Version struct {
	ID            string          `json:"id"`
	DraftID       string          `json:"draftId"`
	Seq           int             `json:"seq"`
	Label         string          `json:"label"`
	Note          string          `json:"note,omitempty"`
	Kind          string          `json:"kind"`
	Title         string          `json:"title"`
	Doc           json.RawMessage `json:"doc,omitempty"` // only when one version is asked for
	Hashtags      []string        `json:"hashtags,omitempty"`
	AltText       string          `json:"altText,omitempty"`
	UnicodeStyles bool            `json:"unicodeStyles,omitempty"`
	Design        json.RawMessage `json:"design,omitempty"`
	CreatedBy     string          `json:"createdBy,omitempty"`
	CreatedByName string          `json:"createdByName,omitempty"`
	CreatedAt     string          `json:"createdAt"`
	// Preview is the start of the text, to tell versions apart in a list.
	Preview string `json:"preview,omitempty"`
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

/* ------------------------------------------------------------------ pictures kept once */

// externalize replaces each embedded picture in a document with a reference to a stored copy, returning the lighter
// document, the pictures it uses and their hashes.
func externalize(doc json.RawMessage) (json.RawMessage, map[string]string, error) {
	var root any
	if err := json.Unmarshal(doc, &root); err != nil {
		return nil, nil, err
	}
	blobs := map[string]string{}
	var walk func(v any)
	walk = func(v any) {
		switch n := v.(type) {
		case map[string]any:
			if n["type"] == "image" {
				if attrs, ok := n["attrs"].(map[string]any); ok {
					if src, ok := attrs["src"].(string); ok && strings.HasPrefix(src, "data:") && len(src) <= maxPictureDataURL {
						sum := sha256.Sum256([]byte(src))
						h := hex.EncodeToString(sum[:])
						blobs[h] = src
						attrs["src"] = blobPrefix + h
					}
				}
			}
			for _, c := range n {
				walk(c)
			}
		case []any:
			for _, c := range n {
				walk(c)
			}
		}
	}
	walk(root)
	out, err := json.Marshal(root)
	return out, blobs, err
}

// internalize puts the pictures back.
func internalize(ctx context.Context, q execer, doc json.RawMessage) (json.RawMessage, error) {
	var root any
	if err := json.Unmarshal(doc, &root); err != nil {
		return nil, err
	}
	cache := map[string]string{}
	var failed error
	var walk func(v any)
	walk = func(v any) {
		switch n := v.(type) {
		case map[string]any:
			if n["type"] == "image" {
				if attrs, ok := n["attrs"].(map[string]any); ok {
					if src, ok := attrs["src"].(string); ok && strings.HasPrefix(src, blobPrefix) {
						h := strings.TrimPrefix(src, blobPrefix)
						data, ok := cache[h]
						if !ok {
							var b []byte
							if err := q.QueryRowContext(ctx, `SELECT data FROM doc_blobs WHERE hash = ?`, h).Scan(&b); err != nil && !errors.Is(err, sql.ErrNoRows) {
								failed = err
							}
							data = string(b)
							cache[h] = data
						}
						attrs["src"] = data // a picture that is gone becomes an empty source rather than breaking the version
					}
				}
			}
			for _, c := range n {
				walk(c)
			}
		case []any:
			for _, c := range n {
				walk(c)
			}
		}
	}
	walk(root)
	if failed != nil {
		return nil, failed
	}
	return json.Marshal(root)
}

/* ------------------------------------------------------------------ taking and reading versions */

func nextSeq(ctx context.Context, q execer, draftID string) (int, error) {
	var n sql.NullInt64
	if err := q.QueryRowContext(ctx, `SELECT MAX(seq) FROM draft_versions WHERE draft_id = ?`, draftID).Scan(&n); err != nil {
		return 0, err
	}
	return int(n.Int64) + 1, nil
}

// snapshotDraft saves the draft's current state as a version. An "auto" snapshot is only taken when something changed and
// enough time has passed since the last one; any other label is always taken.
func snapshotDraft(ctx context.Context, db *sql.DB, draftID, label, note string) error {
	var kind, title, doc, tags, alt, design string
	var uni, dv int
	err := db.QueryRowContext(ctx, `SELECT kind, title, doc, hashtags, alt_text, unicode_styles, design, design_version FROM drafts WHERE id = ?`, draftID).
		Scan(&kind, &title, &doc, &tags, &alt, &uni, &design, &dv)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	light, blobs, err := externalize(json.RawMessage(doc))
	if err != nil {
		return err
	}
	if label == VersionAuto {
		var lastDoc, lastTitle, at string
		err := db.QueryRowContext(ctx, `SELECT doc, title, created_at FROM draft_versions WHERE draft_id = ? ORDER BY seq DESC LIMIT 1`, draftID).Scan(&lastDoc, &lastTitle, &at)
		if err == nil {
			if lastDoc == string(light) && lastTitle == title {
				return nil // nothing new
			}
			if t, perr := time.Parse(time.RFC3339, at); perr == nil && versionNow().Sub(t) < autoVersionEvery {
				return nil
			}
		}
	}
	hashes := make([]string, 0, len(blobs))
	for h := range blobs {
		hashes = append(hashes, h)
	}
	hj, _ := json.Marshal(hashes)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for h, data := range blobs {
		mime := strings.TrimSuffix(strings.TrimPrefix(strings.SplitN(data, ",", 2)[0], "data:"), ";base64")
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO doc_blobs (hash, mime, data) VALUES (?, ?, ?)`, h, mime, []byte(data)); err != nil {
			return err
		}
	}
	seq, err := nextSeq(ctx, tx, draftID)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO draft_versions (id, draft_id, seq, label, note, kind, title, doc, hashtags, alt_text, unicode_styles, design, design_version, blobs, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		newID(), draftID, seq, label, note, kind, title, string(light), tags, alt, uni, design, dv, string(hj), actorID(ctx), versionNow().Format(time.RFC3339)); err != nil {
		return err
	}
	if err := prune(ctx, tx, draftID); err != nil {
		return err
	}
	return tx.Commit()
}

// prune keeps the newest maxVersions, dropping the oldest automatic ones first, then forgets pictures nothing uses.
func prune(ctx context.Context, tx *sql.Tx, draftID string) error {
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM draft_versions WHERE draft_id = ?`, draftID).Scan(&n); err != nil {
		return err
	}
	if n <= maxVersions {
		return nil
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM draft_versions WHERE id IN (SELECT id FROM draft_versions WHERE draft_id = ? AND label = ? ORDER BY seq LIMIT ?)`,
		draftID, VersionAuto, n-maxVersions); err != nil {
		return err
	}
	return forgetUnusedPictures(ctx, tx)
}

func forgetUnusedPictures(ctx context.Context, q execer) error {
	rows, err := q.QueryContext(ctx, `SELECT blobs FROM draft_versions`)
	if err != nil {
		return err
	}
	used := map[string]bool{}
	for rows.Next() {
		var js string
		if err := rows.Scan(&js); err != nil {
			rows.Close()
			return err
		}
		var hs []string
		_ = json.Unmarshal([]byte(js), &hs)
		for _, h := range hs {
			used[h] = true
		}
	}
	if err := closeRows(rows); err != nil {
		return err
	}
	all, err := q.QueryContext(ctx, `SELECT hash FROM doc_blobs`)
	if err != nil {
		return err
	}
	var drop []string
	for all.Next() {
		var h string
		if err := all.Scan(&h); err != nil {
			all.Close()
			return err
		}
		if !used[h] {
			drop = append(drop, h)
		}
	}
	if err := closeRows(all); err != nil {
		return err
	}
	for _, h := range drop {
		if _, err := q.ExecContext(ctx, `DELETE FROM doc_blobs WHERE hash = ?`, h); err != nil {
			return err
		}
	}
	return nil
}

// SaveVersion saves the item as it is now, with a note, for a person to come back to.
func (s *Studio) SaveVersion(ctx context.Context, draftID, note string) (Version, error) {
	if _, err := s.GetDraft(ctx, draftID); err != nil {
		return Version{}, err
	}
	note = squash(note)
	if utf8.RuneCountInString(note) > maxVersionNote {
		return Version{}, invalid("the note is limited to %d characters", maxVersionNote)
	}
	if err := snapshotDraft(ctx, s.db, draftID, VersionManual, note); err != nil {
		return Version{}, err
	}
	vs, err := s.Versions(ctx, draftID)
	if err != nil || len(vs) == 0 {
		return Version{}, err
	}
	return vs[0], nil
}

// Versions lists an item's versions, newest first, without their text.
func (s *Studio) Versions(ctx context.Context, draftID string) ([]Version, error) {
	if _, err := s.GetDraft(ctx, draftID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT v.id, v.seq, v.label, v.note, v.kind, v.title, v.created_by,
		COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = v.created_by), ''), v.created_at, substr(v.doc, 1, 4000)
		FROM draft_versions v WHERE v.draft_id = ? ORDER BY v.seq DESC`, draftID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Version{}
	for rows.Next() {
		v := Version{DraftID: draftID}
		var head string
		if err := rows.Scan(&v.ID, &v.Seq, &v.Label, &v.Note, &v.Kind, &v.Title, &v.CreatedBy, &v.CreatedByName, &v.CreatedAt, &head); err != nil {
			return nil, err
		}
		v.Preview = versionPreview(head)
		out = append(out, v)
	}
	return out, rows.Err()
}

// versionPreview is the start of a version's text. The head of a stored text is cut mid-way, so it is read leniently.
func versionPreview(head string) string {
	var b strings.Builder
	rest := head
	for b.Len() < 140 {
		i := strings.Index(rest, `"text":"`)
		if i < 0 {
			break
		}
		rest = rest[i+len(`"text":"`):]
		j := 0
		for j < len(rest) && rest[j] != '"' {
			if rest[j] == '\\' {
				j++
			}
			j++
		}
		if j > len(rest) {
			j = len(rest)
		}
		var piece string
		if err := json.Unmarshal([]byte(`"`+rest[:j]+`"`), &piece); err != nil {
			piece = rest[:j]
		}
		b.WriteString(piece + " ")
		rest = rest[min(j, len(rest)):]
	}
	return cut(squash(b.String()), 140)
}

// Version returns one version in full, pictures included.
func (s *Studio) Version(ctx context.Context, draftID string, seq int) (Version, error) {
	if _, err := s.GetDraft(ctx, draftID); err != nil {
		return Version{}, err
	}
	v := Version{DraftID: draftID, Seq: seq}
	var doc, tags, design string
	var uni, dv int
	err := s.db.QueryRowContext(ctx, `SELECT v.id, v.label, v.note, v.kind, v.title, v.doc, v.hashtags, v.alt_text, v.unicode_styles, v.design, v.design_version, v.created_by,
		COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = v.created_by), ''), v.created_at
		FROM draft_versions v WHERE v.draft_id = ? AND v.seq = ?`, draftID, seq).
		Scan(&v.ID, &v.Label, &v.Note, &v.Kind, &v.Title, &doc, &tags, &v.AltText, &uni, &design, &dv, &v.CreatedBy, &v.CreatedByName, &v.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Version{}, ErrNotFound
	}
	if err != nil {
		return Version{}, err
	}
	if v.Doc, err = internalize(ctx, s.db, json.RawMessage(doc)); err != nil {
		return Version{}, err
	}
	v.UnicodeStyles = uni != 0
	if err := json.Unmarshal([]byte(tags), &v.Hashtags); err != nil || v.Hashtags == nil {
		v.Hashtags = []string{}
	}
	if dv > 0 {
		v.Design = json.RawMessage(design)
	}
	return v, nil
}

// RestoreVersion puts an old version back as the item's content. It is an edit like any other: an approved item goes back
// to draft, and an item with a post waiting cannot be restored. The state before the restore is kept as a version first.
func (s *Studio) RestoreVersion(ctx context.Context, draftID string, seq int) (Draft, error) {
	v, err := s.Version(ctx, draftID, seq)
	if err != nil {
		return Draft{}, err
	}
	cur, err := s.GetDraft(ctx, draftID)
	if err != nil {
		return Draft{}, err
	}
	if cur.Status == StatusScheduled {
		return Draft{}, fmt.Errorf("%w: a post is waiting to be sent from this draft; cancel it before restoring", ErrConflict)
	}
	if err := snapshotDraft(ctx, s.db, draftID, VersionManual, "before restoring version "+fmt.Sprint(seq)); err != nil {
		return Draft{}, err
	}
	in := DraftInput{ProfileID: cur.ProfileID, Kind: v.Kind, Doc: v.Doc, Hashtags: v.Hashtags, AltText: v.AltText, UnicodeStyles: v.UnicodeStyles, Title: v.Title, Design: v.Design}
	d, err := s.UpdateDraft(ctx, draftID, in)
	if err != nil {
		return Draft{}, err
	}
	if err := snapshotDraft(ctx, s.db, draftID, VersionRestored, fmt.Sprintf("from version %d", seq)); err != nil {
		return Draft{}, err
	}
	return d, nil
}

// dropVersions forgets an item's history (when the item is deleted).
func dropVersions(ctx context.Context, q execer, draftID string) error {
	if _, err := q.ExecContext(ctx, `DELETE FROM draft_versions WHERE draft_id = ?`, draftID); err != nil {
		return err
	}
	return forgetUnusedPictures(ctx, q)
}
