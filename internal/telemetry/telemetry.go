// Package telemetry sends traces, metrics and logs over OTLP (HTTP/protobuf) to any compatible receiver.
//
// It is configured only by the standard OpenTelemetry environment variables, and is off unless an OTLP endpoint is set.
// What is sent is about the server, never about content: no post text, no tokens, no query strings, no request bodies,
// no client addresses.
package telemetry

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const scopeName = "github.com/senthilsweb/cardpress"

// The signals, in the order they are reported.
var signals = []string{"traces", "metrics", "logs"}

// Enabled says which signals have somewhere to go: an endpoint is set (for all, or for that signal), the signal's
// exporter is not "none", and the SDK is not disabled.
func Enabled(getenv func(string) string) []string {
	if strings.EqualFold(getenv("OTEL_SDK_DISABLED"), "true") {
		return nil
	}
	var out []string
	for _, s := range signals {
		up := strings.ToUpper(s)
		if getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" && getenv("OTEL_EXPORTER_OTLP_"+up+"_ENDPOINT") == "" {
			continue
		}
		if strings.EqualFold(getenv("OTEL_"+up+"_EXPORTER"), "none") {
			continue
		}
		out = append(out, s)
	}
	return out
}

// Setup starts the exporters for the enabled signals and returns what they are and a function that sends what is left
// and stops them. With nothing configured it does nothing. The exporters read their addresses, headers and timeouts
// from the environment themselves.
func Setup(ctx context.Context, version string, getenv func(string) string) (enabled []string, shutdown func(context.Context) error, err error) {
	enabled = Enabled(getenv)
	var stops []func(context.Context) error
	shutdown = func(ctx context.Context) error {
		var errs []error
		for i := len(stops) - 1; i >= 0; i-- {
			errs = append(errs, stops[i](ctx))
		}
		return errors.Join(errs...)
	}
	if len(enabled) == 0 {
		return nil, shutdown, nil
	}
	if p := getenv("OTEL_EXPORTER_OTLP_PROTOCOL"); p != "" && p != "http/protobuf" {
		return nil, shutdown, fmt.Errorf("telemetry: only OTLP over http/protobuf is supported, not %q (use the receiver's HTTP port, usually 4318)", p)
	}

	attrs := []attribute.KeyValue{attribute.String("service.name", "cardpress"), attribute.String("service.version", version)}
	if project := getenv("ARIZE_PROJECT_NAME"); project != "" { // Arize files traces under this
		attrs = append(attrs, attribute.String("openinference.project.name", project))
	}
	// later options win, so OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES override these
	res, err := resource.New(ctx, resource.WithAttributes(attrs...), resource.WithTelemetrySDK(), resource.WithFromEnv())
	if err != nil && res == nil {
		return nil, shutdown, fmt.Errorf("telemetry: %w", err)
	}

	// a failing export is reported on stderr only (never back into the exported logs), at most once a minute
	otel.SetErrorHandler(&quietErrors{log: log.New(os.Stderr, "", log.LstdFlags)})
	otel.SetTextMapPropagator(propagation.TraceContext{})

	for _, s := range enabled {
		switch s {
		case "traces":
			exp, err := otlptracehttp.New(ctx)
			if err != nil {
				return nil, shutdown, fmt.Errorf("telemetry traces: %w", err)
			}
			tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exp), sdktrace.WithResource(res))
			otel.SetTracerProvider(tp)
			stops = append(stops, tp.Shutdown)
		case "metrics":
			exp, err := otlpmetrichttp.New(ctx)
			if err != nil {
				return nil, shutdown, fmt.Errorf("telemetry metrics: %w", err)
			}
			mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exp)), sdkmetric.WithResource(res))
			otel.SetMeterProvider(mp)
			stops = append(stops, mp.Shutdown)
			if err := runtime.Start(); err != nil { // Go memory, goroutines and garbage collection
				return nil, shutdown, fmt.Errorf("telemetry runtime metrics: %w", err)
			}
		case "logs":
			exp, err := otlploghttp.New(ctx)
			if err != nil {
				return nil, shutdown, fmt.Errorf("telemetry logs: %w", err)
			}
			lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(exp)), sdklog.WithResource(res))
			// the standard logger keeps writing to stderr, and each line is also sent
			previous := log.Writer()
			log.SetOutput(io.MultiWriter(previous, &logBridge{logger: lp.Logger(scopeName), flags: log.Flags}))
			stops = append(stops, func(ctx context.Context) error { log.SetOutput(previous); return lp.Shutdown(ctx) })
		}
	}
	return enabled, shutdown, nil
}

type quietErrors struct {
	mu   sync.Mutex
	last time.Time
	log  *log.Logger
}

func (q *quietErrors) Handle(err error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if time.Since(q.last) < time.Minute {
		return
	}
	q.last = time.Now()
	q.log.Printf("telemetry: %v (further errors are not shown for a minute)", err)
}

// logBridge turns each line of the standard logger into a log record.
type logBridge struct {
	logger otellog.Logger
	flags  func() int
}

func (b *logBridge) Write(p []byte) (int, error) {
	line := strings.TrimRight(string(p), "\n")
	if b.flags() == log.LstdFlags && len(line) > len("2006/01/02 15:04:05 ") {
		line = line[len("2006/01/02 15:04:05 "):] // the record has its own time
	}
	var r otellog.Record
	r.SetTimestamp(time.Now())
	r.SetBody(attribute.StringValue(line))
	r.SetSeverity(otellog.SeverityInfo)
	r.SetSeverityText("INFO")
	if strings.HasPrefix(line, "panic ") {
		r.SetSeverity(otellog.SeverityError)
		r.SetSeverityText("ERROR")
	}
	b.logger.Emit(context.Background(), r)
	return len(p), nil
}
