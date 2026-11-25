# Deployment

Everything the studio saves (profiles, designs, preferences) is in a database, not in the browser. The Go server owns the database and serves `/api/v1`.

## Where it can run

The Go server is required: it owns the database, the encrypted credentials, publishing, the scheduler, the assistant and MCP. The web app is only the UI.

| Setup | Works? |
|---|---|
| **Docker Compose on your own machine or server** | Yes. See [Docker Compose](#docker-compose) below |
| **One Docker image on Fly.io**, SQLite on a volume or Turso | Yes. See [Deploy to Fly.io](fly.md) |
| **Static front end on Vercel or similar, Go server elsewhere** | Yes, through the separate-hosts mode below, but it adds CORS and build-time setup for little gain |
| **Go server on a serverless platform** | No. The scheduler needs a process that keeps running, and replies stream |
| **Front end plus Turso only** | No. A browser cannot use the database directly, and none of the rules would run |

## Modes

| Mode | How |
|---|---|
| **On-prem, one binary** | `make build && ./bin/cardpress`. The web app is embedded and talks to the same origin. |
| **Web app and API on separate hosts** | Run the Go server with `CARDPRESS_SERVE_WEB=false`. Build the web app with `PUBLIC_API_BASE=https://api.example.com/api/v1` and host the `web/dist` folder anywhere, or run it as a Node app. Put the web origin in `CARDPRESS_CORS_ORIGINS`. |
| **Development** | `make dev`: the Go API on `:8080` and Astro on `:4321`, with `/api` proxied. |

## Database

| `CARDPRESS_DB_URL` | Backend |
|---|---|
| unset, or `file:./data/cardpress.db` | Local SQLite file (created with its folder on first run) |
| `libsql://<db>.turso.io` plus `CARDPRESS_DB_TOKEN` | [Turso](https://turso.tech) (hosted SQLite). Neon is Postgres and is not supported. |
| `http://127.0.0.1:<port>` | A libSQL server on this machine (`turso dev`), to try the Turso path without an account. Plain `http://` and `ws://` are accepted only for this machine. |

Migrations are embedded and run at startup. Back up the `data/` folder (or use Turso's backups).

### SQLite and Turso use the same schema

The server speaks to a SQLite file through one driver and to Turso (libSQL) through another, with the same migrations and the same SQL. Files (a post's own image, PDF or set of images) are stored as BLOBs; each picture of a set is its own row, so no single statement carries more than one file.

To check the libSQL path on your own machine, start a local libSQL server and point the tests at it:

```bash
turso dev --port 8081 --db-file /tmp/cardpress-libsql-test.db    # needs the Turso CLI
CARDPRESS_TEST_LIBSQL_URL=http://127.0.0.1:8081 go test ./internal/store -run OnEveryBackend -v
```

The test applies the migrations and runs the kinds of statement the server depends on (BLOBs of a few megabytes, transactions, `INSERT … SELECT` with a window function) on SQLite and on libSQL. Without the variable it runs on SQLite only. Use a database kept for tests. To run the whole server on it: `CARDPRESS_DB_URL=http://127.0.0.1:8081 ./bin/cardpress`.

### Large files on libSQL

A local libSQL server (`sqld` 0.24.31, started by `turso dev`) refuses any single value over about 4.7 MB (4,999,168 bytes was accepted, measured), both when writing and when reading: `string or blob too big`. The SQLite file has no such limit in practice. CardPress's own limits are higher, so on that server these fail with "internal error":

| Stored value | CardPress allows |
|---|---|
| A post's own PDF | 20 MB |
| A post's own image, or the card image of a scheduled post | 10 MB |
| An article's text, including the images inside it | 25 MB |

Up to 4.5 MB, a PDF, ten images and the copy a scheduled post takes were checked on that server and came back unchanged. Whether Turso Cloud has the same limit has not been checked. Use SQLite if you need larger files.

## Configuration

| Variable | Flag | Default | Meaning |
|---|---|---|---|
| `ADDR` / `PORT` | `-addr` | `127.0.0.1:8080` | Listen address. The default is loopback only. |
| `BASE_PATH` | `-base` | `/` | Sub-path for the embedded web app (must match the build). |
| `CARDPRESS_DB_URL` | `-db` | `file:./data/cardpress.db` | Database URL. |
| `CARDPRESS_DB_TOKEN` | | | libSQL auth token. |
| `CARDPRESS_SERVE_WEB` | `-serve-web` | `true` | Serve the embedded web app. |
| `CARDPRESS_API_TOKEN` | | | Bearer token required on `/api/v1` (at least 16 characters). |
| `CARDPRESS_MCP` | `-mcp` | `true` | Serve the MCP endpoint at `/mcp` for outside agents. See [MCP](mcp.md). |
| `CARDPRESS_ALLOWED_HOSTS` | | | Extra host names the server may be reached by when there is no token (a reverse proxy or LAN name). Without a token only `localhost`, `127.0.0.1` and `::1` are answered. |
| `CARDPRESS_SECRET_KEY` | | | Encrypts stored social credentials (at least 32 characters). Required for a hosted database or an exposed address; locally a key file is created automatically. See [Social accounts](social-settings.md). |
| `CARDPRESS_<NETWORK>_<FIELD>` | | | Supplies a social credential from the environment, e.g. `CARDPRESS_LINKEDIN_ACCESS_TOKEN`. Overrides anything stored. |
| `CARDPRESS_CORS_ORIGINS` | | | Comma-separated origins allowed to call the API from a browser. |
| `CARDPRESS_INSECURE` | | `false` | Allow a non-loopback address without a token. |

## Access guard

The app has [accounts](accounts.md): nothing opens until the first (admin) account exists, and people sign in. On a server reachable from the internet, set `CARDPRESS_ADMIN_EMAIL` (or create the admin yourself first), because the first person to sign up becomes the admin.

The guard below is a second layer, and the way machines (scripts, MCP over HTTP) get in. To stop an exposed API from being open to everyone, the server **refuses to start** on a non-loopback address (including `:8080`) unless `CARDPRESS_API_TOKEN` is set or `CARDPRESS_INSECURE=1`. With a token, every `/api/v1` call needs `Authorization: Bearer <token>`; `/healthz` and `/api/v1/info` stay open.

With **no token**, the server also answers only to `localhost` host names and refuses cross-site browser requests that change things, which stops a website you visit from driving your local CardPress (see [MCP](mcp.md#access-rules-http-and-the-json-api)). If you reach it under another name, add it to `CARDPRESS_ALLOWED_HOSTS`.

The web app asks for the token when it needs one and keeps it for that browser tab only (`sessionStorage`). A `PUBLIC_API_TOKEN` set at build time is visible to anyone who can load the app, so use it only on a private network.

## Docker

The image is built and pushed to `ghcr.io/<owner>/cardpress` by `.github/workflows/ci.yml` (pull requests build only; pushes to `main` and `v*` tags publish).

```bash
make docker
make docker-run     # published on 127.0.0.1:8080, data in ./data
```

To expose it, set a token instead of `CARDPRESS_INSECURE`: `docker run -p 8080:8080 -e CARDPRESS_API_TOKEN=<long random value> -v cardpress-data:/data cardpress`.

### Docker Compose

```bash
cp .env.example .env      # edit it: token or loopback, secret key, assistant settings
docker compose up -d      # pulls ghcr.io/<owner>/cardpress:latest (or: docker compose up -d --build)
```

- **Settings**: every line in `.env` is passed into the container, so new `CARDPRESS_*` settings and `ANTHROPIC_API_KEY` need no change to `docker-compose.yml`. `.env` is git-ignored.
- **Database**: SQLite in the volume by default. To use Turso instead, set `CARDPRESS_DB_URL=libsql://...` and `CARDPRESS_DB_TOKEN` in `.env` (and a `CARDPRESS_SECRET_KEY`).
- **Data**: the SQLite database (and the key file, if you did not set `CARDPRESS_SECRET_KEY`) live in the `cardpress-data` volume, mounted at `/data`. Back it up with `docker run --rm -v cardpress-data:/data -v $PWD:/out busybox tar czf /out/cardpress-data.tgz /data`. To use a folder instead of the named volume, make it writable by uid 65532 (the image runs as non-root).
- **Access**: the port is published on `127.0.0.1` only. To expose it, set `CARDPRESS_BIND=0.0.0.0`, a `CARDPRESS_API_TOKEN` and a `CARDPRESS_SECRET_KEY`, and put it behind HTTPS.
- **Assistant**: see [Claude Managed Agent](cma-agent.md). Create the agent once with `docker compose run --rm -e ANTHROPIC_API_KEY=... cardpress agent-setup`, then add `CARDPRESS_AGENT=cma`, the two ids and the key to `.env` and run `docker compose up -d`.
- **Health**: the container runs `/cardpress healthcheck` (there is no shell or curl in the image).
- **Image tags**: `latest` and `main` follow the main branch; `vX.Y.Z` tags follow releases; set `CARDPRESS_IMAGE_TAG` to pin one.

## Moving from the older, browser-only version

On first load, if the browser holds old data and the database is empty, the app offers to import it. Import copies it to the server and then removes it from the browser. The studio now has a single profile, so only the one you used last is kept. Import is refused if the database already has data.

## Scheduled posts

Scheduled posts are sent by a scheduler inside the Go process, so the server has to be running at that time. On a laptop that sleeps, scheduled posts will be missed (and flagged for you). Run one instance on a machine that stays on. See [Publishing](publishing.md) for the timings and the `CARDPRESS_MISSED_GRACE`, `CARDPRESS_LINKEDIN_VERSION` and `CARDPRESS_LINKEDIN_API_BASE` settings.
