package service

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/store"
)

var testPNG = append([]byte("\x89PNG\r\n\x1a\n"), []byte("pixels")...)

type fakePoster struct {
	mu     sync.Mutex
	calls  []linkedin.Post
	loaded [][]byte // the pictures of the last multi-image post, as they were read
	token  string
	err    error
	urn    string
	delay  time.Duration
	boom   bool
}

func (f *fakePoster) Publish(_ context.Context, token string, p linkedin.Post) (string, error) {
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	// read the pictures now, as the real client does: afterwards the job's time is up
	var loaded [][]byte
	for _, pic := range p.Pictures {
		b, _ := pic.Load()
		loaded = append(loaded, b)
	}
	if p.Video != nil { // open the video, as the real client does
		file, err := p.Video.Open(context.Background())
		if err != nil {
			return "", &linkedin.APIError{Message: "Could not read the video: " + err.Error()}
		}
		b, _ := io.ReadAll(file)
		file.Close()
		loaded = append(loaded, b)
	}
	f.mu.Lock()
	f.calls = append(f.calls, p)
	f.loaded = loaded
	f.token = token
	f.mu.Unlock()
	if f.boom {
		panic("kaboom")
	}
	if f.err != nil {
		return "", f.err
	}
	if f.urn == "" {
		return "urn:li:share:777", nil
	}
	return f.urn, nil
}
func (f *fakePoster) count() int { f.mu.Lock(); defer f.mu.Unlock(); return len(f.calls) }

type fakeCreds map[string]string

func (c fakeCreds) Resolve(context.Context, string, string) (map[string]string, error) { return c, nil }

type harness struct {
	p   *Publisher
	li  *fakePoster
	clk *time.Time
	db  *store.DB
}

func newHarness(t *testing.T, creds fakeCreds) *harness {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+t.TempDir()+"/t.db", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if creds == nil {
		creds = fakeCreds{"accessToken": "TOK", "authorUrn": "urn:li:person:Me"}
	}
	li := &fakePoster{}
	p := NewPublisher(db.DB, creds, li, 15*time.Minute)
	clk := time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return clk }
	return &harness{p: p, li: li, clk: &clk, db: db}
}

func (h *harness) advance(d time.Duration) { *h.clk = h.clk.Add(d) }

// approvedDraft stores a draft that a person has approved and returns its id: the only kind a post can be made from.
func (h *harness) approvedDraft(profile string) string {
	id := newID()
	_, err := h.db.DB.Exec(`INSERT INTO drafts (id, profile_id, kind, status, doc, hashtags, alt_text, unicode_styles, title, design, design_version, approved_at, scheduled_at, timezone, created_at, updated_at)
		VALUES (?, ?, 'post', 'approved', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}', '[]', '', 0, '', '{}', 0, '2026-12-01T09:00:00Z', '', '', '2026-12-01T09:00:00Z', '2026-12-01T09:00:00Z')`, id, profile)
	if err != nil {
		panic(err)
	}
	return id
}

// job is a post made from a fresh approved draft of brand "p".
func (h *harness) job() JobInput {
	return JobInput{ProfileID: "p", DraftID: h.approvedDraft("p"), Body: "Hello (world)", Hashtags: []string{"Go"}, AltText: "a card", Image: testPNG}
}

func (h *harness) schedule(t *testing.T, in time.Duration) Job {
	t.Helper()
	at := h.clk.Add(in)
	i := h.job()
	i.ScheduledAt, i.Timezone = &at, "Europe/London"
	j, err := h.p.Create(context.Background(), i)
	if err != nil {
		t.Fatal(err)
	}
	return j
}

func status(t *testing.T, h *harness, id string) Job {
	t.Helper()
	j, err := h.p.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return j
}

func TestPublishNowRecordsThePostAndSendsTheEscapedText(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j, err := h.p.Create(ctx, h.job())
	if err != nil || j.Status != JobPublishing {
		t.Fatalf("%v %+v", err, j)
	}
	h.p.Execute(ctx, j.ID)
	got := status(t, h, j.ID)
	if got.Status != JobPublished || got.PostURN != "urn:li:share:777" || got.PostURL != "https://www.linkedin.com/feed/update/urn:li:share:777/" || got.PublishedAt == "" {
		t.Fatalf("%+v", got)
	}
	c := h.li.calls[0]
	if c.Commentary != "Hello \\(world\\)\n\n{hashtag|\\#|Go}" || c.AuthorURN != "urn:li:person:Me" || c.AltText != "a card" || string(c.Image) != string(testPNG) || h.li.token != "TOK" {
		t.Fatalf("%+v token %q", c, h.li.token)
	}
	if got.PreviewText != "Hello (world)\n\n#Go" {
		t.Fatalf("preview text: %q", got.PreviewText)
	}
	if img, _, _ := h.p.Image(ctx, j.ID); string(img) != string(testPNG) {
		t.Fatal("image not stored")
	}
}

