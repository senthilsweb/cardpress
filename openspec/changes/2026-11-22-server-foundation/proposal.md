# Server foundation

## Why
Scheduling, stored credentials and chat history need a server and a database. Today the Go binary only serves static files and all state is in localStorage.

## What changes
- Go JSON API under `/api/v1`, with a `store` package over `database/sql`.
- Two drivers, same SQL dialect: local SQLite file (`modernc.org/sqlite`, pure Go) and Turso/libSQL for hosted use (`libsql-client-go`, pure Go). `CGO_ENABLED=0` and the single binary are kept.
- A transport-neutral **service layer** (`server/service`) holds all business rules. The HTTP API is a thin adapter over it, and so is the later MCP server.
- Embedded, versioned SQL migrations run at startup.
- Configuration by flag and environment: `SCS_DB_URL`, `SCS_SECRET_KEY`, `SCS_API_TOKEN`, `SCS_CORS_ORIGINS`, `SCS_SERVE_WEB`.
- Web app reads its API base from `PUBLIC_API_BASE` (default same-origin `/api/v1`) so it can be deployed as a Node/JS app against a separate API host.
- Existing designs, profiles and palettes move from localStorage to the DB. On first load the browser offers a one-time import, then clears its keys.
- Minimal guard, not authentication: optional bearer token; the server refuses to bind a non-loopback address without a token unless `SCS_INSECURE=1`.

## Decisions
- **Neon is Postgres, so it is not used.** Turso/libSQL gives hosted SQLite semantics with one dialect. A Postgres driver is out of scope.
- The scheduler (a later change) requires one long-running Go process. A claim-by-UPDATE pattern prevents double work if two instances ever run.
- Images (rendered cards) are stored as BLOBs for now. Object storage can replace that later behind the same interface.

## Out of scope
User accounts, roles, OAuth login to the studio itself.
