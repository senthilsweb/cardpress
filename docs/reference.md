# Reference

## JSON API

All routes are under `/api/v1`. With `CARDPRESS_API_TOKEN` set, send `Authorization: Bearer <token>`. `/healthz` and `/api/v1/info` are open.

| Route | Purpose |
|---|---|
| `GET /info` | Name, version, database driver, whether a token is needed, and the assistant in use |
| `GET /state` | Profile, designs and preferences |
| `PUT /profiles`, `PUT /designs`, `PUT /preferences/{key}` | Save them |
| `POST /import/legacy` | Import data from the older browser-only version |
| `GET/POST /drafts`, `GET/PUT/DELETE /drafts/{id}` | Drafts |
| `GET /settings`, `GET/PUT /settings/{network}`, `POST /settings/{network}/test` | Social credentials (secrets are write-only) |
| `POST/GET /publish/jobs`, `GET/DELETE /publish/jobs/{id}` | Publish jobs |
| `GET /publish/jobs/{id}/image` | The card image of a job |
| `POST /publish/jobs/{id}/publish-now`, `PUT .../schedule`, `POST .../cancel` | Job actions |
| `POST/GET /chat/conversations`, `GET/DELETE /chat/conversations/{id}` | Conversations |
| `POST /chat/conversations/{id}/messages` | Send a message; the reply streams as server-sent events |
| `POST /chat/proposals/{id}/decision` | Approve, edit or reject a proposal |
| `GET /mcp/audit` | The MCP audit trail |

The details of each group are in [Publishing](publishing.md), [Social accounts](social-settings.md), [Chat](chat.md) and [MCP](mcp.md).

## MCP tools

Served at `/mcp` (HTTP) and by `cardpress mcp` (stdio). See [MCP](mcp.md).

| Tool | Access |
|---|---|
| `list_profiles`, `list_drafts`, `get_draft` | Read only |
| `list_design_presets` | Read only |
| `list_jobs`, `get_job` | Read only |
| `fetch_source` | Reads a public web page (with the SSRF guard) |
| `propose_content` | Adds a proposal that waits for your approval |
| `get_proposal` | Reads the decision on a proposal |

There is no tool to publish, schedule, change a draft or read credentials.

## Layouts and backgrounds

- **Layouts**: Hero, Centred, Article cover, Quote, Big number, Headshot.
- **Backgrounds**: Constellation, Dot grid, Code lines, Rising bars, Geometric, Contours, Gradient mesh, Photo mosaic, Browser frame, Own image, Waves, Plain.

## Sizes

| Network | Sizes |
|---|---|
| LinkedIn | 1200×627, 1200×1200, 1080×1350 |
| X | 1600×900, 1080×1080 |
| Instagram | 1080×1080, 1080×1350, 1080×1920 |
| Facebook | 1200×630, 1080×1080 |

These are common recommended sizes. Edit `web/src/lib/sizes.ts` if a platform changes them.

## Make targets

| Target | What it does |
|---|---|
| `make dev` | Go API on :8080 and the Astro dev server with hot reload |
| `make test` | Go tests, web type check and unit tests |
| `make build` | Build `web/dist` and `bin/cardpress` |
| `make release` | Cross-compile into `dist/` |
| `make docker`, `make docker-run` | Build and run the image |

## Licence

MIT.