func TestValidation(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	soon := h.clk.Add(10 * time.Second)
	later := h.clk.Add(time.Hour)
	far := h.clk.Add(400 * 24 * time.Hour)
	for name, mut := range map[string]func(*JobInput){
		"no profile":     func(i *JobInput) { i.ProfileID = "" },
		"no text":        func(i *JobInput) { i.Body = "  \n " },
		"not a PNG":      func(i *JobInput) { i.Image = []byte("GIF89a....") },
		"no image":       func(i *JobInput) { i.Image = nil },
		"huge image":     func(i *JobInput) { i.Image = append(append([]byte{}, pngSignature...), make([]byte, maxImageBytes)...) },
		"bad hashtag":    func(i *JobInput) { i.Hashtags = []string{"two words"} },
		"over the limit": func(i *JobInput) { i.Body = strings.Repeat("a", maxBodyChars-2); i.Hashtags = []string{"tag"} },
		"long alt":       func(i *JobInput) { i.AltText = strings.Repeat("a", maxAltText+1) },
		"no timezone":    func(i *JobInput) { i.ScheduledAt = &later },
		"bad timezone":   func(i *JobInput) { i.ScheduledAt, i.Timezone = &later, "Mars/Olympus" },
		"too soon":       func(i *JobInput) { i.ScheduledAt, i.Timezone = &soon, "UTC" },
		"past":           func(i *JobInput) { past := h.clk.Add(-time.Hour); i.ScheduledAt, i.Timezone = &past, "UTC" },
		"too far":        func(i *JobInput) { i.ScheduledAt, i.Timezone = &far, "UTC" },
	} {
		in := h.job()
		mut(&in)
		if _, err := h.p.Create(ctx, in); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", name, err)
		}
	}
	// a body that fits exactly, hashtags included, is accepted
	in := h.job()
	in.Body, in.Hashtags = strings.Repeat("a", maxBodyChars-2-1-3), []string{"tag"} // "\n\n" + "#tag"
	if _, err := h.p.Create(ctx, in); err != nil {
		t.Errorf("a post of exactly %d characters should be accepted: %v", maxBodyChars, err)
	}
}

func TestCannotCreateWithoutLinkedInCredentials(t *testing.T) {
	h := newHarness(t, fakeCreds{"clientId": "x"})
	if _, err := h.p.Create(context.Background(), h.job()); !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "Social accounts") {
		t.Fatalf("%v", err)
	}
}

func TestAFailureIsRecordedAndNeverRetriedByTheScheduler(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	h.li.err = &linkedin.APIError{Status: 401, Message: "LinkedIn rejected the access token."}
	j := h.schedule(t, time.Hour)
	h.advance(time.Hour + time.Minute)
	if err := h.p.RunDue(ctx); err != nil {
		t.Fatal(err)
	}
	got := status(t, h, j.ID)
	if got.Status != JobFailed || !strings.Contains(got.Error, "rejected the access token") {
		t.Fatalf("%+v", got)
	}
	for i := 0; i < 3; i++ {
		h.advance(time.Minute)
		_ = h.p.RunDue(ctx)
	}
	if h.li.count() != 1 {
		t.Fatalf("a failed post must not be retried: %d calls", h.li.count())
	}
	// a person can publish it again once they have fixed the cause
	h.li.err = nil
	again, err := h.p.PublishNow(ctx, j.ID, false)
	if err != nil || again.Status != JobPublishing {
		t.Fatalf("%v %+v", err, again)
	}
	h.p.Execute(ctx, j.ID)
	if s := status(t, h, j.ID); s.Status != JobPublished || s.Error != "" {
		t.Fatalf("%+v", s)
	}
}

func TestAnUnclearResultNeedsAHumanAndAnExplicitConfirmToRepeat(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	h.li.err = &linkedin.UnknownOutcomeError{Reason: "No answer came back."}
	j, _ := h.p.Create(ctx, h.job())
	h.p.Execute(ctx, j.ID)
	got := status(t, h, j.ID)
	if got.Status != JobNeedsReview || !strings.Contains(got.Error, "Check LinkedIn") {
		t.Fatalf("%+v", got)
	}
	if _, err := h.p.PublishNow(ctx, j.ID, false); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "already be on LinkedIn") {
		t.Fatalf("publishing again without confirming must be refused: %v", err)
	}
	h.advance(time.Hour)
	_ = h.p.RunDue(ctx)
	if h.li.count() != 1 {
		t.Fatal("the scheduler must never touch a needs_review job")
	}
	h.li.err = nil
	if _, err := h.p.PublishNow(ctx, j.ID, true); err != nil {
		t.Fatal(err)
	}
	h.p.Execute(ctx, j.ID)
	if status(t, h, j.ID).Status != JobPublished {
		t.Fatal("confirmed repeat should publish")
	}
}

