# Claude Managed Agent adapter

> Blocked: the agent is built in a separate repo. This change records the intent and is finalised once that contract exists.

## What changes
Implement `AgentClient` against the Claude Managed Agents session API: create a session per conversation, send user messages and source content, stream events, and map the agent's structured result to the proposal schema. Credentials come from server-side settings or environment.

## Open points
Session lifecycle and cost limits, how the agent receives fetched content versus fetching it itself, and event names. These are to be aligned with the agent repo before implementation.
