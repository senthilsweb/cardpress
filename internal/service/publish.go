package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/senthilsweb/cardpress/internal/linkedin"
)

// Job statuses. A person acts on every status except scheduled and publishing; nothing is retried automatically.
const (
	JobScheduled   = "scheduled"
	JobPublishing  = "publishing"
	JobPublished   = "published"
	JobFailed      = "failed"       // LinkedIn or the network refused; known not to have posted
	JobMissed      = "missed"       // the time passed while the server was not running
	JobNeedsReview = "needs_review" // the outcome is unknown: check LinkedIn before doing anything else
	JobCancelled   = "cancelled"
)

const (
	maxImageBytes   = 10 << 20
	maxBodyChars    = 3000
	minLeadTime     = 30 * time.Second
	maxLeadTime     = 366 * 24 * time.Hour
	publishTimeout  = 90 * time.Second
	stalePublishing = 10 * time.Minute
	// DefaultMissedGrace is how late a scheduled post may still go out.
	DefaultMissedGrace = 15 * time.Minute
)

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// Job is one confirmed post. The image is not included; fetch it with JobImage.
type Job struct {
	ID          string   `json:"id"`
	ProfileID   string   `json:"profileId"`
	DraftID     string   `json:"draftId,omitempty"`
	Network     string   `json:"network"`
	Status      string   `json:"status"`
	Body        string   `json:"body"`
	Hashtags    []string `json:"hashtags"`
	PreviewText string   `json:"previewText"` // the body and hashtag line as the preview showed it
	AltText     string   `json:"altText"`
	ScheduledAt string   `json:"scheduledAt,omitempty"` // UTC; empty for publish-now
	Timezone    string   `json:"timezone,omitempty"`    // IANA zone to display the time in
	Error       string   `json:"error,omitempty"`
	PostURN     string   `json:"postUrn,omitempty"`
	PostURL     string   `json:"postUrl,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	PublishedAt string   `json:"publishedAt,omitempty"`
}

// JobInput is a confirmed post to publish now (ScheduledAt nil) or later.
type JobInput struct {
	ProfileID   string
	DraftID     string
	Body        string // the text without the hashtag line
	Hashtags    []string
	AltText     string
	Image       []byte // PNG
	ScheduledAt *time.Time
	Timezone    string
}

// LinkedInPoster publishes a post. *linkedin.Client implements it.
type LinkedInPoster interface {
	Publish(ctx context.Context, token string, p linkedin.Post) (string, error)
}

// CredentialSource gives the plaintext credentials of one brand for a network. *Settings implements it. A brand never
// gets another brand's credentials.
type CredentialSource interface {
	Resolve(ctx context.Context, profileID, network string) (map[string]string, error)
}

// Publisher creates, schedules and runs publish jobs. All publishing is started by a person; there is no retry.
type Publisher struct {
	db    *sql.DB
	creds CredentialSource
	li    LinkedInPoster
	grace time.Duration
	now   func() time.Time
	wg    sync.WaitGroup
}

// NewPublisher returns a Publisher. grace is how late a scheduled post may still go out (DefaultMissedGrace if zero).
func NewPublisher(db *sql.DB, creds CredentialSource, li LinkedInPoster, grace time.Duration) *Publisher {
	if grace <= 0 {
		grace = DefaultMissedGrace
	}
	return &Publisher{db: db, creds: creds, li: li, grace: grace, now: time.Now}
}

func (p *Publisher) stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

/* ------------------------------------------------------------------ create */

func (p *Publisher) validate(in *JobInput) error {
	if in.ProfileID == "" {
		return invalid("profileId is required")
	}
	if strings.TrimSpace(in.Body) == "" {
		return invalid("the post has no text")
	}
	tags, err := normalizeHashtags(in.Hashtags)
	if err != nil {
		return err
	}
	in.Hashtags = tags
	n := utf8.RuneCountInString(strings.TrimSpace(in.Body))
	if len(tags) > 0 {
		n += 2 + len(tags) - 1
		for _, t := range tags {
			n += 1 + utf8.RuneCountInString(t)
		}
	}
	if n > maxBodyChars {
		return invalid("the post is over LinkedIn's %d character limit", maxBodyChars)
	}
	if utf8.RuneCountInString(in.AltText) > maxAltText {
		return invalid("altText is limited to %d characters", maxAltText)
	}
	if len(in.Image) == 0 || len(in.Image) > maxImageBytes || !bytes.HasPrefix(in.Image, pngSignature) {
		return invalid("the image must be a PNG of at most %d MB", maxImageBytes>>20)
	}
	if in.ScheduledAt != nil {
		if _, err := time.LoadLocation(in.Timezone); err != nil || in.Timezone == "" {
			return invalid("timezone must be an IANA zone such as Europe/London")
		}
		if err := p.checkFuture(*in.ScheduledAt); err != nil {
			return err
		}
	}
	return nil
}

func (p *Publisher) checkFuture(t time.Time) error {
	if d := t.Sub(p.now()); d < minLeadTime {
		return invalid("choose a time at least %d seconds from now", int(minLeadTime.Seconds()))
	} else if d > maxLeadTime {
		return invalid("choose a time within the next year")
	}
	return nil
}

// readyFor is ready for the brand that owns an existing job.
func (p *Publisher) readyFor(ctx context.Context, jobID string) error {
	var profileID string
	if err := p.db.QueryRowContext(ctx, `SELECT profile_id FROM publish_jobs WHERE id = ?`, jobID).Scan(&profileID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return p.ready(ctx, profileID)
}

// ready checks that LinkedIn credentials are present, so a job is never created that could not possibly run.
func (p *Publisher) ready(ctx context.Context, profileID string) error {
	c, err := p.creds.Resolve(ctx, profileID, "linkedin")
	if err != nil {
		return invalid("%v", err)
	}
	if c["accessToken"] == "" || c["authorUrn"] == "" {
		return invalid("LinkedIn is not set up: add the access token and author URN in Social accounts for this brand")
	}
	return nil
}

// Create stores a confirmed post. With no ScheduledAt it is claimed for immediate publishing (status publishing) and the
// caller must run Execute; otherwise it waits as scheduled.
func (p *Publisher) Create(ctx context.Context, in JobInput) (Job, error) {
	if err := p.validate(&in); err != nil {
		return Job{}, err
	}
	if err := p.ready(ctx, in.ProfileID); err != nil {
		return Job{}, err
	}
	tags, _ := json.Marshal(in.Hashtags)
	now := p.now()
	status, sched := JobPublishing, sql.NullString{}
	if in.ScheduledAt != nil {
		status, sched = JobScheduled, sql.NullString{String: p.stamp(*in.ScheduledAt), Valid: true}
	}
	id := newID()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO publish_jobs (id, profile_id, draft_id, network, status, body, hashtags, alt_text, image, scheduled_at, timezone, created_at, updated_at)
		 VALUES (?, ?, ?, 'linkedin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.ProfileID, in.DraftID, status, strings.TrimSpace(in.Body), string(tags), in.AltText, in.Image, sched, in.Timezone, p.stamp(now), p.stamp(now))
	if err != nil {
		return Job{}, err
	}
	return p.Get(ctx, id)
}

/* ------------------------------------------------------------------ read */

const jobCols = `id, profile_id, draft_id, network, status, body, hashtags, alt_text, scheduled_at, timezone, error, post_urn, post_url, created_at, updated_at, published_at`

func scanJob(r scanner) (Job, error) {
	var j Job
	var tags string
	var sched sql.NullString
	if err := r.Scan(&j.ID, &j.ProfileID, &j.DraftID, &j.Network, &j.Status, &j.Body, &tags, &j.AltText, &sched, &j.Timezone, &j.Error, &j.PostURN, &j.PostURL, &j.CreatedAt, &j.UpdatedAt, &j.PublishedAt); err != nil {
		return j, err
	}
	j.ScheduledAt = sched.String
	if err := json.Unmarshal([]byte(tags), &j.Hashtags); err != nil || j.Hashtags == nil {
		j.Hashtags = []string{}
	}
	j.PreviewText = j.Body
	if len(j.Hashtags) > 0 {
		var hs []string
		for _, h := range j.Hashtags {
			hs = append(hs, "#"+h)
		}
		j.PreviewText += "\n\n" + strings.Join(hs, " ")
	}
	return j, nil
}

// Get returns one job.
func (p *Publisher) Get(ctx context.Context, id string) (Job, error) {
	j, err := scanJob(p.db.QueryRowContext(ctx, `SELECT `+jobCols+` FROM publish_jobs WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return j, err
}

