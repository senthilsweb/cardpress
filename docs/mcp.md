# MCP: letting an outside agent help

CardPress can be used by an AI agent through the [Model Context Protocol](https://modelcontextprotocol.io) (MCP). The agent can **read** your drafts and job status, **read public web pages**, and **propose** content. It cannot publish, schedule, change a draft, or reach credentials. Every proposal waits for you in the Assistant drawer.

## What an agent can do

| Tool | What it does | Changes anything? |
|---|---|---|
| `list_profiles` | Profile ids, names, handles (no images) | No |
| `list_drafts`, `get_draft` | Read your drafts as plain text | No |
| `list_jobs`, `get_job` | Read publishing jobs: status, time, error, LinkedIn link | No |
| `list_design_presets` | The layouts, backgrounds, image sizes and your saved colour sets. Read-only: you choose the design, not the agent. | No |
| `fetch_source` | Fetch a **public** web page and return its text, marked untrusted. Private and local addresses are refused ([how](chat.md#reading-a-web-address-safely)). | No |
| `propose_content` | Suggest a post or an article. It becomes a **pending proposal**. | Adds a proposal, nothing else |
| `get_proposal` | See whether a proposal was approved, edited or rejected, and the final text | No |

**Not available to an agent, by design:** publishing, scheduling, rescheduling, cancelling, creating or editing drafts, anything about credentials or settings. This is enforced in the code, not just left out of the list: the tools are handed narrow interfaces that contain only the read and propose methods above, so there is nothing for a tool to call, and a test pins that list. Adding a tool that can do more would be a deliberate, reviewed change (and the [publishing](publishing.md) rule that a person confirms every post would still have to be decided first).

An agent that reads your drafts and jobs can see what is in them, so connect only agents you trust with that, and use a token (below) if the server can be reached by anything else.

## How a proposal reaches you

`propose_content` stores the suggestion as a **pending proposal** in its own conversation, marked **Outside agent**. The Assistant button in the header shows a number while proposals are waiting, and the page notices new ones within about 15 seconds. You approve it (it fills an empty draft, or a new draft if the current one has text), edit it first, or reject it, the same as a proposal from the built-in chat. The agent can send a revised version into the same conversation and can later call `get_proposal` to see what you did. The name shown is whatever the agent called itself when it connected; it is **not verified**.

An agent can leave at most 20 unreviewed proposals per profile, so a runaway agent cannot bury you; it is told to ask you to review them.

## Connecting an agent

**On the same machine (stdio).** The agent starts CardPress itself and talks to it on its standard input and output. It uses the same database as the server, so run it with the same `-db` (or `CARDPRESS_DB_URL`):

```json
{
  "mcpServers": {
    "cardpress": {
      "command": "/path/to/cardpress",
      "args": ["mcp", "-db", "file:/path/to/data/cardpress.db"]
    }
  }
}
```

Nothing else is written to standard output. Because the agent launches the program as you, there is no token for this mode; whoever can run it can already read the database.

**Over HTTP.** The running server also answers at **`/mcp`** (streamable HTTP), for example `http://localhost:8080/mcp`. If you set `CARDPRESS_API_TOKEN`, the client must send `Authorization: Bearer <token>`. Check your client's documentation for how to add an HTTP server with a header; for Claude Code that is along the lines of:

```bash
claude mcp add --transport http cardpress http://localhost:8080/mcp --header "Authorization: Bearer <token>"
```

Turn the HTTP endpoint off with `CARDPRESS_MCP=false` (or `-mcp=false`). The stdio command is not affected.

## Access rules (HTTP, and the JSON API)

- **Token.** With `CARDPRESS_API_TOKEN` set, every request needs it. Without a token the server only listens on this machine unless you override that (see [Deployment](deployment.md)).
- **No token: only `localhost` names are answered.** A website you visit can send requests to `localhost` from your browser, and a hostile DNS name can be pointed at `127.0.0.1` ("DNS rebinding"). So with no token, a request whose `Host` is not `localhost`, `127.0.0.1` or `::1` is refused. If you reach the server under another name (a reverse proxy, a LAN name), list it in `CARDPRESS_ALLOWED_HOSTS` or set a token.
- **No cross-site changes.** A request that changes something and that a browser makes *from another website* is refused (Go's `http.CrossOriginProtection`), whether it targets `/api/v1` or `/mcp`. Programs such as curl or an MCP client send no browser headers and are unaffected. A separately hosted web app you listed in `CARDPRESS_CORS_ORIGINS` is trusted.

## The audit trail

Every tool call is recorded in the `mcp_audit` table: when, over which transport (`http` or `stdio`), the caller's self-reported name and version, the tool, a **summary** of the arguments, and whether it worked. Long text is cut, lists and objects are counted, and anything under a secret-looking name (`token`, `secret`, `password`, `authorization`, `api key`…) is replaced, so the trail never holds a credential. It keeps the newest 5,000 rows. Read it at `GET /api/v1/mcp/audit?limit=100`.

If recording a call fails, the call still goes ahead and the failure is logged; the trail is for oversight, not a gate.

## Code map

| Piece | Where |
|---|---|
| The tools, the narrow interfaces, HTTP and stdio entry points | `internal/mcpserver/server.go`, `tools.go` |
| The audit | `internal/mcpserver/audit.go`, migration `0006_mcp_audit.sql` |
| Design presets (checked against the web app by a test) | `internal/mcpserver/presets.go` |
| Outside proposals (`Propose`, the cap, `Proposal`) | `internal/service/chat.go` |
| Token, host and cross-site protection | `internal/api/protect.go` |
| `cardpress mcp` | `main.go` (`runMCP`) |
