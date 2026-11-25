# Reference

## JSON API

All routes are under `/api/v1`. Once an account exists, a request needs a **sign-in** (the `cardpress_session` cookie), an **API key** (`Authorization: Bearer cpk_...`) or the machine token (`Authorization: Bearer <CARDPRESS_API_TOKEN>`). `/healthz`, `/api/v1/info` and the sign-up and sign-in routes are open. Another person's item answers `404`; something your role may not do answers `403`; no or a bad credential answers `401`. Who may call each route is declared in one table in `internal/api/api.go`, and a test walks every route as a second person to check it. See [Accounts and roles](accounts.md).

| Route | Purpose |
|---|---|
| `GET /info` | Name, version, database driver, whether accounts are on, whether first-run set-up is needed, whether sign-up is open, and (signed in) who you are and what you may do |
| `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout` | Create the first (admin) account or, when sign-up is open, your own; sign in; sign out |
| `GET /auth/me`, `PUT /auth/me`, `PUT /auth/password` | Your details, change them, change your password (a key cannot) |
| `GET/POST /api-keys`, `DELETE /api-keys/{id}` | Your API keys: list (never the secret), create (the secret is returned once), revoke (a key cannot manage keys) |
| `GET/POST /users`, `PUT /users/{id}`, `PUT /users/{id}/password` | Admin only: list, add, change role or status, set a password |
| `GET /state` | Your brands, designs and preferences |
| `PUT /profiles`, `PUT /designs`, `PUT /preferences/{key}` | Save them. `PUT /profiles` adds and updates; it never removes a brand |
| `POST /profiles`, `PUT /profiles/{id}`, `PUT /profiles/order` | Create, save and reorder brands |
| `POST /profiles/{id}/archive`, `POST /profiles/{id}/restore` | Hide a brand and bring it back; archiving keeps everything and says how many posts are still scheduled |
| `DELETE /profiles/{id}` | Delete an archived brand and everything it owns; refused (`409`) while it has scheduled or unfinished posts |
| `POST /import/legacy` | Import data from the older browser-only version |
| `GET/POST /drafts`, `GET/PUT/DELETE /drafts/{id}` | Drafts. Only a draft can be deleted |
| `POST /drafts/{id}/approve`, `POST .../unapprove`, `PUT .../plan` | Approve (needs `approve`), take approval back, set an article's planned date |
| `POST/DELETE /drafts/{id}/page` | Put an approved item's public page online or take it down (needs `publish`); see [Public pages](public-pages.md) |
| `GET/POST /drafts/{id}/versions`, `GET .../{seq}`, `POST .../{seq}/restore` | An item's history: list, save one with a note, read one, restore one |
| `GET /library` | The library list, with server-side paging, search and filters |
| `GET /profiles/{id}/settings`, `GET/PUT /profiles/{id}/settings/{network}`, `POST .../test` | One brand's social credentials (secrets are write-only). The older `/settings...` routes act on the first brand |
| `POST/GET /publish/jobs`, `GET/DELETE /publish/jobs/{id}`, `GET .../attempts` | Publish jobs and what LinkedIn answered on each attempt |
| `GET /publish/jobs/{id}/image` | The file of a job: the card, or the post's own image or PDF |
| `GET/PUT/DELETE /drafts/{id}/attachment`, `PUT .../attachment/title` | A post's own image or PDF, sent in place of the card, and a document's title |
| `POST /drafts/{id}/images`, `GET/PUT/DELETE /drafts/{id}/images/{image}`, `PUT .../images/order` | A post's set of images: add, read, describe, remove, reorder |
| `POST /publish/jobs/{id}/publish-now`, `PUT .../schedule`, `POST .../cancel` | Job actions |
| `POST/GET /chat/conversations`, `GET/DELETE /chat/conversations/{id}` | Conversations |
| `POST /chat/conversations/{id}/messages` | Send a message; the reply streams as server-sent events |
| `POST /chat/proposals/{id}/decision` | Approve, edit or reject a proposal |
| `GET /mcp/audit` | The MCP audit trail (admin only) |
| `GET/PUT /settings...` | The older, first-brand credential routes (admin only) |

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
