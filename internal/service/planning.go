package service

// The facts that help plan an item and are never sent anywhere: who it is for, what it is about, its campaign, and an
// approver's notes. Changing them is not a change to what was approved, so an item keeps its status.

import (
	"context"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxAudience    = 200
	maxTopic       = 100
	maxCampaign    = 100
	maxReviewNotes = 2000
)

// PlanningPatch changes only the planning fields that are set.
type PlanningPatch struct {
	Audience    *string `json:"audience,omitempty"`
	Topic       *string `json:"topic,omitempty"`
	Campaign    *string `json:"campaign,omitempty"`
	ReviewNotes *string `json:"reviewNotes,omitempty"`
}

// check trims the fields and refuses what may not be stored.
func (p *PlanningPatch) check() error {
	for _, f := range []struct {
		name  string
		v     **string
		max   int
		lines bool
	}{{"audience", &p.Audience, maxAudience, false}, {"topic", &p.Topic, maxTopic, false}, {"campaign", &p.Campaign, maxCampaign, false}, {"reviewNotes", &p.ReviewNotes, maxReviewNotes, true}} {
		if *f.v == nil {
			continue
		}
		s := strings.TrimSpace(strings.ReplaceAll(**f.v, "\r\n", "\n"))
		if utf8.RuneCountInString(s) > f.max {
			return invalid("%s is limited to %d characters", f.name, f.max)
		}
		for _, r := range s {
			if unicode.IsControl(r) && !(f.lines && (r == '\n' || r == '\t')) {
				if f.lines {
					return invalid("%s holds a character that cannot be stored", f.name)
				}
				return invalid("%s is one line of plain text", f.name)
			}
		}
		*f.v = &s
	}
	return nil
}

// differs keeps only the fields that would change d.
func (p PlanningPatch) differs(d Draft) PlanningPatch {
	keep := func(v *string, cur string) *string {
		if v == nil || *v == cur {
			return nil
		}
		return v
	}
	return PlanningPatch{keep(p.Audience, d.Audience), keep(p.Topic, d.Topic), keep(p.Campaign, d.Campaign), keep(p.ReviewNotes, d.ReviewNotes)}
}

func (p PlanningPatch) empty() bool { return p == PlanningPatch{} }

// versioned reports whether a field that versions hold is among those set.
func (p PlanningPatch) versioned() bool {
	return p.Audience != nil || p.Topic != nil || p.Campaign != nil
}

func (s *Studio) writePlanning(ctx context.Context, id string, p PlanningPatch) error {
	_, err := s.db.ExecContext(ctx, `UPDATE drafts SET audience = COALESCE(?, audience), topic = COALESCE(?, topic), campaign = COALESCE(?, campaign), review_notes = COALESCE(?, review_notes), updated_at = ? WHERE id = ?`,
		p.Audience, p.Topic, p.Campaign, p.ReviewNotes, s.draftStamp(), id)
	return err
}

// SetPlanning changes a person's planning fields. It is allowed at any status, since none of them is published. Review
// notes are written by someone who may approve.
func (s *Studio) SetPlanning(ctx context.Context, id string, p PlanningPatch) (Draft, error) {
	if err := p.check(); err != nil {
		return Draft{}, err
	}
	s.writing.Lock()
	defer s.writing.Unlock()
	cur, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if p = p.differs(cur); p.empty() {
		return cur, nil
	}
	if who, ok := PrincipalFrom(ctx); ok && p.ReviewNotes != nil && !who.Can(PermApprove) {
		return Draft{}, ErrForbidden
	}
	if err := s.writePlanning(ctx, id, p); err != nil {
		return Draft{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET revision = revision + 1 WHERE id = ?`, id); err != nil {
		return Draft{}, err
	}
	// notes are in no version, so the version that held the draft still does
	if !p.versioned() {
		if _, err := s.db.ExecContext(ctx, `UPDATE draft_versions SET revision = revision + 1 WHERE draft_id = ? AND revision = ?`, id, cur.Revision); err != nil {
			return Draft{}, err
		}
	}
	d, err := s.GetDraft(ctx, id)
	if err == nil {
		s.changed(d)
	}
	return d, err
}

// updateWithPlanning saves content and planning fields together as one change, for a caller that holds the writing lock
// and has checked that cur may be edited. Whatever differs ends up in the version it saves.
func (s *Studio) updateWithPlanning(ctx context.Context, cur Draft, in DraftInput, p PlanningPatch, label, note string) (Draft, error) {
	if err := p.check(); err != nil {
		return Draft{}, err
	}
	p = p.differs(cur)
	if !p.empty() {
		probe := in
		if err := probe.normalize(); err != nil { // nothing is stored when the rest would be refused
			return Draft{}, err
		}
		if err := s.writePlanning(ctx, cur.ID, p); err != nil {
			return Draft{}, err
		}
	}
	d, err := s.updateDraft(ctx, cur.ID, in, label, note)
	if err != nil || p.empty() || d.Revision != cur.Revision {
		return d, err
	}
	// only planning fields changed
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET revision = revision + 1 WHERE id = ?`, cur.ID); err != nil {
		return d, err
	}
	if label != "" {
		if err := snapshotDraft(ctx, s.db, cur.ID, label, note); err != nil {
			return d, err
		}
	}
	if d, err = s.GetDraft(ctx, cur.ID); err == nil {
		s.changed(d)
	}
	return d, err
}
