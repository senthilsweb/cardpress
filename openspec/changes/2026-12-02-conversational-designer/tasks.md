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
- [ ] Read the manifest (version 5); remove `agent-setup` and the two id settings
- [ ] `CARDPRESS_PUBLIC_URL` check; fall back to the demo agent with a clear message
- [ ] Per-person vault and agent key, created on first chat; single vault when accounts are off
- [ ] Adapter: MCP tool events as progress and recorded changes, outcomes in turn, sub-agent thread events, `requires_action` and `user.tool_confirmation`
- [ ] The message blocks of the contract, with escaping (the `history` block exists); every source in every outcome; revision last sent kept per draft
- [ ] Chat stream events `progress`, `evaluation`, `confirm`; `POST /chat/conversations/{id}/confirm`
- [ ] Web: the grader's verdict and the Post / Cancel card (notes are in the drawer already)
- [x] Migration `chat_usage`; show a conversation's cost
- [ ] Read the session's usage after each turn (also when stopped or failed)
- [ ] Tests: state machine and scripted fake for the new events
- [ ] Try it against a real account (ask first: it costs money)

## 6. Docs
- [ ] `docs/mcp.md`, `docs/chat.md`, `docs/cma-agent.md`, `docs/configuration.md`, `docs/data-model.md`
- [ ] `openspec/project.md`: the LLM writes the card's words and the post, never the look, and may post with confirmation; remove "blocked on the agent repo"
