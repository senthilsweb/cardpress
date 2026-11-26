package service

// An item's address and description, which its public page uses. They can be written while it is a draft or approved;
// like any change, writing them returns an approved item to draft. Neither is part of a version.

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"
)

// PageFields changes only the fields that are set. An empty value clears one.
type PageFields struct {
	Slug    *string `json:"slug,omitempty"`
	Summary *string `json:"summary,omitempty"`
}

// pageFields checks p against cur and returns the address and description cur would then have.
func (s *Studio) pageFields(ctx context.Context, cur Draft, p PageFields) (slug, summary string, err error) {
	slug, summary = cur.Slug, cur.Summary
	if p.Slug != nil {
		if slug = strings.TrimSpace(*p.Slug); slug != "" && (len(slug) > maxSlugLen || !slugRe.MatchString(slug)) {
			return "", "", invalid("an address is lower-case letters, digits and single hyphens, up to %d characters", maxSlugLen)
		}
		var other int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM drafts WHERE kind = ? AND slug = ? AND slug <> '' AND id <> ?`, cur.Kind, slug, cur.ID).Scan(&other); err != nil {
			return "", "", err
		}
		if other > 0 {
			return "", "", fmt.Errorf("%w: that address is already used", ErrConflict)
		}
	}
	if p.Summary != nil {
		if summary = strings.TrimSpace(*p.Summary); utf8.RuneCountInString(summary) > maxSummary {
			return "", "", invalid("a summary is limited to %d characters", maxSummary)
		}
	}
	return slug, summary, nil
}

// writePageFields stores them for a caller that holds the writing lock and has checked that d may be edited.
func (s *Studio) writePageFields(ctx context.Context, d Draft, slug, summary string) (Draft, error) {
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET slug = ?, summary = ?, revision = revision + 1, `+backToDraft+`, updated_at = ? WHERE id = ?`,
		slug, summary, s.draftStamp(), d.ID); err != nil {
		return d, err
	}
	// neither is part of a version, so the version that held the draft still does
	if _, err := s.db.ExecContext(ctx, `UPDATE draft_versions SET revision = revision + 1 WHERE draft_id = ? AND revision = ?`, d.ID, d.Revision); err != nil {
		return d, err
	}
	out, err := s.GetDraft(ctx, d.ID)
	if err == nil {
		s.changed(out)
	}
	return out, err
}

// SetPageFields changes a person's address and description.
func (s *Studio) SetPageFields(ctx context.Context, id string, p PageFields) (Draft, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	cur, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	slug, summary, err := s.pageFields(ctx, cur, p)
	if err != nil {
		return Draft{}, err
	}
	if slug == cur.Slug && summary == cur.Summary {
		return cur, nil
	}
	if err := editable(cur); err != nil {
		return Draft{}, err
	}
	return s.writePageFields(ctx, cur, slug, summary)
}
