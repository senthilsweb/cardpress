package source

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func mp4(n int) []byte {
	b := bytes.Repeat([]byte{7}, n)
	copy(b, "\x00\x00\x00\x18ftypmp42")
	return b
}

func videoHost(t *testing.T) (*httptest.Server, *Videos) {
	t.Helper()
	file := mp4(200 << 10)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/films/launch.mp4":
			http.ServeContent(w, r, "launch.mp4", time.Time{}, bytes.NewReader(file))
		case "/norange.mp4": // ignores the range and sends everything, with its length
			w.Header().Set("Content-Length", "204800")
			w.Write(file) //nolint:errcheck
		case "/page.mp4":
			http.ServeContent(w, r, "x", time.Time{}, strings.NewReader("<html>"+strings.Repeat("x", 100<<10)))
		case "/tiny.mp4":
			http.ServeContent(w, r, "x", time.Time{}, bytes.NewReader(mp4(1000)))
		case "/unsized.mp4":
			w.Write(file[:1000])     //nolint:errcheck
			w.(http.Flusher).Flush() // chunked: no length
		case "/plain":
			http.Redirect(w, r, "http://example.com/video.mp4", http.StatusFound)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(srv.Close)
	tr := srv.Client().Transport.(*http.Transport).Clone()
	return srv, newVideos(0, true, tr)
}

func TestVideoCheckAndOpen(t *testing.T) {
	srv, v := videoHost(t)
	ctx := context.Background()
	for _, path := range []string{"/films/launch.mp4", "/norange.mp4"} {
		info, err := v.Check(ctx, "  "+srv.URL+path+" ")
		if err != nil || info.Size != 200<<10 || info.URL != srv.URL+path || !strings.HasSuffix(info.Name, ".mp4") {
			t.Fatalf("%s: %+v %v", path, info, err)
		}
		body, n, err := v.Open(ctx, info.URL)
		if err != nil || n != 200<<10 {
			t.Fatalf("open %s: %d %v", path, n, err)
		}
		got, err := io.ReadAll(body)
		body.Close()
		if err != nil || !bytes.Equal(got, mp4(200<<10)) {
			t.Fatalf("%s: read %d bytes, %v", path, len(got), err)
		}
	}
}

func TestVideoRefusals(t *testing.T) {
	srv, v := videoHost(t)
	small := newVideos(100<<10, true, srv.Client().Transport.(*http.Transport).Clone())
	ctx := context.Background()
	for want, got := range map[string]func() error{
		"not an MP4":          func() error { _, err := v.Check(ctx, srv.URL+"/page.mp4"); return err },
		"too small":           func() error { _, err := v.Check(ctx, srv.URL+"/tiny.mp4"); return err },
		"how large":           func() error { _, _, err := v.Open(ctx, srv.URL+"/unsized.mp4"); return err },
		"404":                 func() error { _, err := v.Check(ctx, srv.URL+"/gone.mp4"); return err },
		"the limit is":        func() error { _, err := small.Check(ctx, srv.URL+"/films/launch.mp4"); return err },
		"start with https":    func() error { _, err := v.Check(ctx, "http://example.com/a.mp4"); return err },
		"must start with htt": func() error { _, err := v.Check(ctx, srv.URL+"/plain"); return err }, // a redirect to http
		"web address":         func() error { _, err := v.Check(ctx, "video.mp4"); return err },
	} {
		if err := got(); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want %q, got %v", want, err)
		}
	}
}

func TestVideoAddressesMustBePublic(t *testing.T) {
	srv, _ := videoHost(t)
	v := NewVideos(0)
	for _, u := range []string{"https://127.0.0.1/a.mp4", "https://10.1.2.3/a.mp4", "https://169.254.169.254/a.mp4", "https://[::1]/a.mp4", "https://localhost/a.mp4", srv.URL + "/films/launch.mp4", "https://user:pw@example.com/a.mp4", "https://example.com:8443/a.mp4"} {
		if _, err := v.Check(context.Background(), u); err == nil {
			t.Errorf("%s was accepted", u)
		} else if strings.Contains(err.Error(), "Could not reach") {
			t.Errorf("%s was dialled: %v", u, err)
		}
	}
}
