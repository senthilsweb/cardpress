package source

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/net/html/charset"
)

const (
	maxBytes     = 2 << 20 // read at most this much of a page
	maxChars     = 40_000  // keep at most this much text
	maxRedirects = 5
	fetchTimeout = 20 * time.Second
)

// Source is the readable content of a page. Its text is untrusted: it came from the internet.
type Source struct {
	URL       string `json:"url"` // the final address, after redirects
	Title     string `json:"title"`
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
}

// Error is a problem with the address or the page, worded for the person who typed the address.
type Error struct{ Message string }

func (e *Error) Error() string { return e.Message }

func fail(format string, a ...any) error { return &Error{fmt.Sprintf(format, a...)} }

// Fetcher downloads and reads pages.
type Fetcher struct {
	client       *http.Client
	allowPrivate bool
}

// New returns a Fetcher that refuses anything but the public web.
func New() *Fetcher { return newFetcher(false) }

func newFetcher(allowPrivate bool) *Fetcher {
	d := &net.Dialer{Timeout: 10 * time.Second, Control: control(allowPrivate)}
	f := &Fetcher{allowPrivate: allowPrivate}
	f.client = &http.Client{
		Timeout: fetchTimeout,
		Transport: &http.Transport{
			Proxy:                  nil, // a proxy from the environment would be dialled instead of the page, bypassing the check
			DialContext:            d.DialContext,
			TLSHandshakeTimeout:    10 * time.Second,
			ResponseHeaderTimeout:  10 * time.Second,
			MaxResponseHeaderBytes: 64 << 10,
			DisableKeepAlives:      true,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > maxRedirects {
				return fail("The page redirected more than %d times.", maxRedirects)
			}
			return f.checkURL(req.URL)
		},
	}
	return f
}

// checkURL refuses anything that is not a plain http(s) address on a web port, and IP addresses that are not public.
func (f *Fetcher) checkURL(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" {
		return fail("Only http and https addresses can be read.")
	}
	if u.Hostname() == "" {
		return fail("The address has no host name.")
	}
	if u.User != nil {
		return fail("Addresses with a user name or password are not accepted.")
	}
	if f.allowPrivate {
		return nil
	}
	if !allowedPort(u.Port()) {
		return fail("Only the standard web ports (80 and 443) are allowed.")
	}
	if a, err := netip.ParseAddr(u.Hostname()); err == nil {
		if why := blockedReason(a); why != "" {
			return fail("That address is %s, so it cannot be read.", why)
		}
	}
	return nil
}

// Fetch reads a page. The returned text is capped, and Truncated says so.
func (f *Fetcher) Fetch(ctx context.Context, raw string) (Source, error) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" {
		return Source{}, fail("That does not look like a web address. Include https://")
	}
	if err := f.checkURL(u); err != nil {
		return Source{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return Source{}, fail("That does not look like a web address.")
	}
	req.Header.Set("User-Agent", "CardPress/1 (+https://github.com/senthilsweb/cardpress)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,text/markdown;q=0.8")
	resp, err := f.client.Do(req)
	if err != nil {
		var se *Error
		if errors.As(err, &se) {
			return Source{}, se
		}
		if strings.Contains(err.Error(), "is a ") || strings.Contains(err.Error(), "not allowed") {
			return Source{}, fail("That address points to somewhere that cannot be read (%s).", cleanDialError(err))
		}
		return Source{}, fail("Could not reach that page. Check the address and try again.")
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return Source{}, fail("The page answered %d %s.", resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	ct := resp.Header.Get("Content-Type")
	media, _, _ := mime.ParseMediaType(ct)
	isHTML := media == "text/html" || media == "application/xhtml+xml"
	isText := media == "text/plain" || media == "text/markdown"
	if ct != "" && !isHTML && !isText {
		return Source{}, fail("That address is not a web page or plain text (it is %s).", media)
	}
	limited := io.LimitReader(resp.Body, maxBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return Source{}, fail("The page could not be read completely. Try again.")
	}
	truncated := len(body) > maxBytes
	if truncated {
		body = body[:maxBytes]
	}
	// decode non-UTF-8 pages (Latin-1, Shift-JIS …) using the declared or sniffed charset
	if r, cerr := charset.NewReader(strings.NewReader(string(body)), ct); cerr == nil {
		if decoded, rerr := io.ReadAll(r); rerr == nil {
			body = decoded
		}
	}
	if ct == "" && !strings.HasPrefix(strings.TrimSpace(string(body)), "<") {
		isText = true
	}
	var title, text string
	if isText && !isHTML {
		text = strings.TrimSpace(strings.ReplaceAll(string(body), "\r\n", "\n"))
	} else {
		title, text = ExtractText(body)
	}
	if strings.TrimSpace(text) == "" {
		return Source{}, fail("No readable text was found on that page. It may need JavaScript or a login.")
	}
	if utf8.RuneCountInString(text) > maxChars {
		r := []rune(text)[:maxChars]
		text = strings.TrimSpace(string(r))
		if i := strings.LastIndex(text, "\n\n"); i > maxChars/2 {
			text = text[:i]
		}
		truncated = true
	}
	return Source{URL: resp.Request.URL.String(), Title: title, Text: text, Truncated: truncated}, nil
}

// cleanDialError keeps the useful tail of a dial error ("10.0.0.1 is a private or reserved address").
func cleanDialError(err error) string {
	s := err.Error()
	if i := strings.LastIndex(s, ": "); i >= 0 {
		s = s[i+2:]
	}
	return s
}
