# Deploy to Fly.io

One Docker image on one always-on Fly machine. The web app is inside the image, so there is nothing else to host. Choose where the data lives:

| Storage | When to pick it |
|---|---|
| **SQLite on a Fly volume** (default) | One person, simplest, cheapest. The database is a file on a volume attached to the machine |
| **Turso** (`--turso`) | You want the database outside the machine, or its own backups and replicas |

Either way the machine stays on and there is exactly one of them: the scheduler runs inside the server, so a stopped machine misses scheduled posts, and two machines would both poll for due posts (a post still goes out once, but keep it simple).

!!! note "Why not Vercel"
    The web app is only the UI. The database access, encrypted credentials, scheduler, publishing, assistant and MCP endpoint are all in the Go server, which needs a long-running process. Vercel can host the static front end, but the Go server has to run somewhere else, so Fly with the image is simpler. See [Deployment](deployment.md#where-it-can-run).

## Before you start

- A Fly account and `flyctl` (`fly auth login`).
- A copy of `.env.example` as `.env` if you want to set the assistant or other options. You do not need one to get a first deployment: the API token and the encryption key are generated for you.

## First deployment

```bash
scripts/deploy-fly.sh up --app my-cardpress --region iad
```

This creates the app, a 1 GB volume (`cardpress_data`, mounted at `/data`), sets the secrets, and deploys the image with `fly.toml`. The first run prints a generated `CARDPRESS_API_TOKEN` once. **Save it**: the app asks for it when you open `https://my-cardpress.fly.dev/studio/`.

Add `--dry-run` to any command to print what it would do without touching Fly.

### With Turso

```bash
turso db create cardpress && turso db show cardpress --url && turso db tokens create cardpress
# put the URL and token in .env as CARDPRESS_DB_URL and CARDPRESS_DB_TOKEN
scripts/deploy-fly.sh up --app my-cardpress --turso
```

This uses `fly.turso.toml`: no volume, and the database settings are secrets.

## What the script sets

| Secret | Source |
|---|---|
| `CARDPRESS_API_TOKEN` | `.env`, or an existing Fly secret, or a new random one |
| `CARDPRESS_SECRET_KEY` | the same rule. It encrypts stored social credentials. **Do not lose it**: without it they cannot be read |
| `CARDPRESS_AGENT`, `CARDPRESS_AGENT_MANIFEST`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, budget and timeout | `.env`, if present. See [Claude Managed Agent](cma-agent.md) |
| `CARDPRESS_MCP`, `CARDPRESS_MISSED_GRACE`, `CARDPRESS_LINKEDIN_*`, `CARDPRESS_CORS_ORIGINS` | `.env`, if present |
| `CARDPRESS_DB_URL`, `CARDPRESS_DB_TOKEN` | `.env` (with `--turso`) |

Only these names are read from the file, and the file is parsed, not run. Values are sent to Fly on standard input, so they do not appear in the process list.

## Day to day

```bash
scripts/deploy-fly.sh deploy  --app my-cardpress             # ship a new image (add --turso if you use it)
scripts/deploy-fly.sh secrets --app my-cardpress             # sync changes in .env, then deploy to apply
scripts/deploy-fly.sh status  --app my-cardpress
scripts/deploy-fly.sh logs    --app my-cardpress
scripts/deploy-fly.sh backup  --app my-cardpress             # volume snapshot (Turso has its own backups)
```

To enable the assistant, set the values in [Claude Managed Agent](cma-agent.md) as Fly secrets or in `.env`, then deploy.

## Notes

- **Access**: the app is on the public internet. The token is a single shared guard, not user accounts: anyone with it has full access. For stricter access put Fly private networking or an access proxy in front. Fly serves HTTPS.
- **Volume**: it belongs to one machine in one region. Fly takes daily snapshots; `backup` takes one on demand. The image runs as root in this setup because a Fly volume is mounted root-owned (the Compose and Turso setups run as a non-root user).
- **Size**: `shared-cpu-1x` with 256 MB is enough for one person. Change it in `fly.toml`. A password check needs 64 MB, so `fly.toml` sets `GOMEMLIMIT` to keep Go's memory under the machine size, and the server checks one password at a time. If you raise the machine size, raise `GOMEMLIMIT` with it (about 60% of the memory).
- **Region**: pass `--region` on the first `up`; the volume and machine must be in the same region.
- **Destroying**: `scripts/deploy-fly.sh destroy --app my-cardpress` asks you to type the app name. It deletes the data.
