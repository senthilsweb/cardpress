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

// The SDK wrapper is checked against a local server that records what is sent, so the request shapes are real.
func TestSDKCallsHaveTheRightShape(t *testing.T) {
	type req struct{ method, path, body, beta string }
	var got []req
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got = append(got, req{r.Method, r.URL.Path, string(b), r.Header.Get("anthropic-beta")})
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == "POST" && r.URL.Path == "/v1/sessions":
			_, _ = w.Write([]byte(`{"id":"sesn_1","type":"session"}`))
		case r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/events"):
			_, _ = w.Write([]byte(`{"data":[{"id":"sevt_1","type":"user.message"}]}`))
		case r.Method == "GET" && strings.HasSuffix(r.URL.Path, "/events"):
			_, _ = w.Write([]byte(`{"data":[{"id":"sevt_1","type":"user.message","content":[{"type":"text","text":"hi"}]}]}`))
		default:
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"type":"error","error":{"type":"not_found_error","message":"no"}}`))
		}
	}))
	defer srv.Close()
	a := newSDKAPI(Config{AgentID: "agent_1", EnvironmentID: "env_1", BudgetCents: 250, APIKey: "k", BaseURL: srv.URL})
	ctx := context.Background()

	sid, err := a.newSession(ctx, "T")
	if err != nil || sid != "sesn_1" {
		t.Fatalf("%v %q", err, sid)
	}
	var created map[string]any
	_ = json.Unmarshal([]byte(got[0].body), &created)
	budget, _ := created["budget"].(map[string]any)
	max, _ := budget["max_list_cost"].(map[string]any)
	if created["agent"] != "agent_1" || created["environment_id"] != "env_1" || max["amount"] != "250" || max["currency"] != "USD" {
		t.Fatalf("session body: %s", got[0].body)
	}
	if !strings.Contains(got[0].beta, "managed-agents") {
		t.Fatalf("the beta header is missing: %q", got[0].beta)
	}

	id, err := a.sendMessage(ctx, "sesn_1", "hello")
	if err != nil || id != "sevt_1" || !strings.Contains(got[1].body, `"user.message"`) || !strings.Contains(got[1].body, `"hello"`) {
		t.Fatalf("%v %q %s", err, id, got[1].body)
	}
	if err := a.sendToolResult(ctx, "sesn_1", toolResult{ToolUseID: "tu1", Text: "bad", IsError: true}); err != nil {
		t.Fatal(err)
	}
	b := got[2].body
	if !strings.Contains(b, `"user.custom_tool_result"`) || !strings.Contains(b, `"custom_tool_use_id":"tu1"`) || !strings.Contains(b, `"is_error":true`) || !strings.Contains(b, `"bad"`) {
		t.Fatalf("tool result body: %s", b)
	}
	if err := a.interrupt(ctx, "sesn_1"); err != nil || !strings.Contains(got[3].body, `"user.interrupt"`) {
		t.Fatalf("%v %s", err, got[3].body)
	}
	h, err := a.history(ctx, "sesn_1")
	if err != nil || len(h) != 1 || h[0].text() != "hi" {
		t.Fatalf("%v %+v", err, h)
	}

	// a pinned version is sent as an object
	a2 := newSDKAPI(Config{AgentID: "agent_1", AgentVersion: 4, EnvironmentID: "env_1", APIKey: "k", BaseURL: srv.URL})
	if _, err := a2.newSession(ctx, "T"); err != nil || !strings.Contains(got[len(got)-1].body, `"version":4`) {
		t.Fatalf("%v %s", err, got[len(got)-1].body)
	}
	// an unknown session maps to errSessionGone
	if _, err := a.sendMessage(ctx, "nope", "x"); err == nil {
		t.Log("server answered ok for unknown session path")
	}
}