// List returns a profile's jobs, newest first.
func (p *Publisher) List(ctx context.Context, profileID string) ([]Job, error) {
	rows, err := p.db.QueryContext(ctx, `SELECT `+jobCols+` FROM publish_jobs WHERE profile_id = ? ORDER BY created_at DESC, id LIMIT 200`, profileID)
	if err != nil {
		return nil, err
	}
	out := []Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, j)
	}
	return out, closeRows(rows)
}

// Image returns the PNG a job will post.
func (p *Publisher) Image(ctx context.Context, id string) ([]byte, error) {
	var b []byte
	err := p.db.QueryRowContext(ctx, `SELECT image FROM publish_jobs WHERE id = ?`, id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return b, err
}

/* ------------------------------------------------------------------ people act on jobs */

// transition moves a job to `to` only if it is currently in one of `from`. It is the single atomic step behind every
// claim, so a job can never be taken by two callers.
func (p *Publisher) transition(ctx context.Context, id, to string, from []string, set string, args ...any) (bool, error) {
	ph := strings.TrimSuffix(strings.Repeat("?,", len(from)), ",")
	q := `UPDATE publish_jobs SET status = ?, updated_at = ?` + set + ` WHERE id = ? AND status IN (` + ph + `)`
	a := []any{to, p.stamp(p.now())}
	a = append(a, args...)
	a = append(a, id)
	for _, f := range from {
		a = append(a, f)
	}
	res, err := p.db.ExecContext(ctx, q, a...)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

func (p *Publisher) wrongState(ctx context.Context, id, action string) error {
	j, err := p.Get(ctx, id)
	if err != nil {
		return err
	}
	return fmt.Errorf("%w: a %s post cannot be %s", ErrConflict, strings.ReplaceAll(j.Status, "_", " "), action)
}

// PublishNow claims a job for immediate publishing; the caller then runs Execute. A needs_review job may already be
// live on LinkedIn, so it is refused unless the person confirms they accept a possible duplicate.
func (p *Publisher) PublishNow(ctx context.Context, id string, acceptDuplicate bool) (Job, error) {
	from := []string{JobScheduled, JobMissed, JobFailed}
	if acceptDuplicate {
		from = append(from, JobNeedsReview)
	}
	if err := p.readyFor(ctx, id); err != nil {
		return Job{}, err
	}
	ok, err := p.transition(ctx, id, JobPublishing, from, `, error = ''`)
	if err != nil {
		return Job{}, err
	}
	if !ok {
		if j, gerr := p.Get(ctx, id); gerr == nil && j.Status == JobNeedsReview {
			return Job{}, fmt.Errorf("%w: this post may already be on LinkedIn; check there first, and confirm to publish it again anyway", ErrConflict)
		}
		return Job{}, p.wrongState(ctx, id, "published now")
	}
	return p.Get(ctx, id)
}

// Reschedule sets a new time. A failed, missed or cancelled job becomes scheduled again.
func (p *Publisher) Reschedule(ctx context.Context, id string, at time.Time, timezone string) (Job, error) {
	if _, err := time.LoadLocation(timezone); err != nil || timezone == "" {
		return Job{}, invalid("timezone must be an IANA zone such as Europe/London")
	}
	if err := p.checkFuture(at); err != nil {
		return Job{}, err
	}
	if err := p.readyFor(ctx, id); err != nil {
		return Job{}, err
	}
	ok, err := p.transition(ctx, id, JobScheduled, []string{JobScheduled, JobMissed, JobFailed, JobCancelled}, `, scheduled_at = ?, timezone = ?, error = ''`, p.stamp(at), timezone)
	if err != nil {
		return Job{}, err
	}
	if !ok {
		return Job{}, p.wrongState(ctx, id, "rescheduled")
	}
	return p.Get(ctx, id)
}

// Cancel stops a job that has not published.
func (p *Publisher) Cancel(ctx context.Context, id string) (Job, error) {
	ok, err := p.transition(ctx, id, JobCancelled, []string{JobScheduled, JobMissed, JobFailed, JobNeedsReview}, "")
	if err != nil {
		return Job{}, err
	}
	if !ok {
		return Job{}, p.wrongState(ctx, id, "cancelled")
	}
	return p.Get(ctx, id)
}

// Delete removes a finished job from the history. A scheduled or running one must be cancelled first.
func (p *Publisher) Delete(ctx context.Context, id string) error {
	res, err := p.db.ExecContext(ctx, `DELETE FROM publish_jobs WHERE id = ? AND status NOT IN (?, ?)`, id, JobScheduled, JobPublishing)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return nil
	}
	return p.wrongState(ctx, id, "deleted")
}

/* ------------------------------------------------------------------ running */

// Go runs fn in the background and lets Wait block until it is done, so shutdown does not cut a publish short.
func (p *Publisher) Go(fn func()) {
	p.wg.Add(1)
	go func() { defer p.wg.Done(); fn() }()
}

// Wait blocks until background publishing has finished.
func (p *Publisher) Wait() { p.wg.Wait() }

// Execute performs the LinkedIn calls for a job already claimed (status publishing) and records the outcome. It does
// not retry. A failure sets failed; an unclear result of the create call sets needs_review.
func (p *Publisher) Execute(ctx context.Context, id string) {
	ctx, cancel := context.WithTimeout(ctx, publishTimeout)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			p.finish(context.Background(), id, JobNeedsReview, "", "", fmt.Sprintf("An unexpected error happened while publishing (%v). Check LinkedIn before publishing again.", r))
		}
	}()

	var status, body, tags, alt, profileID string
	var img []byte
	err := p.db.QueryRowContext(ctx, `SELECT status, body, hashtags, alt_text, image, profile_id FROM publish_jobs WHERE id = ?`, id).Scan(&status, &body, &tags, &alt, &img, &profileID)
	if err != nil || status != JobPublishing {
		return // not ours to run
	}
	var hashtags []string
	_ = json.Unmarshal([]byte(tags), &hashtags)

	c, err := p.creds.Resolve(ctx, profileID, "linkedin")
	if err == nil && (c["accessToken"] == "" || c["authorUrn"] == "") {
		err = errors.New("LinkedIn is not set up: add the access token and author URN in Social accounts")
	}
	if err != nil {
		p.finish(ctx, id, JobFailed, "", "", err.Error())
		return
	}
	urn, err := p.li.Publish(ctx, c["accessToken"], linkedin.Post{
		AuthorURN: c["authorUrn"], Commentary: linkedin.Commentary(body, hashtags), AltText: alt, Image: img, ContentType: "image/png",
	})
	switch {
	case err == nil:
		p.finish(ctx, id, JobPublished, urn, linkedin.PostURL(urn), "")
	case linkedin.IsUnknownOutcome(err):
		p.finish(ctx, id, JobNeedsReview, "", "", err.Error()+" Check LinkedIn before publishing again.")
	default:
		p.finish(ctx, id, JobFailed, "", "", err.Error())
	}
}

