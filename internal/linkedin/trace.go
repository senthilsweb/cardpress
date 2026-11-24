package linkedin

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"sync"
	"time"
)

// Step is what one call to LinkedIn looked like and what came back. It is a record for the person who posted: it holds the
// answer, never the request, so the access token is not in it.
type Step struct {
	Step    string            `json:"step"`
	Method  string            `json:"method"`
	Host    string            `json:"host"`
	Path    string            `json:"path"` // without the query: an upload address carries a signature there
	Status  int               `json:"status,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	Error   string            `json:"error,omitempty"`
	At      string            `json:"at"`
	Millis  int64             `json:"ms"`
}

// Trace collects the steps of one publish attempt.
type Trace struct {
	mu    sync.Mutex
	steps []Step
}

// Steps returns what was recorded so far.
func (t *Trace) Steps() []Step {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]Step(nil), t.steps...)
}

type traceKey struct{}

// WithTrace returns a context that makes Publish record each call it makes.
func WithTrace(ctx context.Context) (context.Context, *Trace) {
	t := &Trace{}
	return context.WithValue(ctx, traceKey{}, t), t
}

const maxTraceBody = 2000

// an address in an answer may carry a signature in its query (the upload address does): keep the address, drop the query
var queryInAddress = regexp.MustCompile(`(https?://[^"\s?\\]+)\?[^"\s\\]*`)

// the answer headers worth keeping: ids to quote to LinkedIn, and the limits
var keepHeaders = []string{"X-Restli-Id", "X-Li-Uuid", "X-Li-Request-Id", "X-Li-Fabric", "X-Linkedin-Error-Response", "Retry-After", "Content-Type", "Date"}

func (t *Trace) record(step string, req *http.Request, started time.Time, resp *http.Response, body []byte, err error) {
	s := Step{Step: step, Method: req.Method, At: started.UTC().Format(time.RFC3339), Millis: time.Since(started).Milliseconds()}
	if req.URL != nil {
		u := url.URL{Path: req.URL.Path}
		s.Host, s.Path = req.URL.Hostname(), u.Path
	}
	if err != nil {
		s.Error = "no answer"
	}
	if resp != nil {
		s.Status = resp.StatusCode
		for _, h := range keepHeaders {
			if v := resp.Header.Get(h); v != "" {
				if s.Headers == nil {
					s.Headers = map[string]string{}
				}
				s.Headers[h] = v
			}
		}
		b := queryInAddress.ReplaceAllString(string(body), "$1?…")
		if len(b) > maxTraceBody {
			b = b[:maxTraceBody] + "…"
		}
		s.Body = b
	}
	t.mu.Lock()
	t.steps = append(t.steps, s)
	t.mu.Unlock()
}
