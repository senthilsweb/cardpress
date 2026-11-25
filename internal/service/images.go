package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// A post can carry several pictures in place of the card. LinkedIn shows two or more as a grid; one alone is sent as an
// ordinary image post.

// AttachImages is the attachment kind of a post with a set of pictures.
const AttachImages = "images"

// maxPostImages is lower than LinkedIn's 20: every picture is stored twice (with the draft and with the job).
const maxPostImages = 10

// DraftImage describes one picture of a set. The bytes are fetched separately.
type DraftImage struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	AltText string `json:"altText"`
}

// imagesOf lists the pictures of the given drafts, in order, keyed by draft.
func imagesOf(ctx context.Context, db *sql.DB, where string, args ...any) (map[string][]DraftImage, error) {
	rows, err := db.QueryContext(ctx, `SELECT draft_id, id, type, alt_text FROM draft_images WHERE `+where+` ORDER BY draft_id, position, id`, args...)
	if err != nil {
		return nil, err
	}
	out := map[string][]DraftImage{}
	for rows.Next() {
		var draft string
		var im DraftImage
		if err := rows.Scan(&draft, &im.ID, &im.Type, &im.AltText); err != nil {
			rows.Close()
			return nil, err
		}
		out[draft] = append(out[draft], im)
	}
	return out, closeRows(rows)
}

// AddImage adds a picture (PNG or JPEG) to the end of a post's set. The first one turns the post's attachment into a
// set, replacing a single picture or a document; the card is kept.
func (s *Studio) AddImage(ctx context.Context, id string, data []byte) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	typ := fileType(data)
	if kind, _ := attachmentKind(typ); kind != AttachImage || len(data) > maxImageBytes {
		return Draft{}, invalid("each picture must be a PNG or JPEG of at most %d MB", maxImageBytes>>20)
	}
	if len(d.Images) >= maxPostImages {
		return Draft{}, invalid("a post can carry at most %d pictures", maxPostImages)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Draft{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx, `INSERT INTO draft_images (id, draft_id, position, data, type, created_at)
		VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM draft_images WHERE draft_id = ?), ?, ?, ?)`, newID(), id, id, data, typ, s.draftStamp()); err != nil {
		return Draft{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE drafts SET attachment_kind = ?, attachment = NULL, attachment_type = '', attachment_title = '', video_url = '', video_size = 0, `+backToDraft+`, updated_at = ? WHERE id = ?`,
		AttachImages, s.draftStamp(), id); err != nil {
		return Draft{}, err
	}
	if err := tx.Commit(); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// RemoveImage takes one picture out of the set. Removing the last one goes back to the card.
func (s *Studio) RemoveImage(ctx context.Context, id, imageID string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM draft_images WHERE id = ? AND draft_id = ?`, imageID, id)
	if err != nil {
		return Draft{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Draft{}, ErrNotFound
	}
	kind := AttachImages
	if len(d.Images) <= 1 {
		kind = AttachCard
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET attachment_kind = ?, `+backToDraft+`, updated_at = ? WHERE id = ?`, kind, s.draftStamp(), id); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// SetImageAlt sets one picture's description.
func (s *Studio) SetImageAlt(ctx context.Context, id, imageID, alt string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	alt = strings.TrimSpace(alt)
	if utf8.RuneCountInString(alt) > maxAltText {
		return Draft{}, invalid("altText is limited to %d characters", maxAltText)
	}
	for _, im := range d.Images {
		if im.ID != imageID {
			continue
		}
		if im.AltText == alt {
			return d, nil
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE draft_images SET alt_text = ? WHERE id = ? AND draft_id = ?`, alt, imageID, id); err != nil {
			return Draft{}, err
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET `+backToDraft+`, updated_at = ? WHERE id = ?`, s.draftStamp(), id); err != nil {
			return Draft{}, err
		}
		return s.GetDraft(ctx, id)
	}
	return Draft{}, ErrNotFound
}

// OrderImages puts the pictures in the given order. It must name every picture of the set exactly once.
func (s *Studio) OrderImages(ctx context.Context, id string, ids []string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	have := map[string]bool{}
	same := len(ids) == len(d.Images)
	for i, im := range d.Images {
		have[im.ID] = true
		same = same && ids[i] == im.ID
	}
	seen := map[string]bool{}
	for _, x := range ids {
		if !have[x] || seen[x] {
			return Draft{}, invalid("the order must list every picture once")
		}
		seen[x] = true
	}
	if len(ids) != len(d.Images) {
		return Draft{}, invalid("the order must list every picture once")
	}
	if same {
		return d, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Draft{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	for i, x := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE draft_images SET position = ? WHERE id = ? AND draft_id = ?`, i, x, id); err != nil {
			return Draft{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE drafts SET `+backToDraft+`, updated_at = ? WHERE id = ?`, s.draftStamp(), id); err != nil {
		return Draft{}, err
	}
	if err := tx.Commit(); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// ImageFile returns one picture of a post's set and its media type.
func (s *Studio) ImageFile(ctx context.Context, id, imageID string) ([]byte, string, error) {
	var data []byte
	var typ string
	err := s.db.QueryRowContext(ctx, `SELECT data, type FROM draft_images WHERE id = ? AND draft_id = ?`, imageID, id).Scan(&data, &typ)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	return data, typ, err
}

// copyImagesToJob gives a job its own copy of the draft's pictures, inside the database, so no picture passes through
// the server's memory. It returns how many there are.
func copyImagesToJob(ctx context.Context, tx *sql.Tx, draftID, jobID string) (int, error) {
	res, err := tx.ExecContext(ctx, `INSERT INTO job_images (job_id, position, data, type, alt_text)
		SELECT ?, ROW_NUMBER() OVER (ORDER BY position, id) - 1, data, type, alt_text FROM draft_images WHERE draft_id = ?`, jobID, draftID)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

// jobImage reads one picture of a job, by its place in the order.
func jobImage(ctx context.Context, db *sql.DB, jobID string, position int) ([]byte, error) {
	var data []byte
	err := db.QueryRowContext(ctx, `SELECT data FROM job_images WHERE job_id = ? AND position = ?`, jobID, position).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("picture %d of the post is missing", position+1)
	}
	return data, err
}