func (p *Publisher) finish(ctx context.Context, id, status, urn, url, msg string) {
	set := `, error = ?, post_urn = ?, post_url = ?`
	args := []any{msg, urn, url}
	if status == JobPublished {
		set += `, published_at = ?`
		args = append(args, p.stamp(p.now()))
	}
	// the context may have expired, which is often why we are here: always record the outcome
	_, _ = p.transition(context.WithoutCancel(ctx), id, status, []string{JobPublishing}, set, args...)
}

// RunDue publishes jobs whose time has come and marks jobs that are too late as missed. It is safe to call from several
// places: each job is claimed atomically, so it runs at most once.
func (p *Publisher) RunDue(ctx context.Context) error {
	now := p.now()
	late := fmt.Sprintf("The scheduled time passed while the server was not running (more than %d minutes late). Publish it now, choose a new time, or cancel.", int(p.grace.Minutes()))
	if _, err := p.db.ExecContext(ctx, `UPDATE publish_jobs SET status = ?, error = ?, updated_at = ? WHERE status = ? AND scheduled_at < ?`,
		JobMissed, late, p.stamp(now), JobScheduled, p.stamp(now.Add(-p.grace))); err != nil {
		return err
	}
	// a publish that never finished (a hung call) is left for a person to check
	if _, err := p.db.ExecContext(ctx, `UPDATE publish_jobs SET status = ?, error = ?, updated_at = ? WHERE status = ? AND updated_at < ?`,
		JobNeedsReview, "Publishing did not finish. Check LinkedIn before publishing again.", p.stamp(now), JobPublishing, p.stamp(now.Add(-stalePublishing))); err != nil {
		return err
	}
	rows, err := p.db.QueryContext(ctx, `SELECT id FROM publish_jobs WHERE status = ? AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10`, JobScheduled, p.stamp(now))
	if err != nil {
		return err
	}
	var due []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		due = append(due, id)
	}
	if err := closeRows(rows); err != nil {
		return err
	}
	for _, id := range due {
		ok, err := p.transition(ctx, id, JobPublishing, []string{JobScheduled}, `, error = ''`)
		if err != nil {
			return err
		}
		if ok {
			// a publish already under way is finished even if the server is shutting down
			p.Execute(context.WithoutCancel(ctx), id)
		}
	}
	return nil
}

// RecoverOnStart settles jobs the previous run left in the air: a publish in progress may or may not have reached
// LinkedIn, so it needs a person's check and is never retried.
func (p *Publisher) RecoverOnStart(ctx context.Context) error {
	_, err := p.db.ExecContext(ctx, `UPDATE publish_jobs SET status = ?, error = ?, updated_at = ? WHERE status = ?`,
		JobNeedsReview, "The server stopped while this post was being published, so it may or may not be on LinkedIn. Check there first.",
		p.stamp(p.now()), JobPublishing)
	return err
}

// Run is the scheduler: recover, then check for due jobs every interval until ctx ends, and finish any publish in
// progress before returning.
func (p *Publisher) Run(ctx context.Context, interval time.Duration) {
	if err := p.RecoverOnStart(ctx); err != nil {
		log.Printf("scheduler: recover: %v", err)
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		if err := p.RunDue(ctx); err != nil && ctx.Err() == nil {
			log.Printf("scheduler: %v", err)
		}
		select {
		case <-ctx.Done():
			p.Wait()
			return
		case <-t.C:
		}
	}
}