func TestScheduledJobRunsOnceAtItsTime(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := h.schedule(t, 2*time.Hour)
	if j.Status != JobScheduled || j.ScheduledAt != "2026-12-01T11:00:00Z" || j.Timezone != "Europe/London" {
		t.Fatalf("%+v", j)
	}
	h.advance(time.Hour)
	_ = h.p.RunDue(ctx)
	if h.li.count() != 0 {
		t.Fatal("ran early")
	}
	h.advance(time.Hour + time.Minute)
	for i := 0; i < 3; i++ {
		if err := h.p.RunDue(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if h.li.count() != 1 || status(t, h, j.ID).Status != JobPublished {
		t.Fatalf("calls=%d %+v", h.li.count(), status(t, h, j.ID))
	}
}

func TestTooLateBecomesMissedAndWaitsForAPerson(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := h.schedule(t, time.Hour)
	h.advance(time.Hour + 20*time.Minute) // grace is 15 minutes
	if err := h.p.RunDue(ctx); err != nil {
		t.Fatal(err)
	}
	got := status(t, h, j.ID)
	if got.Status != JobMissed || !strings.Contains(got.Error, "Publish it now") || h.li.count() != 0 {
		t.Fatalf("%+v calls=%d", got, h.li.count())
	}
	// within the grace window it still goes out
	j2 := h.schedule(t, time.Hour)
	h.advance(time.Hour + 10*time.Minute)
	_ = h.p.RunDue(ctx)
	if status(t, h, j2.ID).Status != JobPublished {
		t.Fatalf("a post within the grace window should publish: %+v", status(t, h, j2.ID))
	}
	// a person can reschedule the missed one
	at := h.clk.Add(3 * time.Hour)
	re, err := h.p.Reschedule(ctx, j.ID, at, "America/New_York")
	if err != nil || re.Status != JobScheduled || re.Timezone != "America/New_York" || re.Error != "" {
		t.Fatalf("%v %+v", err, re)
	}
}

func TestTwoSchedulersNeverPublishTheSameJobTwice(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	h.li.delay = 50 * time.Millisecond
	j := h.schedule(t, time.Hour)
	h.advance(time.Hour + time.Second)
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _ = h.p.RunDue(ctx) }()
	}
	wg.Wait()
	if h.li.count() != 1 {
		t.Fatalf("published %d times, want exactly 1", h.li.count())
	}
	if status(t, h, j.ID).Status != JobPublished {
		t.Fatal("not published")
	}
}

func TestPublishNowClaimsAtomically(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := h.schedule(t, time.Hour)
	var ok int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := h.p.PublishNow(ctx, j.ID, false); err == nil {
				atomic.AddInt32(&ok, 1)
			}
		}()
	}
	wg.Wait()
	if ok != 1 {
		t.Fatalf("%d callers claimed the job, want 1", ok)
	}
}

func TestStartupSettlesAnInterruptedPublish(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j, _ := h.p.Create(ctx, h.job()) // publishing, never executed: the server "died"
	if err := h.p.RecoverOnStart(ctx); err != nil {
		t.Fatal(err)
	}
	got := status(t, h, j.ID)
	if got.Status != JobNeedsReview || !strings.Contains(got.Error, "may or may not be on LinkedIn") {
		t.Fatalf("%+v", got)
	}
	_ = h.p.RunDue(ctx)
	if h.li.count() != 0 {
		t.Fatal("an interrupted publish must not be retried")
	}
}

func TestAHungPublishBecomesNeedsReview(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j, _ := h.p.Create(ctx, h.job())
	h.advance(stalePublishing + time.Minute)
	_ = h.p.RunDue(ctx)
	if status(t, h, j.ID).Status != JobNeedsReview {
		t.Fatalf("%+v", status(t, h, j.ID))
	}
}

func TestAPanicWhilePublishingIsRecordedNotFatal(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	h.li.boom = true
	j, _ := h.p.Create(ctx, h.job())
	h.p.Execute(ctx, j.ID)
	if got := status(t, h, j.ID); got.Status != JobNeedsReview || !strings.Contains(got.Error, "Check LinkedIn") {
		t.Fatalf("%+v", got)
	}
}

func TestExecuteOnlyRunsAClaimedJob(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := h.schedule(t, time.Hour) // scheduled, not claimed
	h.p.Execute(ctx, j.ID)
	if h.li.count() != 0 || status(t, h, j.ID).Status != JobScheduled {
		t.Fatal("Execute must not run a job that was not claimed")
	}
}

