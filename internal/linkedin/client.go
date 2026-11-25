// Package linkedin publishes a post with a picture, several pictures, a document or a video: it reserves an upload,
// sends the file, then creates the post.
package linkedin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultVersion is the LinkedIn-Version header sent with every call. LinkedIn retires versions about a year after
// release, so this must be kept current (or overridden with CARDPRESS_LINKEDIN_VERSION).
const DefaultVersion = "202610"

// Doer is the part of http.Client used here.
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}

// Client talks to the LinkedIn REST API.
type Client struct {
	HTTP    Doer
	APIBase string // https://api.linkedin.com
	Version string
	// AllowUploadHost says whether the upload address LinkedIn returned may be used. The bearer token is only ever
	// sent to hosts this accepts.
	AllowUploadHost func(host string) bool
	// AllowHTTP permits a plain-http upload address. For tests against a local fake only.
	AllowHTTP bool
	// How long to wait for LinkedIn to process a video, and how often to ask (defaults if zero). BlindWait is the wait
	// when the token may not read the video's status.
	VideoWait, VideoPoll, VideoBlindWait time.Duration
}

// New returns a client for the real LinkedIn API. It never follows redirects, so the token is not forwarded.
func New(apiBase, version string) *Client {
	if apiBase == "" {
		apiBase = "https://api.linkedin.com"
	}
	if version == "" {
		version = DefaultVersion
	}
	c := &Client{
		HTTP: &http.Client{
			Timeout:       60 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		APIBase:         strings.TrimRight(apiBase, "/"),
		Version:         version,
		AllowUploadHost: isLinkedInHost,
	}
	// A plain-http loopback address (a local fake or a proxy for testing) may also receive the upload.
	if u, err := url.Parse(c.APIBase); err == nil && u.Scheme == "http" && isLoopbackHost(u.Hostname()) {
		c.AllowHTTP = true
		c.AllowUploadHost = func(h string) bool { return isLinkedInHost(h) || h == u.Hostname() }
	}
	return c
}

func isLoopbackHost(h string) bool { return h == "localhost" || h == "127.0.0.1" || h == "::1" }

func isLinkedInHost(host string) bool {
	host = strings.ToLower(host)
	for _, suffix := range []string{"linkedin.com", "licdn.com"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

// Post is what to publish.
type Post struct {
	AuthorURN   string // urn:li:person:… or urn:li:organization:…
	Commentary  string // already escaped: see Commentary
	AltText     string
	Image       []byte // the file: a picture, or a document when Document is set
	ContentType string
	// Document posts the file as a document (a PDF, shown as pages to swipe through) with Title above it.
	Document bool
	Title    string
	// Pictures, when there are two or more, are posted together as a multi-image post and Image is not used.
	Pictures []Picture
	// Video, when set, is posted with Title above it, and Image is not used.
	Video *Video
}

// Picture is one picture of a multi-image post. Load reads its bytes when it is its turn to be uploaded, so the
// pictures are never all in memory together.
type Picture struct {
	AltText string
	Load    func() ([]byte, error)
}

// APIError is a failure where LinkedIn answered, or a step failed before anything was posted.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return e.Message }

// UnknownOutcomeError means the post may or may not exist: the request to create it was sent but the answer was lost,
// was a server error, or lacked the post id. The caller must check LinkedIn by hand and must not retry blindly.
type UnknownOutcomeError struct{ Reason string }

func (e *UnknownOutcomeError) Error() string { return e.Reason }

// IsUnknownOutcome reports whether err is an UnknownOutcomeError.
func IsUnknownOutcome(err error) bool {
	var u *UnknownOutcomeError
	return errors.As(err, &u)
}

func (c *Client) headers(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("LinkedIn-Version", c.Version)
	req.Header.Set("X-Restli-Protocol-Version", "2.0.0")
}

// friendly turns an unsuccessful answer into a message a person can act on. It never includes the request.
func friendly(status int, body []byte, step string) *APIError {
	var parsed struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(body, &parsed)
	detail := strings.TrimSpace(parsed.Message)
	if len(detail) > 300 {
		detail = detail[:300] + "…"
	}
	var msg string
	switch {
	case status == http.StatusUnauthorized:
		msg = "LinkedIn rejected the access token. It may have expired: enter a new one in Social accounts."
	case status == http.StatusForbidden:
		msg = "LinkedIn refused this action. Check that the token has the w_member_social (or w_organization_social) scope and matches the author URN."
	case status == http.StatusTooManyRequests:
		msg = "LinkedIn's rate limit was reached. Try again later."
	case status == http.StatusUpgradeRequired:
		// LinkedIn retires API versions about a year after release and answers 426 for one that is no longer active
		msg = "LinkedIn no longer accepts the API version this app sends. Set CARDPRESS_LINKEDIN_VERSION to a current version (YYYYMM, see LinkedIn's API versioning page) and restart."
	default:
		msg = fmt.Sprintf("LinkedIn could not %s (%d %s).", step, status, http.StatusText(status))
	}
	if detail != "" && status != http.StatusUnauthorized {
		msg += " LinkedIn said: " + detail
	}
	return &APIError{Status: status, Message: msg}
}

func (c *Client) do(step string, req *http.Request) (*http.Response, []byte, error) {
	started := time.Now()
	tr, _ := req.Context().Value(traceKey{}).(*Trace)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		if tr != nil {
			tr.record(step, req, started, nil, nil, err)
		}
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if tr != nil {
		tr.record(step, req, started, resp, body, nil)
	}
	return resp, body, nil
}

// Publish creates an image post and returns its URN. Errors before the final step are *APIError (nothing was posted).
// An unclear result of the final step is an *UnknownOutcomeError.
func (c *Client) Publish(ctx context.Context, token string, p Post) (string, error) {
	if token == "" || p.AuthorURN == "" {
		return "", &APIError{Message: "The LinkedIn access token and author URN are required."}
	}
	if p.Document && strings.TrimSpace(p.Title) == "" {
		return "", &APIError{Message: "The document needs a title."}
	}
	if p.Video != nil && strings.TrimSpace(p.Title) == "" {
		return "", &APIError{Message: "The video needs a title."}
	}

	// 1 and 2. upload what the post carries: one picture, a document, or several pictures one after another
	var content map[string]any
	switch {
	case p.Video != nil:
		id, err := c.uploadVideo(ctx, token, p.AuthorURN, p.Video)
		if err != nil {
			return "", err
		}
		content = map[string]any{"media": map[string]string{"id": id, "title": strings.TrimSpace(p.Title)}}
	case len(p.Pictures) >= 2:
		images := make([]map[string]string, 0, len(p.Pictures))
		for i, pic := range p.Pictures {
			what := fmt.Sprintf("image %d of %d", i+1, len(p.Pictures))
			data, err := pic.Load()
			if err != nil {
				return "", &APIError{Message: "Could not read " + what + ". Nothing was posted."}
			}
			id, err := c.upload(ctx, token, p.AuthorURN, what, false, data)
			if err != nil {
				return "", err
			}
			im := map[string]string{"id": id}
			if pic.AltText != "" {
				im["altText"] = pic.AltText
			}
			images = append(images, im)
		}
		content = map[string]any{"multiImage": map[string]any{"images": images}}
	case p.Document:
		id, err := c.upload(ctx, token, p.AuthorURN, "document", true, p.Image)
		if err != nil {
			return "", err
		}
		content = map[string]any{"media": map[string]string{"id": id, "title": strings.TrimSpace(p.Title)}}
	default:
		id, err := c.upload(ctx, token, p.AuthorURN, "image", false, p.Image)
		if err != nil {
			return "", err
		}
		media := map[string]string{"id": id}
		if p.AltText != "" {
			media["altText"] = p.AltText
		}
		content = map[string]any{"media": media}
	}

	// 3. create the post. From here on a lost answer leaves the outcome unknown.
	payload, _ := json.Marshal(map[string]any{
		"author":     p.AuthorURN,
		"commentary": p.Commentary,
		"visibility": "PUBLIC",
		"distribution": map[string]any{
			"feedDistribution":               "MAIN_FEED",
			"targetEntities":                 []any{},
			"thirdPartyDistributionChannels": []any{},
		},
		"content":                   content,
		"lifecycleState":            "PUBLISHED",
		"isReshareDisabledByAuthor": false,
	})
	post, err := http.NewRequestWithContext(ctx, http.MethodPost, c.APIBase+"/rest/posts", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	c.headers(post, token)
	post.Header.Set("Content-Type", "application/json")
	resp, body, err := c.do("Create the post", post)
	if err != nil {
		return "", &UnknownOutcomeError{Reason: "The request to create the post was sent but no answer came back, so it may or may not have been posted."}
	}
	switch {
	case resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK:
		id := resp.Header.Get("x-restli-id")
		if id == "" {
			return "", &UnknownOutcomeError{Reason: "LinkedIn accepted the post but did not return its id, so it may be live."}
		}
		return id, nil
	case resp.StatusCode >= 500:
		return "", &UnknownOutcomeError{Reason: fmt.Sprintf("LinkedIn answered with a server error (%d) while creating the post, so it may or may not have been posted.", resp.StatusCode)}
	default:
		return "", friendly(resp.StatusCode, body, "create the post")
	}
}

// upload reserves an upload with LinkedIn and sends one file to the address it returns, which must be a LinkedIn host.
// It returns the id to name in the post. `what` says what the file is, for the messages ("image", "image 2 of 3",
// "document"). Nothing has been posted when it fails.
func (c *Client) upload(ctx context.Context, token, owner, what string, document bool, data []byte) (string, error) {
	path := "/rest/images"
	if document {
		path = "/rest/documents"
	}
	if len(data) == 0 {
		return "", &APIError{Message: "There is no " + what + " to upload."}
	}
	initBody, _ := json.Marshal(map[string]any{"initializeUploadRequest": map[string]string{"owner": owner}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.APIBase+path+"?action=initializeUpload", bytes.NewReader(initBody))
	if err != nil {
		return "", err
	}
	c.headers(req, token)
	req.Header.Set("Content-Type", "application/json")
	resp, body, err := c.do("Reserve the "+what+" upload", req)
	if err != nil {
		return "", &APIError{Message: "Could not reach LinkedIn to start the " + what + " upload. Nothing was posted."}
	}
	if resp.StatusCode/100 != 2 {
		return "", friendly(resp.StatusCode, body, "start the "+what+" upload")
	}
	var init struct {
		Value struct {
			UploadURL string `json:"uploadUrl"`
			Image     string `json:"image"`
			Document  string `json:"document"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &init); err != nil {
		init.Value.UploadURL = ""
	}
	id := init.Value.Image
	if document {
		id = init.Value.Document
	}
	if init.Value.UploadURL == "" || id == "" {
		return "", &APIError{Message: "LinkedIn's answer to the " + what + " upload request was not understood. Nothing was posted."}
	}

	u, ok := c.uploadAddress(init.Value.UploadURL)
	if !ok {
		return "", &APIError{Message: "LinkedIn returned an upload address that is not a LinkedIn host, so the " + what + " was not sent. Nothing was posted."}
	}
	up, err := http.NewRequestWithContext(ctx, http.MethodPut, u.String(), bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	up.Header.Set("Authorization", "Bearer "+token)
	resp, body, err = c.do("Upload the "+what, up)
	if err != nil {
		return "", &APIError{Message: "Could not upload the " + what + " to LinkedIn. Nothing was posted."}
	}
	if resp.StatusCode/100 != 2 {
		return "", friendly(resp.StatusCode, body, "accept the "+what)
	}
	return id, nil
}

// uploadAddress accepts an upload address LinkedIn returned only when it is a LinkedIn host.
func (c *Client) uploadAddress(raw string) (*url.URL, bool) {
	u, err := url.Parse(raw)
	if err != nil || !(u.Scheme == "https" || (c.AllowHTTP && u.Scheme == "http")) || c.AllowUploadHost == nil || !c.AllowUploadHost(u.Hostname()) {
		return nil, false
	}
	return u, true
}

// PostURL is the public address of a post URN.
func PostURL(urn string) string {
	if urn == "" {
		return ""
	}
	return "https://www.linkedin.com/feed/update/" + urn + "/"
}
