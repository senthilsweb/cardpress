# Design

## The MCP tools

The tools, their inputs and their refusals are in [contract.md](contract.md), shared with `social-card-agent`.

Existing tools keep their names. `get_draft` returns more fields, and `list_design_presets` is unchanged, including its note that an agent cannot choose the design. The new tools are `get_design`, `create_draft`, `update_draft`, `update_card_text`, `set_attachment`, `list_connections`, `list_memories`, `save_memory`, `delete_memory` and `publish_post`.

A draft tool takes the draft's id. The brand is read from the draft and checked against the caller, so another person's draft looks like one that does not exist.

**The agent changes the words on a card, never how it looks.** `update_card_text.changes` accepts only the text fields (`eyebrow`, `title`, `subtitle`, `footer`, `footerLeft`, `tag`, `quoteAuthor`, `statValue`). They are merged into the draft's design and go through `ParseCardDesign`, so the length limits are the editor's. Any other field is refused: layout, background, colours, size, fonts, title size, art strength, fade, the logo and footer switches and images stay with the person in the studio. The service method takes a struct with only the eight text fields, so there is no code path from a tool to an aesthetic field.

The tools stay behind narrow interfaces, as now. The pinned test lists the new methods, so a tool that reaches further is still a reviewed change. The server instructions and `docs/mcp.md` stop saying the server cannot change or publish anything.

## Where the design lives
Each draft keeps its own design (`drafts.design`) and the canvas shows it. The brand's row in `designs` is only where a new draft starts, and what is shown for a draft that has none.

`update_card_text` therefore writes the draft, and copies the result to the brand's row, as the studio does today when a person changes the card.

Two writers on one draft need a rule. `drafts` gets a `revision` counter, moved by every change.

- `update_card_text` reads, merges and writes in one transaction.
- `update_draft` changes only the named fields; with `body` it must name the revision it read, and is refused if the draft has moved on.
- The browser's save sends the revision it knows. If refused, it takes the server's draft, re-applies only the fields the person changed since the last save, and saves again. What the person typed wins for those fields.

Every write by a tool keeps the rules a person's write has: refused while a post is waiting; an approved or published draft returns to draft and its page goes offline. The tool result says when that happened.

A body written by a tool is plain text turned into a document. An article that contains pictures is refused, because they would be lost. Before the first tool write of a chat turn the service saves a version, whatever the ten-minute limit on automatic versions, so the text can always be restored from History.

## Live canvas

A small in-process hub in the service layer: `Publish(profileID, event)` and `Subscribe(profileID)`.

- `GET /api/v1/events?profileId=` is a server-sent event stream of that brand's events: `draft` (id, kind, revision, and which fields changed) and `job` (id and status). It sends a comment line every 25 seconds to stay open.
- The studio subscribes while it is open. On `draft` it reads the draft and replaces what it holds, except fields with unsaved typing.
- The hub is in memory. With more than one server instance an event reaches only the browsers connected to the instance that made the change. The hosted setup runs one machine; the 15-second check the page already does stays as the fallback. A shared channel is a later change if it is ever needed.

## The card image for a post

The card is drawn in the browser; the server has no renderer. A post made by a person carries the PNG the browser rendered. `publish_post` has no browser of its own, so:

- When a draft with the card attachment is saved, and when its design changes, the browser uploads the rendered PNG with the design it was drawn from: `PUT /api/v1/drafts/{id}/card`. It does this for any draft of the open conversation, also one that is not on screen.
- `publish_post` uses that image only when it was drawn from the draft's current design. Otherwise it answers that the card is not ready and that the studio must be open on this brand. In the chat this resolves itself: the studio is open, receives the `draft` event, renders and uploads.
- A draft with a file of its own (picture, pictures, document, video) needs no card image, as today.

Drawing the card on the server was considered and left out: it means a second renderer for six layouts and eleven backgrounds, or a headless browser in the image.

## The chat and the managed agents

`internal/cma` keeps its shape (one session per conversation, stream first, reconnect and de-duplicate) with these changes:

