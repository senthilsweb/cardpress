package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrNotFound is returned when an id does not exist.
var ErrNotFound = errors.New("not found")

const (
	KindPost    = "post"
	KindArticle = "article"

	// A draft is written, then approved, then sent. Editing an approved or published draft returns it to draft.
	StatusDraft     = "draft"
	StatusApproved  = "approved"
	StatusScheduled = "scheduled" // a publish job is waiting for it, or running
	StatusPublished = "published"

	maxDocBytesDraft = 25 << 20 // an article keeps its images inside its text, as base64
	maxTitle         = 200
	maxHashtags      = 30
	maxAltText       = 1000
	draftTimeLayout  = "2006-01-02T15:04:05.000Z"
)

var hashtagRe = regexp.MustCompile(`^[\p{L}\p{N}_]{1,100}$`)

// Draft is the content of one post or article.
type Draft struct {
	ID string `json:"id"`
	// Revision moves with every change to what the draft says or shows.
	Revision      int             `json:"revision"`
	ProfileID     string          `json:"profileId"`
	Kind          string          `json:"kind"`
	Status        string          `json:"status"`
	Doc           json.RawMessage `json:"doc"` // rich-text document (TipTap/ProseMirror JSON)
	Hashtags      []string        `json:"hashtags"`
	AltText       string          `json:"altText"`
	UnicodeStyles bool            `json:"unicodeStyles"`
	Title         string          `json:"title"`
	// Design is the card this item was made with (see CardDesign); absent until one is saved.
	Design      json.RawMessage `json:"design,omitempty"`
	ApprovedAt  string          `json:"approvedAt,omitempty"`
	ScheduledAt string          `json:"scheduledAt,omitempty"` // an article's planned date
	Timezone    string          `json:"timezone,omitempty"`
	// The public page: its address, description, when it went live, and whether it has a preview image.
	Slug     string `json:"slug,omitempty"`
	Summary  string `json:"summary,omitempty"`
	PageAt   string `json:"pageAt,omitempty"`
	HasCover bool   `json:"hasCover"`
	// Attachment is what a post goes out with: "card" (the designed card), "image" (a picture of its own) or
	// "document" (a PDF of its own, which has a title).
	Attachment      string `json:"attachment"`
	AttachmentTitle string `json:"attachmentTitle,omitempty"`
	// VideoURL is the public address of a post whose attachment is "video", and VideoSize the file's size when checked.
	VideoURL  string `json:"videoUrl,omitempty"`
	VideoSize int64  `json:"videoSize,omitempty"`
	// AttachmentSize is the bytes of a post's own picture or document.
	AttachmentSize int64 `json:"attachmentSize,omitempty"`
	// Images are the pictures of a post whose attachment is "images", in order.
	Images []DraftImage `json:"images,omitempty"`
	// Who wrote it and who approved it (ids, and the names for showing).
	CreatedBy      string `json:"createdBy,omitempty"`
	CreatedByName  string `json:"createdByName,omitempty"`
	ApprovedBy     string `json:"approvedBy,omitempty"`
	ApprovedByName string `json:"approvedByName,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	// Version is the newest version's number; VersionIsCurrent is false when the draft changed after it was saved.
	Version          int  `json:"version"`
	VersionIsCurrent bool `json:"versionIsCurrent"`
}

// DraftInput is what a caller may set. Status is controlled by the server.
type DraftInput struct {
	ProfileID     string          `json:"profileId"`
	Kind          string          `json:"kind"`
	Doc           json.RawMessage `json:"doc"`
	Hashtags      []string        `json:"hashtags"`
	AltText       string          `json:"altText"`
	UnicodeStyles bool            `json:"unicodeStyles"`
	Title         string          `json:"title"`
	// Design is optional: on create it starts the item with a card, on update leaving it out keeps the saved one.
	Design json.RawMessage `json:"design"`
	// Revision, when given on update, is the one the writer read: an older one is refused.
	Revision int `json:"revision"`

	design string // Design in its stored form, empty when none was sent
}

func (in *DraftInput) normalize() error {
	if in.ProfileID == "" {
		return invalid("profileId is required")
	}
	if in.Kind != KindPost && in.Kind != KindArticle {
		return invalid("kind must be %q or %q", KindPost, KindArticle)
	}
	if len(in.Doc) == 0 || len(in.Doc) > maxDocBytesDraft {
		return invalid("doc is required and must be under %d bytes", maxDocBytesDraft)
	}
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(in.Doc, &head); err != nil || head.Type != "doc" {
		return invalid(`doc must be a JSON object with "type": "doc"`)
	}
	if utf8.RuneCountInString(in.AltText) > maxAltText {
		return invalid("altText is limited to %d characters", maxAltText)
	}
	tags, err := normalizeHashtags(in.Hashtags)
	if err != nil {
		return err
	}
	in.Hashtags = tags
	in.Title = strings.TrimSpace(in.Title)
	if utf8.RuneCountInString(in.Title) > maxTitle {
		return invalid("title is limited to %d characters", maxTitle)
	}
	if t := bytes.TrimSpace(in.Design); len(t) > 0 && string(t) != "null" {
		if in.design, err = normalizeDesign(t); err != nil {
			return err
		}
	}
	return nil
}

// normalizeHashtags strips a leading #, drops duplicates (case-insensitive) and rejects anything that is not a word.
func normalizeHashtags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.TrimPrefix(strings.TrimSpace(t), "#")
		if !hashtagRe.MatchString(t) {
			return nil, invalid("%q is not a valid hashtag (letters, digits and underscores only)", t)
		}
		if k := strings.ToLower(t); !seen[k] {
			seen[k] = true
			out = append(out, t)
		}
	}
	if len(out) > maxHashtags {
		return nil, invalid("too many hashtags (max %d)", maxHashtags)
	}
	return out, nil
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Studio) draftStamp() string { return s.now().UTC().Format(draftTimeLayout) }

// draftCols is what a draft is read with; the cover image itself is left out (it is large) and only whether there is one is read.
const draftCols = `id, revision, profile_id, kind, status, doc, hashtags, alt_text, unicode_styles, title, design, design_version, approved_at, scheduled_at, timezone, slug, summary, page_at, (cover IS NOT NULL), attachment_kind, attachment_title, video_url, video_size, COALESCE(length(attachment), 0), created_by, approved_by,
	COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = created_by), ''), COALESCE((SELECT first_name || ' ' || last_name FROM users u WHERE u.id = approved_by), ''), created_at, updated_at,
	COALESCE((SELECT MAX(seq) FROM draft_versions v WHERE v.draft_id = drafts.id), 0),
	COALESCE((SELECT v.revision = drafts.revision FROM draft_versions v WHERE v.draft_id = drafts.id ORDER BY v.seq DESC LIMIT 1), 0)`

// draftInsertCols are the columns a new draft sets; the rest start empty.
const draftInsertCols = `id, profile_id, kind, status, doc, hashtags, alt_text, unicode_styles, title, design, design_version, approved_at, scheduled_at, timezone, created_by, created_at, updated_at`

type scanner interface{ Scan(...any) error }

func scanDraft(r scanner) (Draft, error) {
	var d Draft
	var doc, tags, design string
	var uni, designVersion, cover int
	if err := r.Scan(&d.ID, &d.Revision, &d.ProfileID, &d.Kind, &d.Status, &doc, &tags, &d.AltText, &uni, &d.Title, &design, &designVersion,
		&d.ApprovedAt, &d.ScheduledAt, &d.Timezone, &d.Slug, &d.Summary, &d.PageAt, &cover, &d.Attachment, &d.AttachmentTitle, &d.VideoURL, &d.VideoSize, &d.AttachmentSize, &d.CreatedBy, &d.ApprovedBy, &d.CreatedByName, &d.ApprovedByName, &d.CreatedAt, &d.UpdatedAt, &d.Version, &d.VersionIsCurrent); err != nil {
		return d, err
	}
	d.Doc = json.RawMessage(doc)
	d.HasCover = cover != 0
	if designVersion > 0 {
		d.Design = json.RawMessage(design)
	}
	d.UnicodeStyles = uni != 0
	if err := json.Unmarshal([]byte(tags), &d.Hashtags); err != nil || d.Hashtags == nil {
		d.Hashtags = []string{}
	}
	return d, nil
}

// CreateDraft stores a new draft.
func (s *Studio) CreateDraft(ctx context.Context, in DraftInput) (Draft, error) {
	if err := in.normalize(); err != nil {
		return Draft{}, err
	}
	tags, _ := json.Marshal(in.Hashtags)
	at := s.draftStamp()
	id, design, version := newID(), "{}", 0
	if in.design != "" {
		design, version = in.design, CardDesignVersion
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO drafts (`+draftInsertCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?)`,
		id, in.ProfileID, in.Kind, StatusDraft, string(in.Doc), string(tags), in.AltText, boolInt(in.UnicodeStyles), in.Title, design, version, actorID(ctx), at, at)
	if err != nil {
		return Draft{}, err
	}
	_ = snapshotDraft(ctx, s.db, id, VersionCreated, "") // history is a convenience: it never blocks saving
	d, err := s.GetDraft(ctx, id)
	if err == nil {
		s.changed(d)
	}
	return d, err
}

// UpdateDraft replaces a draft's content. Its profile does not change. If the content changed, an approved or published
// draft goes back to draft, so what was approved is always what goes out; saving the same content again changes nothing.
// A draft with a post waiting to be sent cannot be edited: cancel it first.
func (s *Studio) UpdateDraft(ctx context.Context, id string, in DraftInput) (Draft, error) {
	s.writing.Lock()
	defer s.writing.Unlock()
	return s.updateDraft(ctx, id, in, VersionAuto, "")
}

// changed tells open studios about a draft.
func (s *Studio) changed(d Draft) {
	s.Events.Publish(Event{Type: "draft", ProfileID: d.ProfileID, DraftID: d.ID, Revision: d.Revision})
}

// updateDraft is UpdateDraft for a caller that holds the writing lock.
func (s *Studio) updateDraft(ctx context.Context, id string, in DraftInput, label, note string) (Draft, error) {
	if err := in.normalize(); err != nil {
		return Draft{}, err
	}
	cur, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if cur.Status == StatusScheduled {
		return Draft{}, editable(cur)
	}
	if in.Revision != 0 && in.Revision != cur.Revision {
		return Draft{}, ErrStale
	}
	design := string(cur.Design)
	version := 0
	if len(cur.Design) > 0 {
		version = CardDesignVersion
	}
	if in.design != "" {
		design, version = in.design, CardDesignVersion
	} else if version == 0 {
		design = "{}"
	}
	changed := cur.Kind != in.Kind || cur.AltText != in.AltText || cur.UnicodeStyles != in.UnicodeStyles || cur.Title != in.Title ||
		!reflect.DeepEqual(cur.Hashtags, in.Hashtags) || !sameJSON(cur.Doc, in.Doc) || (in.design != "" && !sameJSON(cur.Design, json.RawMessage(in.design)))
	// a published item stays as it was published until the person brings it back to draft; saving it unchanged is harmless
	if changed {
		if err := editable(cur); err != nil {
			return Draft{}, err
		}
	}
	status, approved, planned, zone := cur.Status, cur.ApprovedAt, cur.ScheduledAt, cur.Timezone
	takeOffline := false
	if changed && (status == StatusApproved || status == StatusPublished) {
		status, approved, planned, zone = StatusDraft, "", "", ""
		takeOffline = true
	}
	tags, _ := json.Marshal(in.Hashtags)
	at := s.draftStamp()
	_, err = s.db.ExecContext(ctx,
		`UPDATE drafts SET kind = ?, doc = ?, hashtags = ?, alt_text = ?, unicode_styles = ?, title = ?, design = ?, design_version = ?,
		        status = ?, approved_at = ?, scheduled_at = ?, timezone = ?, updated_at = ?, revision = revision + ? WHERE id = ?`,
		in.Kind, string(in.Doc), string(tags), in.AltText, boolInt(in.UnicodeStyles), in.Title, design, version,
		status, approved, planned, zone, at, boolInt(changed), id)
	if err != nil {
		return Draft{}, err
	}
	if changed {
		_ = snapshotDraft(ctx, s.db, id, label, note)
	}
	if takeOffline {
		// the public page must always show the approved text: a change takes it down until it is approved and published again
		if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET page_at = '', cover = NULL, approved_by = '' WHERE id = ?`, id); err != nil {
			return Draft{}, err
		}
	}
	d, err := s.GetDraft(ctx, id)
	if err == nil && changed {
		s.changed(d)
	}
	return d, err
}

