# MCP server

## Why
The Claude Managed Agent (separate repo) should be able to use the studio's server capabilities as tools. Exposing the service layer over MCP lets agentic features grow without a second integration.

## What changes
- An MCP server over the same service layer as the HTTP API, built with the official Go SDK.
- Transports: streamable HTTP at `/mcp` on the Go server, and stdio through a `cardpress mcp` subcommand for local clients.
- The same exposure guard and bearer token apply as for `/api/v1`.
- **Tools in this change (content preparation only):**
  - `list_drafts`, `get_draft`
  - `propose_content` (kind, title, body, hashtags, alt text) which lands as a pending proposal for human approval, never directly in a draft
  - `list_design_presets` (read-only: layouts, palettes, backgrounds)
  - `list_jobs`, `get_job` (read-only status and errors)
  - `fetch_source` (the SSRF-guarded URL fetcher)
- **Not exposed:** publish, schedule, reschedule, cancel, and anything that reads or writes credentials.

## Future
Publishing and scheduling tools can be added in a later change, so the agent can go all the way to publishing. That change must decide the approval model first. Credentials are never exposed over MCP.

## Decisions
- Agent writes go through the proposal and approval path, so the human gate holds for MCP callers exactly as for the chat.
- Every MCP call is recorded in an audit table (tool, arguments summary, caller, result).