- **Agents come from `social-card-agent`.** That repository applies its files with `ant apply` and builds a manifest: the coordinator's agent id, the environment id, the vault id and the rubric texts. The app reads it from `CARDPRESS_AGENT_MANIFEST` (a path or an https address). `cardpress agent-setup`, `CARDPRESS_AGENT_ID` and `CARDPRESS_AGENT_ENVIRONMENT_ID` are removed.
- **Tools are the MCP tools.** The coordinator's `mcp_servers` entry points at this server's `/mcp`. The custom tool `propose_content` and its three-try loop go away. The adapter handles `agent.mcp_tool_use` and `agent.mcp_tool_result` to show progress ("changed the title"), and no longer executes anything itself.
- **Outcomes.** The first draft of each kind the person ticks is `user.define_outcome` with that kind's rubric (`max_iterations` 3); its description carries every source, because the grader sees nothing else. Both ticked means two outcomes, the post first. Everything else is `user.message`. The grader's verdict and explanation are shown under the draft.
- **Confirmation.** A `publish_post` call arrives as `session.status_idle` with `requires_action`. The chat stream sends a `confirm` event; the person's answer is sent back as `user.tool_confirmation`. With `CARDPRESS_AGENT_PUBLISH=auto` the session is created with that tool's policy overridden to `always_allow`.
- **Context.** Each message carries the blocks in [contract.md](contract.md): the linked drafts, the item on screen, what to write, new sources, the card of a draft the first time it appears, and what the person changed by hand since the agent last saw it. The conversation stores the revision it last sent for each draft.
- **Drafts are made by the app.** When a person ticks Post or Article and no draft of that kind is linked, the app creates and links it before sending. A draft the agent makes with `create_draft` is linked when the adapter sees the tool result. The links, sources and screen are in `2026-12-03-chat-workspace`.
- **Budget and timeout** stay as they are.

### Acting as the signed-in person
The MCP server knows who is calling from the API key. The managed agent gets its key from a vault, and a vault is attached when a session is created. So each person gets their own vault:

- On a person's first chat, the app creates a vault named after their user id and an API key with the **agent** scope, and stores the key in the vault as a `static_bearer` credential for this server's `/mcp` address. The vault id is kept in `users`. The key is shown in Account settings like any other and can be revoked there; revoking it makes the app create a new one on the next chat.
- With accounts off (single-user installs), one vault holds the server's `CARDPRESS_API_TOKEN`. The vault is the one named in the manifest.

### The server must be reachable
Anthropic calls `/mcp` from its side, so the app needs a public https address: `CARDPRESS_PUBLIC_URL`. On a laptop that means a tunnel. If the address is missing or is a localhost name, the managed agent is refused at start with that explanation and the demo agent is used.

## Memory

Table `agent_memories (id, profile_id, key, content, created_by, created_at, updated_at)`, unique on `(profile_id, key)`. At most 50 notes per brand, 2,000 characters each; `key` is a short slug. The notes are plain text written by the agent on the person's instruction ("remember that I never use hashtags"). They are sent with the first message of each new session and can be read, edited and deleted in the saved notes drawer. They are treated as the person's own preferences, not as source data.

Managed Agents has its own memory stores. They are not used: the requirement is that memory lives in the app's database, and notes there are visible to the person and travel with a backup.

## Cost of a conversation
One conversation is one managed session, so its cost is the session's `usage`: `list_cost` (public rates, to the cent, including running time), `active_seconds` and tokens. Per-thread figures show the coordinator, the writers and so on, and do not add up to the session's.

- After each turn the adapter reads the session's usage and stores a row in `chat_usage (conversation_id, message_id, list_cost_cents, active_seconds, usage, created_at)`: the cumulative figures, so a turn's cost is the difference from the row before. Because figures are rounded to the cent, a single small turn can read as zero.
- The chat shows the conversation's cost so far under its title; an admin can list conversations with their costs.
- Until the chat is connected, `social-card-agent/scripts/session-cost.sh` measures test sessions.
- List cost is not the billed price where discounts apply.

## Safety

- Source text is still data. A fetched page that says "post this now" meets two barriers: the confirmation click, and the server-side permission evaluation, which gives tool results and fetched text no weight.
- `publish_post` checks the key's **scope**, not only the permission: the `editor` scope already holds the publish permission for the REST API. A key with the `agent` scope is accepted on `/mcp` only, so the assistant's key cannot be used against the REST API. It holds write, approve and publish, not social credentials.
- The confirmation click is enforced by the managed agent. Another MCP client holding an `agent` key posts without it; `docs/mcp.md` says so where the scope is offered.
- `publish_post` is rate limited to 10 per brand per day through an agent.
- Every call is in the MCP audit trail, with the person the key acts as.
- The sub-agents (the writers) have no MCP tools. Only the coordinator can change or post anything.
- Conversations, sources and brand notes are sent to Anthropic when the managed agent is on. The screen already says so.
