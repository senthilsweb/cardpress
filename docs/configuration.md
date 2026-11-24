# Configuration

Settings come from environment variables, with a few command-line flags. With Docker Compose, put them in `.env` (see `.env.example`); every line is passed into the container.

## Server

| Variable | Flag | Default | What it does |
|---|---|---|---|
| `ADDR` / `PORT` | `-addr` | `127.0.0.1:8080` | Listen address. `PORT` alone sets the port on loopback |
| `BASE_PATH` | `-base` | `/` | URL prefix the app is served under. Must match the web build |
| `CARDPRESS_DB_URL` | `-db` | `file:./data/cardpress.db` | SQLite file, or `libsql://...` for Turso |
| `CARDPRESS_DB_TOKEN` | | | Auth token for a hosted libSQL database |
| `CARDPRESS_SERVE_WEB` | `-serve-web` | `true` | Serve the embedded web app. Turn off for an API-only server |
| `CARDPRESS_MCP` | `-mcp` | `true` | Serve the MCP endpoint at `/mcp` |

## Access

| Variable | What it does |
|---|---|
| `CARDPRESS_API_TOKEN` | Bearer token for `/api/v1` and `/mcp` (at least 16 characters). Required unless the server is on loopback or `CARDPRESS_INSECURE` is set |
| `CARDPRESS_INSECURE` | Allow a non-loopback address without a token, when something else protects it |
| `CARDPRESS_ALLOWED_HOSTS` | Extra host names accepted when there is no token (otherwise only `localhost` names) |
| `CARDPRESS_CORS_ORIGINS` | Browser origins allowed when the web app is hosted separately |

## Accounts

| Variable | What it does |
|---|---|
| `CARDPRESS_DEFAULT_ROLE` | The role of a person who signs up: `editor` (default) or `writer` |
| `CARDPRESS_SIGNUP` | `closed` stops self sign-up once the first account exists (admins add people). Default `open` |
| `CARDPRESS_ADMIN_EMAIL` | If set, only this email can create the first (admin) account. Set it on a server reachable from the internet |

See [Accounts and roles](accounts.md). API keys are made in the app (Account settings), not in the environment.

## Public pages

| Variable | What it does |
|---|---|
| `CARDPRESS_PUBLIC_URL` | The address readers use, with no path (`https://example.com`). It is written into the canonical link, the social preview tags and the sitemap. Without it the request's own host is used, which is fine for a trial and wrong behind a proxy |
| `CARDPRESS_SITE_NAME` | The name shown on the public pages and in previews. Empty uses the brand's display name |

See [Public pages](public-pages.md).

## Stored credentials

| Variable | What it does |
|---|---|
| `CARDPRESS_SECRET_KEY` | Encrypts the social credentials saved in the app (at least 32 characters, for example `openssl rand -hex 32`). Required with a hosted database or a non-loopback address. On a local single-user setup a key file is created next to the database |

Credentials can also come from environment variables instead of the app; see [Social accounts](social-settings.md).

## Assistant

| Variable | Default | What it does |
|---|---|---|
| `CARDPRESS_AGENT` | `mock` | `mock` (built-in demo) or `cma` (Claude Managed Agent) |
| `CARDPRESS_AGENT_ID` | | The agent id from `cardpress agent-setup` |
| `CARDPRESS_AGENT_ENVIRONMENT_ID` | | The environment id from `cardpress agent-setup` |
| `CARDPRESS_AGENT_VERSION` | latest | Pin an agent version |
| `CARDPRESS_AGENT_BUDGET_CENTS` | none | Spend cap per conversation, in US cents |
| `CARDPRESS_AGENT_TIMEOUT` | `4m` | Longest wait for one reply (10s to 30m) |
| `ANTHROPIC_API_KEY` | | Used by the adapter and by `agent-setup` |

See [Claude Managed Agent](cma-agent.md).

## Publishing

| Variable | Default | What it does |
|---|---|---|
| `CARDPRESS_MISSED_GRACE` | `15m` | How late a scheduled post may still go out (1m to 24h) |
| `CARDPRESS_LINKEDIN_VERSION` | built in | The `LinkedIn-Version` header |
| `CARDPRESS_LINKEDIN_API_BASE` | LinkedIn | API address; for tests and proxies only. Must be https (http only for localhost) |

## Docker Compose only

| Variable | Default | What it does |
|---|---|---|
| `CARDPRESS_BIND` | `127.0.0.1` | Where the port is published |
| `CARDPRESS_PORT` | `8080` | Published port |
| `CARDPRESS_IMAGE_TAG` | `latest` | Image tag to run |

## Subcommands

| Command | What it does |
|---|---|
| `cardpress` | Run the server |
| `cardpress mcp` | Serve MCP over stdio for an agent on this machine; see [MCP](mcp.md) |
| `cardpress agent-setup` | Create the managed agent and environment (needs `ANTHROPIC_API_KEY`) |
| `cardpress healthcheck` | Exit 0 if the local server is up (used by the container health check) |
| `cardpress -version` | Print the version |
