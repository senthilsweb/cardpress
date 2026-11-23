# Chat for content

## Why
Writing a post from a source article is slow. A chat can propose the content and the user can approve or steer it.

## What changes
- **Chat tab in the existing left sidebar** (between Text and Post); nothing else in the layout moves. The user starts with a remote URL or pasted text, and iterates by replying.
- The agent proposes **content only**: kind (post or article), title, body, hashtags, alt text, and a short rationale. It never chooses layout, palette or background; those stay user-selected from the presets.
- **Human approval gate.** Each proposal is shown as a card with Approve, Edit, Reject and a revise-by-reply box. Approve copies the content into the current draft if it is empty, and into a **new draft** if it already has text, so nothing the person wrote is overwritten. Nothing is published or scheduled by the agent.
- **Source fetching** by URL is done by the server, with SSRF protection: blocked private and link-local ranges, redirects re-validated, size and time limits, HTML and text only. Fetched text is passed as untrusted data, never as instructions.
- Conversations, messages and proposals are stored in the DB.
- **`AgentClient` port** (create session, send message, stream events, return a typed proposal) with a deterministic **mock agent** so the UI and tests work now. The real Claude Managed Agent adapter is a separate change.

## Boundary
The chat and LLM prepare content only. Their output ends at an approved draft. Publishing and scheduling are done by a person, deterministically, in the publish flow.

## Decisions
- The agent behind the port is a deterministic **demo** with no language model. The screen labels it "Demo agent · no AI model", and `/api/v1/info` reports `agent.ai: false`.
- The address actually dialled is checked after DNS for every connection and redirect, rather than checking the name beforehand, so DNS tricks cannot bypass it. Environment proxies are ignored for the same reason.
- Source text travels to the agent as a separate field and is never mixed into the conversation messages.
- Agent credentials stay server-side. The browser only calls the Go API, with events streamed over SSE.
- The agent output is validated against a schema; invalid output is shown as an error, not applied.
