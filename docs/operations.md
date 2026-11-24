# Operations

Running CardPress day to day.

## What to keep

Two things matter: the database and, if you did not set `CARDPRESS_SECRET_KEY`, the key file next to it. Without the key, the stored credentials cannot be read.

| Where | Database | Key |
|---|---|---|
| Local run | `data/cardpress.db` | `data/secret.key` |
| Docker Compose | the `cardpress-data` volume, `/data/cardpress.db` | `/data/secret.key`, or `CARDPRESS_SECRET_KEY` in `.env` |
| Turso | the hosted database | `CARDPRESS_SECRET_KEY` (required) |

## Backups

With a SQLite file, take a consistent copy while it runs:

```bash
sqlite3 data/cardpress.db ".backup 'backup/cardpress-$(date +%F).db'"
cp data/secret.key backup/        # if you use the key file
```

With Docker Compose, see [Deployment](deployment.md#docker-compose) for a volume backup. Profiles can also be exported as JSON from the **Profile** tab.

## Upgrading

1. Back up the database.
2. Pull the new image (`docker compose pull && docker compose up -d`) or build the new binary and restart.
3. Migrations run at start and only move forward, so keep the backup until you are happy.

## Health and logs

- `GET /healthz` returns `ok <version>` and needs no token.
- The container runs `cardpress healthcheck` every 30 seconds.
- Logs go to standard output: one line per request, plus start-up notes (which database, whether a token and MCP are on).
- The MCP audit trail is in the database and at `GET /api/v1/mcp/audit`; see [MCP](mcp.md).

## Scheduled posts

- Keep **one** instance running on a machine that stays on. A sleeping laptop misses scheduled posts, which are then flagged for you; see [Publishing](publishing.md).
- On shutdown the server waits (up to 100 seconds) for a publish that is under way.
- After a restart, a publish left unfinished becomes **Check LinkedIn**; look at your feed before publishing it again.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "refusing to listen ... without a token" | Non-loopback address without `CARDPRESS_API_TOKEN`; set a token or `CARDPRESS_INSECURE=1` behind something that protects it |
| "credentials cannot be stored" in the log | No `CARDPRESS_SECRET_KEY` and not a local setup |
| The app says it cannot reach the server | The server is not running, or the API address is wrong (a separately hosted web app needs `CARDPRESS_CORS_ORIGINS`) |
| A request is refused as a bad host | Without a token only `localhost` names are accepted; add yours to `CARDPRESS_ALLOWED_HOSTS` |
| The assistant says "could not start a session" | Check `ANTHROPIC_API_KEY`, the agent and environment ids, and access to Managed Agents |
| "this conversation was started with a different agent" | The conversation belongs to the other agent type; start a new one |
| A scheduled post did not go out | The server was not running at that time; it shows as Missed |
