# Tasks

Build order across this change and `2026-12-03-chat-workspace`:

1. Workspace A (new layout and linked drafts, with the current assistant). Done first, so the screen can be tried.
2. Steps 1 to 4 here (the MCP server is complete and can be tried from any MCP client).
3. Workspace B (sources and files).
4. Step 5 here (managed agents), then step 6.

## 1. Drafts and designs over MCP
- [x] Migration: `drafts.revision`
- [x] Service: partial draft update and `PatchCardText(draftID, text)` taking only the eight text fields, one transaction, brand starting design, version before a body write
- [x] `PUT /drafts/{id}` takes and returns the revision; the browser re-applies its unsaved fields on a refusal
- [x] Tools `get_design`, `update_card_text` (refuses every non-text field), `create_draft`, `update_draft`, `set_attachment`; `get_draft` returns the contract's fields
- [x] `list_design_presets` stays as it is

## 2. Live canvas
- [x] Hub in the service layer; draft writes publish to it
- [ ] Job changes publish to it (the studio still checks jobs on its own)
- [x] `GET /api/v1/events` (server-sent events, heartbeat, same access rules as the API)
- [x] Studio subscribes and applies `draft` and `job` events; unsaved typing is kept
- [x] Run for real: change a card's title from an MCP client and watch an open studio follow

## 3. Memory and connections over MCP
- [x] Migration `agent_memories`; service with the limits; tools `list_memories`, `save_memory`, `delete_memory`
- [x] Tool `list_connections`

## 4. Posting over MCP
- [ ] API key scope `agent`, accepted on `/mcp` only; `editor` unchanged (migration: `api_keys.scope` has a check that allows only `editor`)
- [ ] `PUT /api/v1/drafts/{id}/card` and the browser upload after a save or a draft event
- [ ] Tool `publish_post`: scope, card check, approve if needed, create and run the job, daily limit
- [ ] Pinned test: the new method list and tool list; server instructions rewritten
- [ ] Run for real against LinkedIn from an MCP client (ask the owner before each real post)

## 5. The chat on the managed agents
- [x] Read the manifest (version 5), pin its agent version; remove `agent-setup` and the id settings
- [x] `CARDPRESS_PUBLIC_URL` must match the manifest's MCP address, or the server refuses to start
- [x] Remove the demo assistant; with none set up the chat says so (the stand-in lives in `internal/agent/agenttest`)
- [x] Single vault: admin only, in brands the admin owns
- [ ] Per-person vault and agent key, created on first chat
- [x] Adapter: tool and sub-agent events as progress, outcomes in turn, verdict in the reply
- [ ] Recorded changes per reply; `requires_action` and `user.tool_confirmation` (with `publish_post`)
- [x] The message blocks of the contract, with escaping; every source in every outcome; what was last seen kept per draft
- [x] Chat stream event `progress`
- [ ] Chat events `evaluation`, `confirm`; `POST /chat/conversations/{id}/confirm`; the Post / Cancel card
- [x] Migration `chat_usage`; show a conversation's cost
- [x] Read the session's usage after a reply
- Not planned: recording usage after a stopped or failed reply (the owner reads costs in the Claude console)
- [x] Tests with a scripted fake; a local run against a stand-in service with the real library and MCP
- [ ] Try it against the real account (ask first: it costs money)

## 6. Docs
- [x] `docs/chat.md`, `docs/cma-agent.md`, `docs/configuration.md`, `docs/data-model.md` (`docs/mcp.md` with step 4)
- [ ] `openspec/project.md`: the LLM writes the card's words and the post, never the look, and may post with confirmation; remove "blocked on the agent repo"
