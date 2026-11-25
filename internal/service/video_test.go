package service

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/linkedin"
	"github.com/senthilsweb/cardpress/internal/source"
)

// fakeVideos stands for the public address a video is at.
type fakeVideos struct {
	file string
	err  error
}

func (f *fakeVideos) Check(_ context.Context, url string) (source.VideoInfo, error) {
	if f.err != nil {
		return source.VideoInfo{}, f.err
	}
	url = strings.TrimSpace(url)
	return source.VideoInfo{URL: url, Name: url[strings.LastIndex(url, "/")+1:], Size: int64(len(f.file))}, nil
}

func (f *fakeVideos) Open(context.Context, string) (io.ReadCloser, int64, error) {
	if f.err != nil {
		return nil, 0, f.err
	}
	return io.NopCloser(strings.NewReader(f.file)), int64(len(f.file)), nil
}

func TestAPostCanCarryAVideo(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")
	if _, err := st.SetVideo(ctx, id, "https://example.com/a.mp4"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("without a checker: %v", err)
	}
	videos := &fakeVideos{err: &source.Error{Message: "That address is not an MP4 video."}}
	st.Videos, h.p.Videos = videos, videos
	if _, err := st.SetVideo(ctx, id, "https://example.com/a.mp4"); !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "not an MP4") {
		t.Fatalf("a refused address: %v", err)
	}
	if d, _ := st.GetDraft(ctx, id); d.Attachment != AttachCard || d.Status != StatusApproved {
		t.Fatalf("a refused address changed the post: %+v", d)
	}

	videos.err, videos.file = nil, "the-film"
	if _, err := st.AddImage(ctx, id, pngN(1)); err != nil {
		t.Fatal(err)
	}
	d, err := st.SetVideo(ctx, id, " https://example.com/films/launch.mp4 ")
	if err != nil || d.Attachment != AttachVideo || d.VideoURL != "https://example.com/films/launch.mp4" || d.VideoSize != 8 || d.AttachmentTitle != "launch" || d.Status != StatusDraft || len(d.Images) != 0 {
		t.Fatalf("%+v %v", d, err)
	}
	if _, _, err := st.AttachmentFile(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a video is not stored: %v", err)
	}
	if _, err := st.SetAttachmentTitle(ctx, id, "Our launch"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	if d, _ = st.SetVideo(ctx, id, d.VideoURL); d.Status != StatusApproved {
		t.Fatal("the same address must change nothing")
	}
	if d, _ = st.SetVideo(ctx, id, "https://example.com/other.mp4"); d.Status != StatusDraft || d.AttachmentTitle != "Our launch" {
		t.Fatalf("a new address: %+v", d)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}

	// the job keeps the address, not the file, and reads it when it is sent
	j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Watch"})
	if err != nil || j.Attachment != AttachVideo || j.VideoURL != "https://example.com/other.mp4" || j.Title != "Our launch" {
		t.Fatalf("%+v %v", j, err)
	}
	if _, _, err := h.p.Image(ctx, j.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a video job has no picture: %v", err)
	}
	h.p.Execute(ctx, j.ID)
	call := h.li.calls[len(h.li.calls)-1]
	if status(t, h, j.ID).Status != JobPublished || call.Video == nil || call.Video.Size != 8 || call.Image != nil || call.Title != "Our launch" || string(h.li.loaded[0]) != "the-film" {
		t.Fatalf("%+v %+v", status(t, h, j.ID), call)
	}

	// going back to the card forgets the address
	if _, err := st.Unapprove(ctx, id); err != nil {
		t.Fatal(err)
	}
	if d, err = st.ClearAttachment(ctx, id); err != nil || d.Attachment != AttachCard || d.VideoURL != "" || d.VideoSize != 0 {
		t.Fatalf("%+v %v", d, err)
	}
}

// scheduledVideo makes a video post due in an hour.
func scheduledVideo(t *testing.T, h *harness, videos *fakeVideos) Job {
	t.Helper()
	ctx := context.Background()
	st := New(h.db.DB)
	st.Videos, h.p.Videos = videos, videos
	id := h.approvedDraft("p")
	if _, err := st.SetVideo(ctx, id, "https://example.com/a.mp4"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	at := h.clk.Add(time.Hour)
	j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Watch", ScheduledAt: &at, Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	return j
}

func TestAScheduledVideo(t *testing.T) {
	for name, tc := range map[string]struct {
		change func(*harness, *fakeVideos)
		want   string
		status string
	}{
		"sent": {status: JobPublished},
		"address gone": {change: func(_ *harness, v *fakeVideos) {
			v.err = &source.Error{Message: "The video address answered 404 Not Found."}
		}, status: JobFailed, want: "404"},
		"file changed":  {change: func(_ *harness, v *fakeVideos) { v.file = "another, longer film" }, status: JobFailed, want: "has changed"},
		"still waiting": {change: func(h *harness, _ *fakeVideos) { h.li.err = &linkedin.NotReadyError{} }, status: JobNeedsReview, want: "still processing"},
	} {
		h := newHarness(t, nil)
		videos := &fakeVideos{file: "film"}
		j := scheduledVideo(t, h, videos)
		if tc.change != nil {
			tc.change(h, videos)
		}
		h.advance(time.Hour)
		if err := h.p.RunDue(context.Background()); err != nil {
			t.Fatal(err)
		}
		h.p.Wait() // a video is sent in the background
		if got := status(t, h, j.ID); got.Status != tc.status || !strings.Contains(got.Error, tc.want) {
			t.Errorf("%s: %s %q", name, got.Status, got.Error)
		}
	}
}

func TestAVideoBeingSentIsNotTakenForAHungPublish(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	j := scheduledVideo(t, h, &fakeVideos{file: "film"})
	if _, err := h.p.transition(ctx, j.ID, JobPublishing, []string{JobScheduled}, ""); err != nil {
		t.Fatal(err)
	}
	h.advance(9 * time.Minute)
	h.p.touch(ctx, j.ID)
	h.advance(9 * time.Minute)
	if err := h.p.RunDue(ctx); err != nil {
		t.Fatal(err)
	}
	if got := status(t, h, j.ID).Status; got != JobPublishing {
		t.Fatalf("status = %s", got)
	}
}
