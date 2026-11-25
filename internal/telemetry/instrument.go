package telemetry

import (
	"context"
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// The tracer and the instruments come from the global providers, which do nothing until Setup replaces them.
var (
	tracer = otel.Tracer(scopeName)
	meter  = otel.Meter(scopeName)

	requestSeconds, _ = meter.Float64Histogram("http.server.request.duration", metric.WithUnit("s"),
		metric.WithDescription("How long requests to the API, MCP and public pages take"),
		metric.WithExplicitBucketBoundaries(0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60))
	publishJobs, _    = meter.Int64Counter("cardpress.publish.jobs", metric.WithDescription("Publish attempts, by outcome and attachment"))
	publishSeconds, _ = meter.Float64Histogram("cardpress.publish.duration", metric.WithUnit("s"), metric.WithDescription("How long a publish attempt takes"),
		metric.WithExplicitBucketBoundaries(0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 900, 2700))
)

// Start begins a span. Attributes must describe the work, never its content.
func Start(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return tracer.Start(ctx, name, opts...)
}

// Fail marks a span as failed. The message must carry no content or secret.
func Fail(span trace.Span, msg string) { span.SetStatus(codes.Error, msg) }

// PublishDone counts one publish attempt.
func PublishDone(ctx context.Context, attachment, outcome string, took time.Duration) {
	set := metric.WithAttributes(attribute.String("cardpress.attachment", attachment), attribute.String("cardpress.outcome", outcome))
	publishJobs.Add(ctx, 1, set)
	publishSeconds.Record(ctx, took.Seconds(), set)
}

type routeKey struct{}

// SetRoute names the route that is handling a request, as a pattern ("/api/v1/drafts/{id}"), so no id is recorded.
func SetRoute(ctx context.Context, route string) {
	if r, ok := ctx.Value(routeKey{}).(*string); ok {
		*r = route
	}
}

// traced is the part of the server that is worth watching, as the name its requests get when no route is known. Static
// files and the health check are left out.
func traced(path string) string {
	switch {
	case strings.HasPrefix(path, "/api/"):
		return "/api"
	case path == "/mcp":
		return "/mcp"
	case path == "/articles" || strings.HasPrefix(path, "/articles/"):
		return "/articles"
	case path == "/posts" || strings.HasPrefix(path, "/posts/"):
		return "/posts"
	}
	return ""
}

// HTTP records a span and the duration of each request: its method, route and status.
func HTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallback := traced(r.URL.Path)
		if fallback == "" {
			next.ServeHTTP(w, r)
			return
		}
		route := fallback
		ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		ctx, span := tracer.Start(ctx, r.Method+" "+route, trace.WithSpanKind(trace.SpanKindServer))
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		defer func() {
			if sw.status == 0 {
				sw.status = http.StatusOK
			}
			attrs := []attribute.KeyValue{attribute.String("http.request.method", method(r.Method)), attribute.String("http.route", route), attribute.Int("http.response.status_code", sw.status)}
			span.SetName(method(r.Method) + " " + route)
			span.SetAttributes(attrs...)
			if sw.status >= 500 {
				span.SetStatus(codes.Error, http.StatusText(sw.status))
			}
			span.End()
			requestSeconds.Record(ctx, time.Since(start).Seconds(), metric.WithAttributes(attrs...))
		}()
		next.ServeHTTP(sw, r.WithContext(context.WithValue(ctx, routeKey{}, &route)))
	})
}

// method keeps the recorded method to the known ones: a caller can send any word.
func method(m string) string {
	switch m {
	case "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS":
		return m
	}
	return "_OTHER"
}

// statusWriter remembers the status of an answer. It passes Flush through, which streamed answers need.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
