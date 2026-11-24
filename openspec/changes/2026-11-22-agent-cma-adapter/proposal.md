# Claude Managed Agent adapter

## What changes
Implement the `agent.Client` port against Claude Managed Agents (beta), so the chat can be answered by a real model. The demo agent stays the default; `CARDPRESS_AGENT=cma` selects the adapter.

## Decisions (the open points)
- **Session lifecycle**: one managed session per conversation, created lazily by the chat. Only the newest user message is sent each turn, because the session keeps the thread. The agent and environment are created once with `cardpress agent-setup`, which the user runs on purpose; the server never creates resources in an account.
- **Cost limits**: an optional per-session spend cap (`CARDPRESS_AGENT_BUDGET_CENTS`), a per-reply timeout (default 4 minutes) after which the session is interrupted so it stops spending, and the reply is bounded in length.
- **Source content**: CardPress fetches it (SSRF-guarded) and sends it once, in the first message, inside `<source untrusted="true">` tags. The agent has no network and no built-in tools, and its instructions say text in the tags is data. Tag characters inside the source are neutralised so it cannot close the block.
- **Result**: the agent calls a custom tool `propose_content` whose input is the proposal (content fields only). It is parsed and validated by the same code as every other proposal. An invalid one is returned to the agent as a tool error saying what is wrong, up to three times. The chat text it writes is the reply.
- **Events**: `agent.message`, `agent.custom_tool_use`, `session.status_idle` (`requires_action`, `end_turn`, `retries_exhausted`, `budget_reached`), `session.error`, `session.status_terminated`, and live `agent.message` previews. The stream is opened before sending, and a dropped stream is recovered from the session history, de-duplicated, so no event is lost or handled twice.

## Safety
The adapter cannot publish, schedule or change anything: its output ends at a proposal that a person approves. Conversations are sent to Anthropic when this agent is selected, and the screen says so (`IsAI`).