func TestCancelRescheduleAndDeleteRules(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := h.schedule(t, time.Hour)
	if _, err := h.p.Reschedule(ctx, j.ID, h.clk.Add(10*time.Second), "UTC"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("rescheduling into the past: %v", err)
	}
	if err := h.p.Delete(ctx, j.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("a scheduled job must be cancelled before it is deleted: %v", err)
	}
	c, err := h.p.Cancel(ctx, j.ID)
	if err != nil || c.Status != JobCancelled {
		t.Fatalf("%v %+v", err, c)
	}
	_ = h.p.RunDue(ctx)
	h.advance(2 * time.Hour)
	_ = h.p.RunDue(ctx)
	if h.li.count() != 0 {
		t.Fatal("a cancelled job ran")
	}
	if _, err := h.p.Cancel(ctx, j.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("cancelling twice: %v", err)
	}
	if _, err := h.p.Reschedule(ctx, j.ID, h.clk.Add(time.Hour), "UTC"); err != nil {
		t.Fatalf("a cancelled job can be scheduled again: %v", err)
	}
	// published jobs are history: cannot be cancelled, rescheduled or published again, but can be deleted
	pub, _ := h.p.Create(ctx, h.job())
	h.p.Execute(ctx, pub.ID)
	if _, err := h.p.Cancel(ctx, pub.ID); !errors.Is(err, ErrConflict) {
		t.Fatal("cancelling a published post")
	}
	if _, err := h.p.PublishNow(ctx, pub.ID, true); !errors.Is(err, ErrConflict) {
		t.Fatal("publishing a published post again")
	}
	if err := h.p.Delete(ctx, pub.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := h.p.Get(ctx, pub.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("not deleted")
	}
	if _, err := h.p.Cancel(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
}

func TestListIsPerProfileNewestFirstAndOmitsImages(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	a, _ := h.p.Create(ctx, h.job())
	h.advance(time.Second)
	b, _ := h.p.Create(ctx, h.job())
	other := h.job()
	other.ProfileID = "q"
	_, _ = h.p.Create(ctx, other)
	list, err := h.p.List(ctx, "p")
	if err != nil || len(list) != 2 || list[0].ID != b.ID || list[1].ID != a.ID {
		t.Fatalf("%v %+v", err, list)
	}
	if none, _ := h.p.List(ctx, "zzz"); none == nil || len(none) != 0 {
		t.Fatal("empty list must be [] not nil")
	}
}

func TestListAllShowsEveryBrandsPostsAndListShowsOne(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	for _, brand := range []string{"a", "b", "b"} {
		in := h.job()
		in.ProfileID, in.DraftID = brand, h.approvedDraft(brand)
		at := h.clk.Add(time.Hour)
		in.ScheduledAt, in.Timezone = &at, "Europe/London"
		if _, err := h.p.Create(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	all, err := h.p.ListAll(ctx)
	if err != nil || len(all) != 3 {
		t.Fatalf("all: %d %v", len(all), err)
	}
	if b, _ := h.p.List(ctx, "b"); len(b) != 2 {
		t.Fatalf("b: %d", len(b))
	}
	if a, _ := h.p.List(ctx, "a"); len(a) != 1 || a[0].ProfileID != "a" {
		t.Fatalf("a: %+v", a)
	}
}

func TestEachTripToLinkedInIsRecordedAsAnAttempt(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j, err := h.p.Create(ctx, h.job())
	if err != nil {
		t.Fatal(err)
	}
	h.li.err = errors.New("LinkedIn refused this action.")
	h.p.Execute(ctx, j.ID)
	if got := status(t, h, j.ID); got.Status != JobFailed {
		t.Fatalf("%+v", got)
	}
	// a person retries by hand, and this time it goes through
	h.li.err = nil
	if _, err := h.p.PublishNow(ctx, j.ID, false); err != nil {
		t.Fatal(err)
	}
	h.p.Execute(ctx, j.ID)
	at, err := h.p.Attempts(ctx, j.ID)
	if err != nil || len(at) != 2 {
		t.Fatalf("%v %+v", err, at)
	}
	if at[0].Outcome != JobFailed || at[0].Error == "" || at[1].Outcome != JobPublished || at[1].StartedAt == "" || at[1].FinishedAt == "" {
		t.Fatalf("%+v", at)
	}
	if _, err := h.p.Attempts(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	// deleting the job takes its attempts with it
	if err := h.p.Delete(ctx, j.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM publish_attempts WHERE job_id = ?`, j.ID).Scan(&n)
	if n != 0 {
		t.Fatalf("%d attempts left", n)
	}
}
