package source

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// A post's video is given as a public https address. It is checked when it is entered and read again when the post is
// sent; it is passed straight on and never written to disk or the database. The same address guard as for articles
// applies, to the first address and to every redirect.

const (
	// MinVideoBytes and MaxVideoBytes are LinkedIn's published limits for a video file (75 KB to 500 MB).
	MinVideoBytes = 75 << 10
	MaxVideoBytes = 500 << 20

	maxVideoURL  = 2000
	checkTimeout = 20 * time.Second
)

// VideoInfo is what a check of a video address found.
type VideoInfo struct {
	URL  string // as entered, trimmed
	Name string // the file name in the address, for a title; may be empty
	Size int64
}

// Videos reads video files from public addresses.
type Videos struct {
	f   *Fetcher
	max int64
}

// NewVideos returns a reader that accepts videos up to max bytes (MaxVideoBytes if zero or larger).
func NewVideos(max int64) *Videos { return newVideos(max, false, nil) }

func newVideos(max int64, allowPrivate bool, transport *http.Transport) *Videos {
	if max <= 0 || max > MaxVideoBytes {
		max = MaxVideoBytes
	}
	f := &Fetcher{allowPrivate: allowPrivate}
	if transport == nil {
		d := &net.Dialer{Timeout: 10 * time.Second, Control: control(allowPrivate)}
		transport = &http.Transport{DialContext: d.DialContext}
	}
	transport.Proxy = nil // a proxy from the environment would be dialled instead of the address, bypassing the check
	transport.TLSHandshakeTimeout = 10 * time.Second
	transport.ResponseHeaderTimeout = 15 * time.Second
	transport.MaxResponseHeaderBytes = 64 << 10
	transport.DisableKeepAlives = true
	transport.DisableCompression = true // the size must be the size of the file
	// no client timeout: a large file takes as long as the caller's context allows
	f.client = &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > maxRedirects {
			return fail("The video address redirected more than %d times.", maxRedirects)
		}
		return f.checkVideoURL(req.URL)
	}}
	return &Videos{f: f, max: max}
}

func (f *Fetcher) checkVideoURL(u *url.URL) error {
	if u.Scheme != "https" {
		return fail("The video address must start with https://")
	}
	var se *Error
	if err := f.checkURL(u); errors.As(err, &se) {
		return fail("%s", strings.Replace(se.Message, "cannot be read", "cannot be used", 1))
	}
	return nil
}

// get asks for the address, with an optional Range, and returns the answer once its status is acceptable.
func (v *Videos) get(ctx context.Context, raw, byteRange string) (*http.Response, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || len(raw) > maxVideoURL {
		return nil, fail("That does not look like a web address. Include https://")
	}
	if err := v.f.checkVideoURL(u); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fail("That does not look like a web address.")
	}
	req.Header.Set("User-Agent", "CardPress/1 (+https://github.com/senthilsweb/cardpress)")
	req.Header.Set("Accept-Encoding", "identity")
	if byteRange != "" {
		req.Header.Set("Range", byteRange)
	}
	resp, err := v.f.client.Do(req)
	if err != nil {
		var se *Error
		if errors.As(err, &se) {
			return nil, se
		}
		if strings.Contains(err.Error(), "is a ") || strings.Contains(err.Error(), "not allowed") {
			return nil, fail("That address points to somewhere that cannot be used (%s).", cleanDialError(err))
		}
		return nil, fail("Could not reach the video address.")
	}
	if resp.StatusCode != http.StatusOK && !(byteRange != "" && resp.StatusCode == http.StatusPartialContent) {
		resp.Body.Close()
		return nil, fail("The video address answered %d %s.", resp.StatusCode, http.StatusText(resp.StatusCode))
	}
	return resp, nil
}

// size is the whole file's size as the answer states it, or -1.
func size(resp *http.Response) int64 {
	if resp.StatusCode == http.StatusPartialContent {
		_, total, ok := strings.Cut(resp.Header.Get("Content-Range"), "/")
		n, err := strconv.ParseInt(total, 10, 64)
		if !ok || err != nil {
			return -1
		}
		return n
	}
	return resp.ContentLength
}

func (v *Videos) accept(resp *http.Response) (int64, *bufio.Reader, error) {
	n := size(resp)
	switch {
	case n < 0:
		return 0, nil, fail("The server does not say how large the video is, so it cannot be used.")
	case n > v.max:
		return 0, nil, fail("The video is %d MB; the limit is %d MB.", (n+(1<<20)-1)>>20, v.max>>20)
	case n < MinVideoBytes:
		return 0, nil, fail("The file is too small to be a video (LinkedIn needs at least 75 KB).")
	}
	// the file says what it is: an MP4 has "ftyp" after its first four bytes. The Content-Type is not trusted.
	r := bufio.NewReader(resp.Body)
	head, err := r.Peek(8)
	if err != nil || string(head[4:8]) != "ftyp" {
		return 0, nil, fail("That address is not an MP4 video. Use a direct link to the .mp4 file.")
	}
	return n, r, nil
}

// Check asks for the start of the file and reports whether the address can be used.
func (v *Videos) Check(ctx context.Context, raw string) (VideoInfo, error) {
	raw = strings.TrimSpace(raw)
	ctx, cancel := context.WithTimeout(ctx, checkTimeout)
	defer cancel()
	resp, err := v.get(ctx, raw, "bytes=0-31")
	if err != nil {
		return VideoInfo{}, err
	}
	defer resp.Body.Close() // a server that ignores the range sends everything: closing stops it
	n, _, err := v.accept(resp)
	if err != nil {
		return VideoInfo{}, err
	}
	u, _ := url.Parse(raw)
	name := u.Path[strings.LastIndexByte(u.Path, '/')+1:]
	return VideoInfo{URL: raw, Name: name, Size: n}, nil
}

// Open starts reading the whole file. The caller closes it. The context bounds the whole read.
func (v *Videos) Open(ctx context.Context, raw string) (io.ReadCloser, int64, error) {
	resp, err := v.get(ctx, strings.TrimSpace(raw), "")
	if err != nil {
		return nil, 0, err
	}
	n, r, err := v.accept(resp)
	if err != nil {
		resp.Body.Close()
		return nil, 0, err
	}
	return struct {
		io.Reader
		io.Closer
	}{r, resp.Body}, n, nil
}
