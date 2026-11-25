# OpenTelemetry: traces, metrics and logs over OTLP

**Status:** built; tested against a fake receiver. The collector setup has not been run.

## Why
Tech debt: the server could only be watched through its terminal log.

## What changes
- Traces, metrics and logs from the Go server over OTLP/HTTP to any compatible receiver, with custom headers.
- Off unless an endpoint is set.
- An optional OpenTelemetry Collector in Docker Compose (profile `telemetry`).

## Decisions
- **Environment variables, no settings screen.** The request allowed either, preferring the slimmer one. The standard `OTEL_*` variables need no database table, secret storage, admin route or restarting of exporters at run time. A settings screen can be added later if changing receivers without a restart matters.
- OTLP over HTTP/protobuf only.
- Nothing about content is recorded in traces and metrics. Log lines are forwarded as written.
- Arize AX documents traces only: metrics and logs need another backend.

## Out of scope
- A settings screen; gRPC; telemetry from the browser; LLM prompts, answers or token counts; trace ids inside log lines.