// editable refuses a change to an item that is waiting to be sent or is published (sent, or with a live page).
func editable(d Draft) error {
	switch {
	case d.Status == StatusScheduled:
		return fmt.Errorf("%w: a post is waiting to be sent from this draft; cancel it before changing it", ErrConflict)
	case d.Status == StatusPublished || d.PageAt != "":
		return fmt.Errorf("%w: this %s is published; bring it back to draft to change it", ErrConflict, d.Kind)
	}
	return nil
}

// sameJSON reports whether two JSON values mean the same, whatever their spacing or key order.
func sameJSON(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	return reflect.DeepEqual(x, y)
}

// Approve marks a draft as final. Only an approved draft can be published or scheduled.
func (s *Studio) Approve(ctx context.Context, id string) (Draft, error) {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	switch d.Status {
	case StatusApproved:
		return d, nil
	case StatusScheduled:
		return Draft{}, fmt.Errorf("%w: a post is already waiting to be sent from this draft", ErrConflict)
	case StatusPublished:
		return Draft{}, fmt.Errorf("%w: this draft was already published; edit it to make a new version", ErrConflict)
	}
	if strings.TrimSpace(DraftText(d.Doc)) == "" {
		return Draft{}, invalid("there is nothing to approve: the text is empty")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE drafts SET status = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ? AND status = ?`,
		StatusApproved, s.draftStamp(), actorID(ctx), s.draftStamp(), id, StatusDraft)
	if err != nil {
		return Draft{}, err
	}
	_ = snapshotDraft(ctx, s.db, id, VersionApproved, "")
	return s.GetDraft(ctx, id)
}

// Unapprove returns an approved or published draft to draft, so it can be changed.
func (s *Studio) Unapprove(ctx context.Context, id string) (Draft, error) {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Status == StatusScheduled {
		return Draft{}, fmt.Errorf("%w: a post is waiting to be sent from this draft; cancel it first", ErrConflict)
	}
	if d.Status == StatusDraft {
		return d, nil
	}
	_, err = s.db.ExecContext(ctx, `UPDATE drafts SET status = ?, approved_at = '', approved_by = '', scheduled_at = '', timezone = '', page_at = '', cover = NULL, updated_at = ? WHERE id = ?`,
		StatusDraft, s.draftStamp(), id)
	if err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// Plan sets or clears the planned date of an approved article. Nothing is sent: CardPress cannot publish an article, so
// the date is a reminder and a way to order the list. A post is scheduled by publishing it for later.
func (s *Studio) Plan(ctx context.Context, id string, at *time.Time, timezone string) (Draft, error) {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Kind != KindArticle {
		return Draft{}, invalid("only an article has a planned date; schedule a post from its preview")
	}
	if d.Status != StatusApproved {
		return Draft{}, fmt.Errorf("%w: approve the article before planning a date", ErrConflict)
	}
	when, zone := "", ""
	if at != nil {
		if _, err := time.LoadLocation(timezone); err != nil || timezone == "" {
			return Draft{}, invalid("timezone must be an IANA zone such as Europe/London")
		}
		when, zone = at.UTC().Format(time.RFC3339), timezone
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET scheduled_at = ?, timezone = ? WHERE id = ?`, when, zone, id); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// GetDraft returns one draft.
func (s *Studio) GetDraft(ctx context.Context, id string) (Draft, error) {
	d, err := scanDraft(s.db.QueryRowContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Draft{}, ErrNotFound
	}
	if err != nil {
		return d, err
	}
	if d.Attachment == AttachImages {
		ims, err := imagesOf(ctx, s.db, `draft_id = ?`, id)
		if err != nil {
			return d, err
		}
		d.Images = ims[id]
	}
	return d, nil
}

// ListDrafts returns a profile's drafts, most recently changed first.
func (s *Studio) ListDrafts(ctx context.Context, profileID string) ([]Draft, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+draftCols+` FROM drafts WHERE profile_id = ? ORDER BY updated_at DESC, id`, profileID)
	if err != nil {
		return nil, err
	}
	out := []Draft{}
	for rows.Next() {
		d, err := scanDraft(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, d)
	}
	if err := closeRows(rows); err != nil {
		return nil, err
	}
	ims, err := imagesOf(ctx, s.db, `draft_id IN (SELECT id FROM drafts WHERE profile_id = ?)`, profileID)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Images = ims[out[i].ID]
	}
	return out, nil
}

