package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// A brand is a profile: an identity (name, handle, logo, fonts, colours) with its own designs, drafts, conversations,
// publishing queue and social credentials. These operations change one brand at a time. Removing one is two steps:
// archive (reversible, keeps everything) and then delete from the archive.

// inFlight are the job statuses a brand must not be deleted under: the post is waiting, running, or may be live.
var inFlight = []string{JobScheduled, JobPublishing, JobNeedsReview}

func profileHead(raw json.RawMessage) (string, error) {
	var head struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &head); err != nil || head.ID == "" {
		return "", invalid("a profile must be a JSON object with a non-empty id")
	}
	if len(raw) > maxDocBytes {
		return "", invalid("the profile is too large")
	}
	return head.ID, nil
}

// CreateProfile adds a new brand at the end. The caller builds the profile (blank, or a copy of another brand's identity,
// colours and fonts with a new id); credentials, drafts and posts are never copied because they are not part of it.
func (s *Studio) CreateProfile(ctx context.Context, raw json.RawMessage) error {
	id, err := profileHead(raw)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles WHERE id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: a brand with id %q already exists", ErrConflict, id)
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles WHERE owner_id = ?`, actorID(ctx)).Scan(&n); err != nil {
		return err
	}
	if n >= maxBrandsPerPerson {
		return invalid("too many brands (max %d)", maxBrandsPerPerson)
	}
	if err := upsertProfile(ctx, tx, id, raw, s.stamp(), actorID(ctx)); err != nil {
		return err
	}
	return tx.Commit()
}

// SaveProfile updates one existing brand.
func (s *Studio) SaveProfile(ctx context.Context, id string, raw json.RawMessage) error {
	got, err := profileHead(raw)
	if err != nil {
		return err
	}
	if got != id {
		return invalid("the profile id %q does not match %q", got, id)
	}
	if err := brandVisible(ctx, s.db, id); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `UPDATE profiles SET data = ?, updated_at = ? WHERE id = ?`, string(raw), s.stamp(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderProfiles puts the active brands in the given order. It must name every active brand exactly once.
func (s *Studio) ReorderProfiles(ctx context.Context, ids []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	scope, scopeArgs := brandScope(ctx)
	rows, err := tx.QueryContext(ctx, `SELECT id FROM profiles WHERE archived_at IS NULL`+scope, scopeArgs...)
	if err != nil {
		return err
	}
	active := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		active[id] = true
	}
	if err := closeRows(rows); err != nil {
		return err
	}
	if len(ids) != len(active) {
		return invalid("the order must list every brand once")
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if !active[id] || seen[id] {
			return invalid("the order must list every brand once")
		}
		seen[id] = true
	}
	for i, id := range ids { // positions are global, so a person's order only has to be consistent among their own brands
		if _, err := tx.ExecContext(ctx, `UPDATE profiles SET position = ? WHERE id = ?`, i, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ArchiveResult says what archiving left behind.
type ArchiveResult struct {
	// Scheduled is how many of the brand's posts are still scheduled. Archiving does not cancel them: they go out with
	// the brand's own credentials, so the caller should say so.
	Scheduled int `json:"scheduled"`
}

// ArchiveProfile hides a brand and keeps everything it owns. The last active brand cannot be archived.
func (s *Studio) ArchiveProfile(ctx context.Context, id string) (ArchiveResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ArchiveResult{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	if err := brandVisible(ctx, tx, id); err != nil {
		return ArchiveResult{}, err
	}
	var archived sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT archived_at FROM profiles WHERE id = ?`, id).Scan(&archived); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ArchiveResult{}, ErrNotFound
		}
		return ArchiveResult{}, err
	}
	if archived.Valid {
		return ArchiveResult{}, nil // already archived
	}
	var active int
	scope, scopeArgs := brandScope(ctx)
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles WHERE archived_at IS NULL`+scope, scopeArgs...).Scan(&active); err != nil {
		return ArchiveResult{}, err
	}
	if active <= 1 {
		return ArchiveResult{}, fmt.Errorf("%w: keep at least one brand", ErrConflict)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE profiles SET archived_at = ?, updated_at = ? WHERE id = ?`, s.stamp(), s.stamp(), id); err != nil {
		return ArchiveResult{}, err
	}
	var res ArchiveResult
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM publish_jobs WHERE profile_id = ? AND status = ?`, id, JobScheduled).Scan(&res.Scheduled); err != nil {
		return ArchiveResult{}, err
	}
	return res, tx.Commit()
}

// RestoreProfile brings an archived brand back, at the end of the list.
func (s *Studio) RestoreProfile(ctx context.Context, id string) error {
	if err := brandVisible(ctx, s.db, id); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE profiles SET archived_at = NULL, position = (SELECT COALESCE(MAX(position), -1) + 1 FROM profiles), updated_at = ? WHERE id = ? AND archived_at IS NOT NULL`,
		s.stamp(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var one int
		if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM profiles WHERE id = ?`, id).Scan(&one); err != nil {
			return ErrNotFound
		}
	}
	return nil
}

// DeleteProfile permanently removes an archived brand with its designs, drafts, conversations, publishing history and
// credentials. It is refused while the brand has a post that is scheduled, running or of unknown outcome.
func (s *Studio) DeleteProfile(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if err := brandVisible(ctx, tx, id); err != nil {
		return err
	}
	var archived sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT archived_at FROM profiles WHERE id = ?`, id).Scan(&archived); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if !archived.Valid {
		return fmt.Errorf("%w: archive the brand first; only an archived brand can be deleted", ErrConflict)
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(inFlight)), ",")
	args := []any{id}
	for _, st := range inFlight {
		args = append(args, st)
	}
	var busy int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM publish_jobs WHERE profile_id = ? AND status IN (`+marks+`)`, args...).Scan(&busy); err != nil {
		return err
	}
	if busy > 0 {
		return fmt.Errorf("%w: the brand has %d scheduled or unfinished post(s); cancel them or resolve them first", ErrConflict, busy)
	}
	// The environment brand (see Settings.EnvProfile) is deliberately left pointing at this id: moving it to another brand
	// would make the environment credentials post as a different account.
	for _, q := range []string{
		`DELETE FROM proposals WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM chat_changes WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM choices WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM conversation_sources WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM chat_usage WHERE conversation_id IN (SELECT id FROM conversations WHERE profile_id = ?)`,
		`DELETE FROM conversations WHERE profile_id = ?`,
		`DELETE FROM publish_attempts WHERE job_id IN (SELECT id FROM publish_jobs WHERE profile_id = ?)`,
		`DELETE FROM job_images WHERE job_id IN (SELECT id FROM publish_jobs WHERE profile_id = ?)`,
		`DELETE FROM publish_jobs WHERE profile_id = ?`,
		`DELETE FROM draft_images WHERE draft_id IN (SELECT id FROM drafts WHERE profile_id = ?)`,
		`DELETE FROM draft_versions WHERE draft_id IN (SELECT id FROM drafts WHERE profile_id = ?)`,
		`DELETE FROM drafts WHERE profile_id = ?`,
		`DELETE FROM designs WHERE profile_id = ?`,
		`DELETE FROM agent_memories WHERE profile_id = ?`,
		`DELETE FROM credentials WHERE profile_id = ?`,
		`DELETE FROM brand_details WHERE profile_id = ?`,
		`DELETE FROM assets WHERE profile_id = ?`,
		`DELETE FROM profiles WHERE id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	// files only the deleted brand used
	if _, err := tx.ExecContext(ctx, dropOrphans); err != nil {
		return err
	}
	return tx.Commit()
}
