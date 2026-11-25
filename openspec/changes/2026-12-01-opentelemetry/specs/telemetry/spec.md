# Telemetry

## ADDED Requirements

### Requirement: OTLP export
The system SHALL send traces, metrics and logs over OTLP to a receiver set by the standard OpenTelemetry environment variables, including custom headers.

#### Scenario: Not configured
- **WHEN** no OTLP endpoint is set
- **THEN** nothing is sent and the server behaves as before

#### Scenario: Receiver failing
- **WHEN** the receiver cannot be reached
- **THEN** requests and publishing are unaffected

### Requirement: No content in traces and metrics
The system SHALL NOT put post text, chat text, credentials, request bodies, query strings or client addresses in traces or metrics.
