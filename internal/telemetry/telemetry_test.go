package telemetry

import (
	"bytes"
	"context"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestEnabled(t *testing.T) {
	for want, m := range map[string]map[string]string{
		"":                    {},
		"traces,metrics,logs": {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://c:4318"},
		"traces":              {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://a/v1/traces"},
		"metrics":             {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://c:4318", "OTEL_TRACES_EXPORTER": "none", "OTEL_LOGS_EXPORTER": "NONE"},
	} {
		if got := strings.Join(Enabled(env(m)), ","); got != want {
			t.Errorf("%v: %q, want %q", m, got, want)
		}
	}
	if Enabled(env(map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "x", "OTEL_SDK_DISABLED": "true"})) != nil {
		t.Error("disabled")
	}
	if _, _, err := Setup(context.Background(), "t", env(map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "x", "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc"})); err == nil {
		t.Error("grpc should be refused")
	}
}

// One end-to-end run against a fake receiver: all three signals arrive, with the headers, and without content.
func TestAllThreeSignalsReachAReceiver(t *testing.T) {
	var mu sync.Mutex
	got := map[string][]byte{}
	var header string
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		got[r.URL.Path] = append(got[r.URL.Path], b...)
		header = r.Header.Get("x-test-key")
		mu.Unlock()
		w.Header().Set("Content-Type", "application/x-protobuf")
	}))
	defer receiver.Close()
	vars := map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": receiver.URL, "OTEL_EXPORTER_OTLP_HEADERS": "x-test-key=abc", "ARIZE_PROJECT_NAME": "proj-x"}
	for k, v := range vars {
		t.Setenv(k, v)
	}
	var stderr bytes.Buffer
	log.SetOutput(&stderr)
	defer log.SetOutput(io.Discard)
	enabled, shutdown, err := Setup(context.Background(), "v9", env(vars))
	if err != nil || len(enabled) != 3 {
		t.Fatal(enabled, err)
	}
	h := HTTP(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetRoute(r.Context(), "/api/v1/drafts/{id}")
		_, span := Start(r.Context(), "inner work")
		span.End()
		w.WriteHeader(500)
	}))
	r := httptest.NewRequest("GET", "/api/v1/drafts/SECRETID?token=SECRETQUERY", strings.NewReader("SECRETBODY"))
	r.Header.Set("User-Agent", "SECRETAGENT")
	h.ServeHTTP(httptest.NewRecorder(), r)
	PublishDone(context.Background(), "video", "published", time.Second)
	log.Printf("hello from the log")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	for path, wants := range map[string][]string{
		"/v1/traces":  {"GET /api/v1/drafts/{id}", "inner work", "cardpress", "proj-x", "v9"},
		"/v1/metrics": {"http.server.request.duration", "cardpress.publish.jobs", "go.memory.used"},
		"/v1/logs":    {"hello from the log"},
	} {
		for _, w := range wants {
			if !bytes.Contains(got[path], []byte(w)) {
				t.Errorf("%s lacks %q", path, w)
			}
		}
		if bytes.Contains(got[path], []byte("SECRET")) {
			t.Errorf("%s carries request content", path)
		}
	}
	if header != "abc" || !strings.Contains(stderr.String(), "hello from the log") {
		t.Errorf("header %q, stderr %q", header, stderr.String())
	}
}
