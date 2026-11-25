package linkedin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// A video goes to LinkedIn through the Videos API: reserve the upload (which says how to cut the file into parts), send
// each part, finalise with the parts' ids, wait until LinkedIn has processed it, then create the post. The file is read
// once, from start to end, with only one part in memory.

const (
	maxVideoPart     = 8 << 20 // LinkedIn asks for 4 MB parts; anything much larger is refused rather than buffered
	defaultVideoWait = 10 * time.Minute
	defaultVideoPoll = 5 * time.Second
	defaultBlindWait = 30 * time.Second
)

// Video is a video to post.
type Video struct {
	Size int64
	// Open starts reading the file. It is called once, before anything is reserved at LinkedIn.
	Open func(context.Context) (io.ReadCloser, error)
	// Progress, when set, is called as the upload and the processing move on, so a long job is known to be alive.
	Progress func()
}

// NotReadyError means the video was uploaded but LinkedIn had not finished processing it in time. No post was created.
type NotReadyError struct{}

func (e *NotReadyError) Error() string {
	return "LinkedIn was still processing the video when the time ran out, so the post was not created."
}

func (v *Video) progress() {
	if v.Progress != nil {
		v.Progress()
	}
}

// postJSON sends one Videos API call and returns the answer's body.
func (c *Client) postJSON(ctx context.Context, token, step, what, path string, payload any) ([]byte, error) {
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.APIBase+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	c.headers(req, token)
	req.Header.Set("Content-Type", "application/json")
	resp, body, err := c.do(step, req)
	if err != nil {
		return nil, &APIError{Message: "Could not reach LinkedIn to " + what + ". Nothing was posted."}
	}
	if resp.StatusCode/100 != 2 {
		return nil, friendly(resp.StatusCode, body, what)
	}
	return body, nil
}

func (c *Client) uploadVideo(ctx context.Context, token, owner string, v *Video) (string, error) {
	if v.Size <= 0 || v.Open == nil {
		return "", &APIError{Message: "There is no video to upload."}
	}
	// the file is opened first, so a bad address fails before anything is asked of LinkedIn
	file, err := v.Open(ctx)
	if err != nil {
		return "", &APIError{Message: "Could not read the video: " + err.Error() + " Nothing was posted."}
	}
	defer file.Close()

	body, err := c.postJSON(ctx, token, "Reserve the video upload", "start the video upload", "/rest/videos?action=initializeUpload",
		map[string]any{"initializeUploadRequest": map[string]any{"owner": owner, "fileSizeBytes": v.Size, "uploadCaptions": false, "uploadThumbnail": false}})
	if err != nil {
		return "", err
	}
	var init struct {
		Value struct {
			Video        string `json:"video"`
			UploadToken  string `json:"uploadToken"` // may be empty: it is passed back as it came
			Instructions []struct {
				UploadURL string `json:"uploadUrl"`
				FirstByte int64  `json:"firstByte"`
				LastByte  int64  `json:"lastByte"`
			} `json:"uploadInstructions"`
		} `json:"value"`
	}
	notUnderstood := &APIError{Message: "LinkedIn's answer to the video upload request was not understood. Nothing was posted."}
	if err := json.Unmarshal(body, &init); err != nil || init.Value.Video == "" || len(init.Value.Instructions) == 0 {
		return "", notUnderstood
	}
	// the parts must cover the file exactly, in order, since it is read once
	var next int64
	for _, p := range init.Value.Instructions {
		if p.FirstByte != next || p.LastByte < p.FirstByte || p.LastByte-p.FirstByte+1 > maxVideoPart {
			return "", notUnderstood
		}
		next = p.LastByte + 1
	}
	if next != v.Size {
		return "", notUnderstood
	}

	total := len(init.Value.Instructions)
	parts := make([]string, 0, total)
	var buf []byte
	for i, p := range init.Value.Instructions {
		what := fmt.Sprintf("part %d of %d of the video", i+1, total)
		u, ok := c.uploadAddress(p.UploadURL)
		if !ok {
			return "", &APIError{Message: "LinkedIn returned an upload address that is not a LinkedIn host, so the video was not sent. Nothing was posted."}
		}
		n := int(p.LastByte - p.FirstByte + 1)
		if cap(buf) < n {
			buf = make([]byte, n)
		}
		buf = buf[:n]
		if _, err := io.ReadFull(file, buf); err != nil {
			return "", &APIError{Message: "The video stopped arriving from its address at " + what + ". Nothing was posted."}
		}
		// no access token here: the address LinkedIn gives carries its own signature
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, u.String(), bytes.NewReader(buf))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/octet-stream")
		resp, answer, err := c.do("Upload "+what, req)
		if err != nil {
			return "", &APIError{Message: "Could not upload " + what + " to LinkedIn. Nothing was posted."}
		}
		if resp.StatusCode/100 != 2 {
			return "", friendly(resp.StatusCode, answer, "accept "+what)
		}
		id := resp.Header.Get("ETag")
		if id == "" {
			return "", &APIError{Message: "LinkedIn did not return an id for " + what + ". Nothing was posted."}
		}
		parts = append(parts, id) // exactly as given
		v.progress()
	}

	if _, err := c.postJSON(ctx, token, "Finish the video upload", "finish the video upload", "/rest/videos?action=finalizeUpload",
		map[string]any{"finalizeUploadRequest": map[string]any{"video": init.Value.Video, "uploadToken": init.Value.UploadToken, "uploadedPartIds": parts}}); err != nil {
		return "", err
	}
	if err := c.waitForVideo(ctx, token, init.Value.Video, v); err != nil {
		return "", err
	}
	return init.Value.Video, nil
}

func or(d, def time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return def
}

// waitForVideo returns when LinkedIn says the video is ready. LinkedIn's documentation does not say whether a member's
// token may read that: when it is refused, a fixed short wait is used instead, and creating the post is then LinkedIn's
// chance to refuse a video that is not ready.
func (c *Client) waitForVideo(ctx context.Context, token, urn string, v *Video) error {
	ctx, cancel := context.WithTimeout(ctx, or(c.VideoWait, defaultVideoWait))
	defer cancel()
	pause := func(d time.Duration) bool {
		select {
		case <-ctx.Done():
			return false
		case <-time.After(d):
			return true
		}
	}
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.APIBase+"/rest/videos/"+url.QueryEscape(urn), nil)
		if err != nil {
			return err
		}
		c.headers(req, token)
		resp, body, err := c.do("Check the video", req)
		switch {
		case err != nil: // ask again until the time runs out
		case resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized:
			if !pause(or(c.VideoBlindWait, defaultBlindWait)) {
				return &NotReadyError{}
			}
			return nil
		case resp.StatusCode/100 == 2:
			var s struct {
				Status string `json:"status"`
				Reason string `json:"processingFailureReason"`
			}
			_ = json.Unmarshal(body, &s)
			switch s.Status {
			case "AVAILABLE":
				return nil
			case "PROCESSING_FAILED":
				msg := "LinkedIn could not process the video."
				if r := strings.TrimSpace(s.Reason); r != "" && len(r) <= 300 {
					msg += " LinkedIn said: " + r
				}
				return &APIError{Message: msg + " Nothing was posted."}
			}
		}
		v.progress()
		if !pause(or(c.VideoPoll, defaultVideoPoll)) {
			return &NotReadyError{}
		}
	}
}
