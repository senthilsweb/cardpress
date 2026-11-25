# Conversational designer: the assistant designs the card and can post

**Status:** proposed. Nothing is built. The agent side lives in the separate `social-card-agent` repository and depends on the MCP tools in [contract.md](contract.md), so the MCP work comes first. The screen and sources are in `2026-12-03-chat-workspace`.

## Why
Today the assistant only suggests text. The person still does every design step by hand, and an agent connected over MCP can read but not act. The goal is to design a card by talking: "make the title bigger, use the mesh background, switch to Sora", and see each change on the canvas as the conversation goes on, then say "post it".

## What changes
- **MCP gains tools that act.** An agent can read and change a draft's card design, write a post or an article, set a video, keep notes about a brand, see which networks are connected, and publish a post now. What the Design, Text and Write tabs offer is reachable, with the exceptions under Out of scope.
- **The canvas follows the conversation.** A change made through MCP reaches every open studio for that brand within a second, without a reload.
- **The chat talks to a team of agents.** The built-in single writer agent (`cardpress agent-setup`) is replaced by the agents defined in `social-card-agent`: a coordinator, a post writer and an article writer. The first draft of each kind is graded against a rubric and revised until it passes.
- **The chat remembers.** Conversations are already stored. Notes the assistant keeps about a brand (voice, preferences, things to avoid) are stored in a new table and offered to it in later conversations.
- **Posting from the chat.** The assistant can publish a post to a connected network. Only posting now: no scheduling, rescheduling, cancelling or deleting.

## Decisions this change reverses
Three earlier decisions are reversed on purpose. They are listed so the reversal is a choice and not drift.

| Earlier decision | Where | Now |
|---|---|---|
| The agent never chooses layout, colours or background | `chat-content-agent`, `mcp-server`, `internal/agent` | It may, through `update_design`. Every change is visible at once and can be undone. |
| An agent's text reaches a draft only through an approved proposal | `mcp-server` | `update_draft` writes the text directly. `propose_content` stays for agents that should not write. |
| Nothing is published without a person's confirmation in the Full preview | `openspec/project.md` | `publish_post` can post. By default the chat asks for one confirmation click first (see below). |

## The approval model for posting
`mcp-server` said a publishing tool "must decide the approval model first". The decision:

- `publish_post` needs the **publish** permission, and an API key needs the new **agent** scope for it. The existing **editor** scope does not get it, so no key already in use gains the ability to post.
- In the chat, the agent's `publish_post` call pauses and the chat shows what will be posted, where, and **Post** / **Cancel**. This is the managed agent's `always_ask` permission, so it is enforced outside the model.
- Setting `CARDPRESS_AGENT_PUBLISH=auto` removes the click, for people who want the agent to post on their word alone. The default is `confirm`.
- A failed post is never retried by the agent. It reports the job's error, as the Full preview does.

## Out of scope
Open to change; say so if any of these should be in.

- Scheduling, rescheduling, cancelling or deleting through an agent.
- Uploading or generating images through an agent: photos, screenshot, background image, a post's own picture or pictures, a PDF attachment.
- Putting an article's public page online (its summary and address can be set).
- Publishing an article to a network (the app cannot do that for a person either).
- Networks the app cannot publish to. Today it publishes to LinkedIn only.
- Changing a brand's profile, colours, font list or credentials.
- Controls that only change what a person sees: preview size grid, feed preview, light or dark.
