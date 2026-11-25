# Code Tour

Where things are, and the patterns worth knowing before you change anything.

## Layout

```
main.go                  wiring: config, database, services, routes; embeds web/dist
internal/
  config/                flags and environment; refuses unsafe setups
  store/                 SQLite or Turso (libSQL) and the embedded SQL migrations
  service/               the rules: drafts, settings, publishing, chat
  api/                   the JSON API under /api/v1, and the access guard (protect.go)
  secrets/               encryption for stored credentials
  linkedin/              LinkedIn client and text escaping
  source/                fetching web pages safely (SSRF guard) and extracting text
  agent/                 the Client interface for the assistant and proposals (agenttest/ is a stand-in for tests)
  cma/                   the Claude Managed Agent adapter
  mcpserver/             the MCP tools, the audit trail
web/
  src/pages/             index.astro (landing page), studio.astro (the editor)
  src/card/              the card renderer: Card.tsx (layouts), backgrounds.tsx, bg/ (drop-ins)
  src/components/studio/ the editor UI
  src/components/ui/     shadcn components, including the drawer
  src/lib/               API client, profiles, palettes, sizes, export, LinkedIn text rules
  src/styles/global.css  theme tokens
scripts/record-demo/     records the demo GIF
openspec/                one change proposal per piece of work
```

## Load-bearing files

| File | Why it matters |
|---|---|
| `internal/config/config.go` | Every setting, and `Validate`, which refuses to expose the API without protection |
| `internal/api/protect.go` | Token check, localhost-only Host guard and cross-site request protection, shared by the API and `/mcp` |
| `internal/api/api.go` and `auth.go` | The route table (who may call each route), sign-in, and how a request becomes a person, a key or the machine |
| `internal/service/accounts.go`, `principal.go` | People, roles, sessions, password hashing and rate limits; the principal every query is narrowed by |
| `internal/service/apikeys.go` | API keys: made once, stored as a hash, scoped, revoked |
| `internal/service/versions.go` | An item's history and the shared store for its pictures |
| `internal/pages/` | The public, server-rendered article and post pages |
| `internal/service/publish.go` | The publish queue, the scheduler and the state machine for a job |
| `internal/service/chat.go` | Conversations, messages, proposals and their approval |
| `internal/agent/agent.go` | The assistant's port: `Client`, `Proposal` and its validation |
| `internal/mcpserver/server.go` | The tools an outside agent gets, and nothing more |
| `internal/source/guard.go` | The checks on every address the server fetches |
| `web/src/card/Card.tsx` | The six layouts |
| `web/src/components/studio/Studio.tsx` | The screen: header, sidebar tabs, canvas, drawers |

## Patterns

- **Narrow interfaces.** The MCP server and the assistant get small interfaces (read drafts, propose content), not the whole service. Tests pin which tools exist and what they can reach.
- **The agent boundary.** `agent.Client` is the only thing the chat knows about its writer. The managed-agent adapter implements it. A proposal carries content fields only (kind, title, body, hashtags, alt text, rationale), and `ParseProposal` validates it the same way for every source.
- **Untrusted text.** Source text is data. It is kept apart from messages, and sent to a model inside tags marked untrusted.
- **A person publishes.** Nothing in `agent`, `cma` or `mcpserver` can call the publisher. Publishing is a separate, explicit request from the browser.
- **No hidden state in the browser.** The browser keeps only the open tab; profiles, drafts, designs and preferences are on the server.
- **Migrations are embedded** in `internal/store/migrations` and run at start.

## Tests

```bash
make test        # go vet, go test -race, web type check and unit tests
```

The Go tests use in-memory SQLite and local fake servers (LinkedIn, the managed-agent API), so they need no network and no accounts.

## Adding things

- A background: drop a file in `web/src/card/bg/`; see [Adding backgrounds](adding-backgrounds.md).
- A colour set: see [Palettes](palettes.md). A font: see [Fonts](fonts.md).
- A size: edit `web/src/lib/sizes.ts`.
- A migration: add the next numbered `.sql` file in `internal/store/migrations`.
