# Deployment

Everything the studio saves (profiles, designs, preferences) is in a database, not in the browser. The Go server owns the database and serves `/api/v1`.

## Modes

| Mode | How |
|---|---|
| **On-prem, one binary** | `make build && ./bin/cardpress`. The web app is embedded and talks to the same origin. |
| **Web app and API on separate hosts** | Run the Go server with `SCS_SERVE_WEB=false`. Build the web app with `PUBLIC_API_BASE=https://api.example.com/api/v1` and host the `web/dist` folder anywhere, or run it as a Node app. Put the web origin in `SCS_CORS_ORIGINS`. |
| **Development** | `make dev`: the Go API on `:8080` and Astro on `:4321`, with `/api` proxied. |

## Database

| `SCS_DB_URL` | Backend |
|---|---|
| unset, or `file:./data/scs.db` | Local SQLite file (created with its folder on first run) |
| `libsql://<db>.turso.io` plus `SCS_DB_TOKEN` | [Turso](https://turso.tech) (hosted SQLite). Neon is Postgres and is not supported. |

Migrations are embedded and run at startup. Back up the `data/` folder (or use Turso's backups).

## Configuration

| Variable | Flag | Default | Meaning |
|---|---|---|---|
| `ADDR` / `PORT` | `-addr` | `127.0.0.1:8080` | Listen address. The default is loopback only. |
| `BASE_PATH` | `-base` | `/` | Sub-path for the embedded web app (must match the build). |
| `SCS_DB_URL` | `-db` | `file:./data/scs.db` | Database URL. |
| `SCS_DB_TOKEN` | | | libSQL auth token. |
| `SCS_SERVE_WEB` | `-serve-web` | `true` | Serve the embedded web app. |
| `SCS_API_TOKEN` | | | Bearer token required on `/api/v1` (at least 16 characters). |
| `SCS_SECRET_KEY` | | | Encrypts stored social credentials (at least 32 characters). Required for a hosted database or an exposed address; locally a key file is created automatically. See [Social accounts](social-settings.md). |
| `SCS_<NETWORK>_<FIELD>` | | | Supplies a social credential from the environment, e.g. `SCS_LINKEDIN_ACCESS_TOKEN`. Overrides anything stored. |
| `SCS_CORS_ORIGINS` | | | Comma-separated origins allowed to call the API from a browser. |
| `SCS_INSECURE` | | `false` | Allow a non-loopback address without a token. |

## Access guard (not authentication)

There are no user accounts yet. To stop an exposed API from being open to everyone, the server **refuses to start** on a non-loopback address (including `:8080`) unless `SCS_API_TOKEN` is set or `SCS_INSECURE=1`. With a token, every `/api/v1` call needs `Authorization: Bearer <token>`; `/healthz` and `/api/v1/info` stay open.

The web app asks for the token when it needs one and keeps it for that browser tab only (`sessionStorage`). A `PUBLIC_API_TOKEN` set at build time is visible to anyone who can load the app, so use it only on a private network.

## Docker

The image is built and pushed to `ghcr.io/<owner>/cardpress` by `.github/workflows/ci.yml` (pull requests build only; pushes to `main` and `v*` tags publish).

```bash
make docker
make docker-run     # published on 127.0.0.1:8080, data in ./data
```

To expose it, set a token instead of `SCS_INSECURE`: `docker run -p 8080:8080 -e SCS_API_TOKEN=<long random value> -v scs-data:/data cardpress`.

## Moving from the older, browser-only version

On first load, if the browser holds old data and the database is empty, the app offers to import it. Import copies it to the server and then removes it from the browser. The studio now has a single profile, so only the one you used last is kept. Import is refused if the database already has data.

## Scheduled posts

Scheduled posts are sent by a scheduler inside the Go process, so the server has to be running at that time. On a laptop that sleeps, scheduled posts will be missed (and flagged for you). Run one instance on a machine that stays on. See [Publishing](publishing.md) for the timings and the `SCS_MISSED_GRACE`, `SCS_LINKEDIN_VERSION` and `SCS_LINKEDIN_API_BASE` settings.
