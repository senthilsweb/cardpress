package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// doer is the part of http.Client the service uses.
type doer interface {
	Do(*http.Request) (*http.Response, error)
}

// defaultClient never follows redirects, so credentials are only ever sent to the address we chose.
func defaultClient() doer {
	return &http.Client{
		Timeout:       15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// Test statuses.
const (
	TestValid      = "valid"
	TestInvalid    = "invalid"
	TestExpired    = "expired"
	TestIncomplete = "incomplete"
	TestError      = "error" // could not reach LinkedIn; says nothing about the credentials
)

// Check is one line of a test result.
type Check struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// TestResult is the outcome of "Test connection". It never contains a credential.
type TestResult struct {
	Status    string     `json:"status"`
	Message   string     `json:"message"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
	Checks    []Check    `json:"checks,omitempty"`
}

var urnRe = regexp.MustCompile(`^urn:li:(person|organization):[A-Za-z0-9_-]+$`)

// Test checks a network's credentials. Only LinkedIn is supported.
//
// It asks LinkedIn's token introspection endpoint whether the access token is active and when it expires, then checks
// the author URN's shape and that the token's scopes allow posting as that author.
func (s *Settings) Test(ctx context.Context, profileID, id string) (TestResult, error) {
	spec, ok := networkByID(id)
	if !ok {
		return TestResult{}, ErrNotFound
	}
	if !spec.Testable {
		return TestResult{}, ErrUnsupported
	}
	creds, err := s.Resolve(ctx, profileID, id)
	if err != nil {
		return TestResult{Status: TestInvalid, Message: err.Error()}, nil
	}
	var missing []string
	for _, f := range spec.Fields {
		if creds[f.Key] == "" {
			missing = append(missing, f.Label)
		}
	}
	if len(missing) > 0 {
		return TestResult{Status: TestIncomplete, Message: "Still needed: " + strings.Join(missing, ", ") + "."}, nil
	}

	var res TestResult
	m := urnRe.FindStringSubmatch(creds["authorUrn"])
	urnOK := m != nil
	if urnOK {
		res.Checks = append(res.Checks, Check{true, "Author URN looks right (" + m[1] + ")."})
	} else {
		res.Checks = append(res.Checks, Check{false, "Author URN should look like urn:li:person:… or urn:li:organization:…"})
	}

	form := url.Values{"client_id": {creds["clientId"]}, "client_secret": {creds["clientSecret"]}, "token": {creds["accessToken"]}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.linkedinIntrospect, strings.NewReader(form.Encode()))
	if err != nil {
		return TestResult{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpClient().Do(req)
	if err != nil {
		res.Status, res.Message = TestError, "Could not reach LinkedIn. Check the network connection and try again."
		return res, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusBadRequest:
		res.Status, res.Message = TestInvalid, introspectRejection(body)
		return res, nil
	case resp.StatusCode >= 300:
		res.Status, res.Message = TestError, "LinkedIn answered with an error ("+http.StatusText(resp.StatusCode)+"). Try again later."
		return res, nil
	}

	var out struct {
		Active    bool   `json:"active"`
		Status    string `json:"status"`
		ExpiresAt int64  `json:"expires_at"`
		Scope     string `json:"scope"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		res.Status, res.Message = TestError, "LinkedIn's answer was not understood."
		return res, nil
	}
	if out.ExpiresAt > 0 {
		t := time.Unix(out.ExpiresAt, 0).UTC()
		res.ExpiresAt = &t
	}
	if !out.Active {
		if out.Status == "expired" || (res.ExpiresAt != nil && res.ExpiresAt.Before(s.now())) {
			res.Status, res.Message = TestExpired, "The access token has expired. Create a new one and enter it here."
		} else {
			res.Status, res.Message = TestInvalid, "LinkedIn says the access token is not active."
		}
		return res, nil
	}

	scopes := strings.FieldsFunc(out.Scope, func(r rune) bool { return r == ',' || r == ' ' })
	has := func(want string) bool {
		for _, sc := range scopes {
			if sc == want {
				return true
			}
		}
		return false
	}
	res.Checks = append(res.Checks, Check{true, "Access token is active."})
	scopeOK := true
	if urnOK {
		want := "w_member_social"
		if m[1] == "organization" {
			want = "w_organization_social"
		}
		if has(want) {
			res.Checks = append(res.Checks, Check{true, "Token may post as this author (" + want + ")."})
		} else {
			scopeOK = false
			res.Checks = append(res.Checks, Check{false, "Token is missing the " + want + " scope needed to post as this author."})
		}
	}
	if urnOK && scopeOK {
		res.Status, res.Message = TestValid, "Credentials are valid."
	} else {
		res.Status, res.Message = TestInvalid, "The token works, but cannot post as this author."
	}
	return res, nil
}

// introspectRejection says why LinkedIn refused the check. LinkedIn names the cause in an error code; its description is
// not shown because it repeats the value that was sent, and a secret pasted in the wrong box must not be echoed back.
func introspectRejection(body []byte) string {
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &e)
	switch e.Error {
	case "invalid_client_id":
		return "LinkedIn does not know this Client ID. Copy it again from the app's Auth tab (it is not the secret)."
	case "invalid_client_secret":
		return "The Client ID is right but the Client secret is not. Copy the Primary Client Secret again from the Auth tab."
	case "invalid_client", "unauthorized_client":
		return "LinkedIn did not accept the Client ID and secret together. Copy both again from the app's Auth tab."
	case "invalid_token", "invalid_request":
		return "LinkedIn did not accept the access token. It may belong to a different app or have been revoked: generate a new one for this app."
	}
	return "LinkedIn refused the check (the Client ID, secret or token is not accepted)."
}
