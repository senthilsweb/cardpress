package cma

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The check of a guide is one small request with fixed instructions and the guide as material, and a verdict in a fixed
// shape. Anything but a clear yes is not a yes.
func TestCheckingAGuide(t *testing.T) {
	var got string
	reply, stop := `{"accepted":true,"reason":""}`, "end_turn"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got = r.URL.Path + " " + string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-5-5","stop_reason":"` + stop + `",` +
			`"content":[{"type":"text","text":` + quote(reply) + `}],"usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	defer srv.Close()
	c := &Client{api: newSDKAPI(Config{Manifest: manifest, APIKey: "k", BaseURL: srv.URL})}
	ctx := context.Background()
	ok, why, err := c.CheckGuide(ctx, "post", "Write plainly.")
	if err != nil || !ok || why != "" {
		t.Fatal(ok, why, err)
	}
	for _, want := range []string{"/v1/messages", `"model":"claude-haiku-5-5"`, `"system":[`, `\u003cguide\u003e\nWrite plainly.\n\u003c/guide\u003e`, `"type":"json_schema"`, `"effort":"low"`, `"additionalProperties":false`} {
		if !strings.Contains(got, want) {
			t.Errorf("the request lacks %s: %s", want, got)
		}
	}
	reply = `{"accepted":false,"reason":" The last line asks for other work. "}`
	if ok, why, err = c.CheckGuide(ctx, "post", "x"); err != nil || ok || why != "The last line asks for other work." {
		t.Fatal(ok, why, err)
	}
	stop, reply = "refusal", ""
	if ok, why, err = c.CheckGuide(ctx, "post", "x"); err != nil || ok || why == "" {
		t.Fatal("a refusal: ", ok, why, err)
	}
	for _, bad := range [][2]string{{"end_turn", "yes"}, {"end_turn", `{"reason":""}`}, {"max_tokens", `{"accepted":true`}} {
		stop, reply = bad[0], bad[1]
		if ok, _, err := c.CheckGuide(ctx, "post", "x"); err == nil || ok {
			t.Errorf("%v: %v %v", bad, ok, err)
		}
	}
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
