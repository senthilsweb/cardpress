# Server

## ADDED Requirements

### Requirement: Database backends
The system SHALL persist all application state in a SQL database selected by `CARDPRESS_DB_URL`, supporting a local SQLite file and a Turso/libSQL URL.

#### Scenario: Local default
- **WHEN** `CARDPRESS_DB_URL` is unset
- **THEN** the server uses `file:./data/cardpress.db`, creating the directory and file if needed

#### Scenario: Hosted
- **WHEN** `CARDPRESS_DB_URL` is a `libsql://` URL with an auth token
- **THEN** the server uses it with identical behaviour

### Requirement: Migrations
The system SHALL apply embedded migrations in order at startup and record applied versions.

#### Scenario: Fresh and upgraded databases
- **WHEN** the server starts against an empty or older database
- **THEN** pending migrations run once, in a transaction each, and the server only starts serving when they succeed

### Requirement: Separate-host deployment
The system SHALL allow the web app and API to run on different hosts.

#### Scenario: CORS
- **WHEN** a request comes from an origin listed in `CARDPRESS_CORS_ORIGINS`
- **THEN** the response carries matching CORS headers, and other origins get none

#### Scenario: Embedded mode
- **WHEN** `CARDPRESS_SERVE_WEB` is true (default)
- **THEN** the embedded web app is served and uses same-origin `/api/v1`

### Requirement: Exposure guard
The system SHALL NOT serve a non-loopback address without a bearer token unless explicitly overridden.

#### Scenario: Refused start
- **WHEN** the listen address is non-loopback, `CARDPRESS_API_TOKEN` is unset and `CARDPRESS_INSECURE` is not `1`
- **THEN** the process exits with a message explaining how to set a token

#### Scenario: Token required
- **WHEN** `CARDPRESS_API_TOKEN` is set
- **THEN** every `/api/v1` request without `Authorization: Bearer <token>` receives 401, and `/healthz` stays open

### Requirement: Local state import
The system SHALL move existing localStorage state into the database once.

#### Scenario: First load after upgrade
- **WHEN** the browser holds legacy keys and the DB has no designs
- **THEN** the user is offered an import; on success the legacy keys are removed and the data is served from the API
