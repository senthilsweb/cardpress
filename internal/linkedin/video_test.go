package linkedin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type videoFake struct {
	mu       sync.Mutex
	calls    []string
	parts    [][]byte
	partAuth []string
	initBody map[string]any
	final    map[string]any
	post     map[string]any
	partSize int
	// behaviour
	statuses     []string // answered in turn; the last repeats
	statusCode   int
	uploadStatus int
}

func newVideoFake(t *testing.T) (*videoFake, *Client) {
	t.Helper()
	f := &videoFake{partSize: 1000, statuses: []string{"PROCESSING", "AVAILABLE"}, statusCode: 200, uploadStatus: 200}
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.calls = append(f.calls, r.Method+" "+r.URL.EscapedPath()+" "+r.URL.Query().Get("action"))
		switch {
		case r.URL.Query().Get("action") == "initializeUpload":
			_ = json.NewDecoder(r.Body).Decode(&f.initBody)
			size := int(f.initBody["initializeUploadRequest"].(map[string]any)["fileSizeBytes"].(float64))
			var ins []map[string]any
			for first := 0; first < size; first += f.partSize {
				ins = append(ins, map[string]any{"uploadUrl": fmt.Sprintf("%s/part/%d?sig=SECRET", srv.URL, len(ins)), "firstByte": first, "lastByte": min(first+f.partSize, size) - 1})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"value": map[string]any{"video": "urn:li:video:V1", "uploadToken": "", "uploadInstructions": ins}})
		case strings.HasPrefix(r.URL.Path, "/part/"):
			b, _ := io.ReadAll(r.Body)
			f.parts = append(f.parts, b)
			f.partAuth = append(f.partAuth, r.Header.Get("Authorization"))
			w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, len(f.parts)))
			w.WriteHeader(f.uploadStatus)
		case r.URL.Query().Get("action") == "finalizeUpload":
			_ = json.NewDecoder(r.Body).Decode(&f.final)
		case r.Method == http.MethodGet:
			if f.statusCode != 200 {
				w.WriteHeader(f.statusCode)
				return
			}
			s := f.statuses[0]
			if len(f.statuses) > 1 {
				f.statuses = f.statuses[1:]
			}
			fmt.Fprintf(w, `{"status":%q,"processingFailureReason":"bad codec"}`, s)
		case r.URL.Path == "/rest/posts":
			_ = json.NewDecoder(r.Body).Decode(&f.post)
			w.Header().Set("x-restli-id", "urn:li:share:9")
			w.WriteHeader(201)
		}
	}))
	t.Cleanup(srv.Close)
	c := New(srv.URL, "202610")
	c.VideoPoll, c.VideoBlindWait, c.VideoWait = time.Millisecond, time.Millisecond, 200*time.Millisecond
	return f, c
}

func videoPost(file []byte, open func(context.Context) (io.ReadCloser, error)) Post {
	if open == nil {
		open = func(context.Context) (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(file)), nil }
	}
	return Post{AuthorURN: "urn:li:person:Ab_1", Commentary: "Watch", Title: "Launch", Video: &Video{Size: int64(len(file)), Open: open}}
}

func TestPublishAVideo(t *testing.T) {
	f, c := newVideoFake(t)
	file := bytes.Repeat([]byte("abcdefghij"), 250) // 2500 bytes: three parts
	progress := 0
	p := videoPost(file, nil)
	p.Video.Progress = func() { progress++ }
	ctx, trace := WithTrace(context.Background())
	urn, err := c.Publish(ctx, "TOKEN-XYZ", p)
	if err != nil || urn != "urn:li:share:9" {
		t.Fatalf("%q %v", urn, err)
	}
	if len(f.parts) != 3 || !bytes.Equal(bytes.Join(f.parts, nil), file) {
		t.Fatalf("%d parts", len(f.parts))
	}
	if strings.Join(f.partAuth, "") != "" {
		t.Fatal("the token went to an upload address")
	}
	fin := f.final["finalizeUploadRequest"].(map[string]any)
	if got := fmt.Sprint(fin["uploadedPartIds"]); got != `["etag-1" "etag-2" "etag-3"]` || fin["video"] != "urn:li:video:V1" || fin["uploadToken"] != "" {
		t.Fatalf("finalize: %v %s", fin, got)
	}
	media := f.post["content"].(map[string]any)["media"].(map[string]any)
	if media["id"] != "urn:li:video:V1" || media["title"] != "Launch" {
		t.Fatalf("post: %v", media)
	}
	if got := strings.Join(f.calls, "|"); !strings.Contains(got, "GET /rest/videos/urn%3Ali%3Avideo%3AV1 ") || !strings.HasSuffix(got, "POST /rest/posts ") {
		t.Fatalf("calls: %s", got)
	}
	if progress < 4 {
		t.Fatalf("progress %d", progress)
	}
	for _, s := range trace.Steps() {
		if strings.Contains(s.Path+s.Body, "SECRET") {
			t.Fatal("an upload signature is in the record")
		}
	}
}

func TestPublishAVideoWhenTheStatusCannotBeRead(t *testing.T) {
	f, c := newVideoFake(t)
	f.statusCode = 403
	if _, err := c.Publish(context.Background(), "T", videoPost(bytes.Repeat([]byte("a"), 100), nil)); err != nil || f.post == nil {
		t.Fatal(err)
	}
}

func TestAVideoThatDoesNotGetThrough(t *testing.T) {
	file := bytes.Repeat([]byte("a"), 2500)
	for name, tc := range map[string]struct {
		set  func(*videoFake)
		open func(context.Context) (io.ReadCloser, error)
		want string
	}{
		"address gone": {open: func(context.Context) (io.ReadCloser, error) {
			return nil, errors.New("The video address answered 404 Not Found.")
		}, want: "404"},
		"file cut short":    {open: func(context.Context) (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(file[:1500])), nil }, want: "stopped arriving"},
		"part refused":      {set: func(f *videoFake) { f.uploadStatus = 500 }, want: "part 1 of 3"},
		"processing failed": {set: func(f *videoFake) { f.statuses = []string{"PROCESSING_FAILED"} }, want: "bad codec"},
		"never ready":       {set: func(f *videoFake) { f.statuses = []string{"PROCESSING"} }, want: "still processing"},
	} {
		f, c := newVideoFake(t)
		if tc.set != nil {
			tc.set(f)
		}
		_, err := c.Publish(context.Background(), "T", videoPost(file, tc.open))
		if err == nil || !strings.Contains(err.Error(), tc.want) || IsUnknownOutcome(err) || f.post != nil {
			t.Errorf("%s: %v (posted: %v)", name, err, f.post != nil)
		}
		var nr *NotReadyError
		if errors.As(err, &nr) != (name == "never ready") {
			t.Errorf("%s: wrong kind of error %T", name, err)
		}
		if name == "address gone" && len(f.calls) != 0 {
			t.Errorf("LinkedIn was called: %v", f.calls)
		}
	}
	f, c := newVideoFake(t)
	f.partSize = maxVideoPart + 1
	if _, err := c.Publish(context.Background(), "T", videoPost(make([]byte, maxVideoPart+1), nil)); err == nil || len(f.parts) != 0 {
		t.Errorf("a part over the limit was buffered: %v", err)
	}
}