// DeleteDraft removes a draft and its history. An item that is approved, waiting to be sent or posted must be brought
// back to draft first, so nothing that has been signed off or has gone out is deleted by one click.
func (s *Studio) DeleteDraft(ctx context.Context, id string) error {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return err
	}
	if d.Status != StatusDraft {
		return fmt.Errorf("%w: bring this %s back to draft before deleting it", ErrConflict, d.Kind)
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM drafts WHERE id = ?`, id); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM draft_images WHERE draft_id = ?`, id); err != nil {
		return err
	}
	// a conversation that was about it stays, without it
	for _, q := range []string{`UPDATE conversations SET post_draft_id = '' WHERE post_draft_id = ?`, `UPDATE conversations SET article_draft_id = '' WHERE article_draft_id = ?`} {
		if _, err := s.db.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	return dropVersions(ctx, s.db, id)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

/* ------------------------------------------------------------------ a post's own file */

// Attachment kinds.
const (
	AttachCard     = "card"
	AttachImage    = "image"
	AttachDocument = "document"
)

const (
	// maxDocumentBytes is well under LinkedIn's 100 MB: the file is held in memory on its way in and out, and a small
	// server has little.
	maxDocumentBytes   = 20 << 20
	maxAttachmentTitle = 150
)

var (
	jpegSignature = []byte("\xff\xd8\xff")
	pdfSignature  = []byte("%PDF-")
)

// fileType says what data is, by its first bytes: image/png, image/jpeg, application/pdf, or "" for anything else. The
// name and the type a browser sent are not trusted.
func fileType(data []byte) string {
	switch {
	case bytes.HasPrefix(data, pngSignature):
		return "image/png"
	case bytes.HasPrefix(data, jpegSignature):
		return "image/jpeg"
	case bytes.HasPrefix(data, pdfSignature):
		return "application/pdf"
	}
	return ""
}

// attachmentKind is the kind a file of this type is sent as, and its size limit ("" when the type is not accepted).
func attachmentKind(typ string) (kind string, limit int) {
	switch typ {
	case "image/png", "image/jpeg":
		return AttachImage, maxImageBytes
	case "application/pdf":
		return AttachDocument, maxDocumentBytes
	}
	return "", 0
}

// attachmentChange is the check before a post's attachment changes, and the step back to draft: what was approved is
// what goes out, so an approved or published post must be approved again.
func (s *Studio) attachmentChange(ctx context.Context, id string) (Draft, error) {
	d, err := s.GetDraft(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Kind != KindPost {
		return Draft{}, invalid("only a post has an attachment")
	}
	if err := editable(d); err != nil {
		return Draft{}, err
	}
	return d, nil
}

// SetAttachment gives a post a file of its own to go out in place of the card: a picture (PNG or JPEG) or a document
// (PDF). The card is kept. name is the file's name; a document's title starts as that name without its ending.
func (s *Studio) SetAttachment(ctx context.Context, id string, data []byte, name string) (Draft, error) {
	if _, err := s.attachmentChange(ctx, id); err != nil {
		return Draft{}, err
	}
	typ := fileType(data)
	kind, limit := attachmentKind(typ)
	if kind == "" {
		return Draft{}, invalid("the file must be a PNG or JPEG picture, or a PDF")
	}
	if len(data) > limit {
		return Draft{}, invalid("the file is too large: a picture may be %d MB, a PDF %d MB", maxImageBytes>>20, maxDocumentBytes>>20)
	}
	title := ""
	if kind == AttachDocument {
		title = documentTitle(name)
	}
	_, err := s.db.ExecContext(ctx, `UPDATE drafts SET attachment_kind = ?, attachment = ?, attachment_type = ?, attachment_title = ?, video_url = '', video_size = 0, `+backToDraft+`, updated_at = ? WHERE id = ?`,
		kind, data, typ, title, s.draftStamp(), id)
	if err != nil {
		return Draft{}, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM draft_images WHERE draft_id = ?`, id); err != nil { // a single file replaces a set
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// documentTitle makes a title from a file name: no folder, no ending, no control characters, not empty.
func documentTitle(name string) string {
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	if i := strings.LastIndexByte(name, '.'); i > 0 {
		name = name[:i]
	}
	name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < ' ' || r == 0x7f {
			return -1
		}
		return r
	}, name))
	if r := []rune(name); len(r) > maxAttachmentTitle {
		name = strings.TrimSpace(string(r[:maxAttachmentTitle]))
	}
	if name == "" {
		return "Document"
	}
	return name
}

// SetAttachmentTitle changes a document's or a video's title, the line LinkedIn shows with it.
func (s *Studio) SetAttachmentTitle(ctx context.Context, id, title string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Attachment != AttachDocument && d.Attachment != AttachVideo {
		return Draft{}, invalid("only a document or a video has a title")
	}
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > maxAttachmentTitle || strings.ContainsAny(title, "\r\n") {
		return Draft{}, invalid("the title must be one line of at most %d characters", maxAttachmentTitle)
	}
	if title == d.AttachmentTitle {
		return d, nil
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET attachment_title = ?, `+backToDraft+`, updated_at = ? WHERE id = ?`, title, s.draftStamp(), id); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// ClearAttachment goes back to the card.
func (s *Studio) ClearAttachment(ctx context.Context, id string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if d.Attachment == AttachCard {
		return d, nil
	}
	_, err = s.db.ExecContext(ctx, `UPDATE drafts SET attachment_kind = ?, attachment = NULL, attachment_type = '', attachment_title = '', video_url = '', video_size = 0, `+backToDraft+`, updated_at = ? WHERE id = ?`,
		AttachCard, s.draftStamp(), id)
	if err != nil {
		return Draft{}, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM draft_images WHERE draft_id = ?`, id); err != nil {
		return Draft{}, err
	}
	return s.GetDraft(ctx, id)
}

// backToDraft returns an approved or published item to draft and takes its public page down; a draft stays a draft.
const backToDraft = `status = 'draft', approved_at = '', approved_by = '', scheduled_at = '', timezone = '', page_at = '', cover = NULL`

// ownFile is a post's own attachment.
type ownFile struct {
	Kind, Type, Title string
	Data              []byte
	VideoURL          string
	VideoSize         int64
}

// AttachmentFile returns a post's own file and its media type.
func (s *Studio) AttachmentFile(ctx context.Context, id string) ([]byte, string, error) {
	f, err := attachmentOf(ctx, s.db, id)
	if err == nil && len(f.Data) == 0 { // a set of pictures has no single file, and a video is not stored
		return nil, "", ErrNotFound
	}
	return f.Data, f.Type, err
}

// attachmentOf reads a post's own file; ErrNotFound when the post uses the card.
func attachmentOf(ctx context.Context, db *sql.DB, id string) (ownFile, error) {
	var f ownFile
	err := db.QueryRowContext(ctx, `SELECT attachment_kind, attachment, attachment_type, attachment_title, video_url, video_size FROM drafts WHERE id = ?`, id).
		Scan(&f.Kind, &f.Data, &f.Type, &f.Title, &f.VideoURL, &f.VideoSize)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && f.Kind != AttachImages && f.Kind != AttachVideo && (f.Kind == AttachCard || len(f.Data) == 0)) {
		return ownFile{}, ErrNotFound
	}
	return f, err // a set of pictures has no Data (the pictures are in draft_images), and neither has a video (only its address)
}
