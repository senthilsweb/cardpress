# MCP server

## Why
The Claude Managed Agent (separate repo) should be able to use the studio's server capabilities as tools. Exposing the service layer over MCP lets agentic features grow without a second integration.

## What changes
- An MCP server over the same service layer as the HTTP API, built with the official Go SDK.
- Transports: streamable HTTP at `/mcp` on the Go server, and stdio through a `cardpress mcp` subcommand for local clients.
- The same exposure guard and bearer token apply as for `/api/v1`. Both now also refuse requests that could come from a hostile web page: with no token only `localhost` host names are answered (DNS rebinding), and cross-site browser requests that change things are refused (CSRF, via `http.CrossOriginProtection`). This closes a gap in the JSON API that was found while designing this change: before it, a page you visited could make your browser send requests to a tokenless local server.
- **Tools in this change (content preparation only):**
  - `list_profiles` (so an agent can find the profile id) and `get_proposal` (so it can see what the person decided). These two were added to the first list because the others are hard to use without them.
  - `list_drafts`, `get_draft`
  - `propose_content` (kind, title, body, hashtags, alt text) which lands as a pending proposal for human approval, never directly in a draft
  - `list_design_presets` (read-only: layouts, palettes, backgrounds)
  - `list_jobs`, `get_job` (read-only status and errors)
  - `fetch_source` (the SSRF-guarded URL fetcher)
- **Not exposed:** publish, schedule, reschedule, cancel, and anything that reads or writes credentials.

## Future
Publishing and scheduling tools can be added in a later change, so the agent can go all the way to publishing. That change must decide the approval model first. Credentials are never exposed over MCP.

## Decisions
- Agent writes go through the proposal and approval path, so the human gate holds for MCP callers exactly as for the chat. An outside proposal is stored in its own conversation (source kind `mcp`), cannot be written into a person's own chat, and is capped at 20 unreviewed proposals per profile.
- The tools are handed narrow interfaces containing only read and propose methods, so publishing, cancelling, editing drafts and credentials are unreachable from the MCP package by construction. A test pins the exact list of methods and the exact list of tools.
- The design presets are a small Go table; a test compares it with the web app's own definitions so they cannot drift.
- Caller names come from the client and are labels, not identities.
- Every MCP call is recorded in an audit table (tool, arguments summary, caller, result).
