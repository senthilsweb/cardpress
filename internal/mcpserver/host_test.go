package mcpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Behind a tunnel the request arrives on loopback under a public name. Only the handler for keyed requests accepts that.
func TestOnlyTheKeyedHandlerAnswersAnotherHostName(t *testing.T) {
	r := newRig(t, stubFetcher{})
	srv := New(r.deps)
	for name, c := range map[string]struct {
		h    http.Handler
		want int
	}{"plain": {HTTPHandler(srv), http.StatusForbidden}, "keyed": {KeyedHTTPHandler(srv), http.StatusOK}} {
		ts := httptest.NewServer(c.h) // listens on loopback
		req, _ := http.NewRequest(http.MethodPost, ts.URL, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`))
		req.Host = "agent.example.com"
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		ts.Close()
		if res.StatusCode != c.want {
			t.Errorf("%s: %d, want %d", name, res.StatusCode, c.want)
		}
	}
}
