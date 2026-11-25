# Telemetry

CardPress can send **traces, metrics and logs** over OTLP to any compatible receiver. It is **off** unless you set an endpoint, and it is configured only with the standard OpenTelemetry environment variables. There is no settings screen: restart the server after a change.

## Turn it on

Put the lines in `.env` (read by Docker Compose, and by `make dev` for `OTEL_*` and `ARIZE_*` lines only), or set them in the environment of the binary. On Fly.io use `fly secrets set`, with the values written out (Fly does not expand `${...}`).

Any receiver, with your own headers:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20xxxx,x-tenant=me
```

Headers are `name=value` pairs separated by commas; percent-encode spaces and commas inside a value.

Traces straight to Arize AX:

```bash
ARIZE_SPACE_ID=...
ARIZE_API_KEY=...
ARIZE_PROJECT_NAME=cardpress
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otlp.arize.com/v1/traces
OTEL_EXPORTER_OTLP_TRACES_HEADERS=arize-space-id=${ARIZE_SPACE_ID},arize-api-key=${ARIZE_API_KEY}
```

The endpoint above is Arize's US one. Arize documents traces only, so metrics and logs are not sent in this setup.

## The collector

`deploy/otel-collector.yaml` runs an OpenTelemetry Collector that takes everything from the app, sends **traces to Arize** and **prints metrics and logs**. Replace the `debug` exporter there with your metrics and logs backend.

```bash
# .env: the ARIZE_* lines, and instead of the OTEL_EXPORTER_OTLP_TRACES_* lines:
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

docker compose --profile telemetry up -d
docker compose logs -f otel-collector
```

For a server run outside Docker on the same machine, use `http://localhost:4318`. The Fly.io setup does not include a collector (the machine is small): send straight to a receiver.

## Variables

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The receiver's base address; `/v1/traces`, `/v1/metrics`, `/v1/logs` are added |
| `OTEL_EXPORTER_OTLP_{TRACES,METRICS,LOGS}_ENDPOINT` | The full address for one signal |
| `OTEL_EXPORTER_OTLP_HEADERS`, `..._{SIGNAL}_HEADERS` | Headers, such as keys |
| `OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none` | Leave one signal out |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | Who is sending (default service name `cardpress`) |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | Keep only part of the traces |
| `OTEL_METRIC_EXPORT_INTERVAL` | Milliseconds between metric sends (default 60000) |
| `OTEL_SDK_DISABLED=true` | Off, whatever else is set |
| `ARIZE_PROJECT_NAME` | Added as `openinference.project.name`, which Arize files traces under |

Only OTLP over **HTTP/protobuf** is supported (usually port 4318), not gRPC.

## What is sent

| Signal | Content |
|---|---|
| Traces | Each API, MCP and public-page request (method, route pattern, status); each publish attempt (job id, attachment kind, outcome) with its calls to LinkedIn (step, host, status); each assistant turn (which agent) |
| Metrics | `http.server.request.duration`, `cardpress.publish.jobs`, `cardpress.publish.duration`, and the Go runtime (memory, goroutines, garbage collection) |
| Logs | The lines the server writes to its log, which it keeps writing to the terminal too |

**Not sent:** post or chat text, tokens and keys, request bodies, query strings, ids inside web addresses in traces and metrics, user names or client addresses. Static files and the health check are not traced.

**Take care with logs:** they are the server's log lines as they are. They include request paths (with ids and public page names) and error messages. Set `OTEL_LOGS_EXPORTER=none` if that is too much for the receiver. The assistant's turns are traced without prompts, answers or token counts.

A failing receiver never affects the server: errors are printed at most once a minute.
