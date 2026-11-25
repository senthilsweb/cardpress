# Conversational designer: the assistant writes the card's words and the post, and can post

**Status:** proposed. Nothing is built. The agent side lives in the separate `social-card-agent` repository and depends on the MCP tools in [contract.md](contract.md), so the MCP work comes first. The screen and sources are in `2026-12-03-chat-workspace`.

## Why
Today the assistant only suggests text. An agent connected over MCP can read but not act. The person designs the card in the studio: layout, colours, background, fonts, branding. The goal is to do the words by talking, starting from that card: "change the title to ..., shorten the subtitle, put the series name in the tag", see each change on the canvas as the conversation goes on, have the post or article written, then say "post it". How the card looks stays the person's: the agent cannot change it.

## What changes
- **MCP gains tools that act.** An agent can read a draft's card design, change the words on the card (title, subtitle, eyebrow, tag, footers, quote author, stat), write a post or an article, set a video, keep notes about a brand, see which networks are connected, and publish a post now. What the Text and Write tabs offer is reachable, with the exceptions under Out of scope. Nothing on the Design tab is.
- **The canvas follows the conversation.** A change made through MCP reaches every open studio for that brand within a second, without a reload.
- **The chat talks to a team of agents.** The built-in single writer agent (`cardpress agent-setup`) is replaced by the agents defined in `social-card-agent`: a coordinator, a post writer and an article writer. The first draft of each kind is graded against a rubric and revised until it passes.
- **The chat remembers.** Conversations are already stored. Notes the assistant keeps about a brand (voice, preferences, things to avoid) are stored in a new table and offered to it in later conversations.
- **Posting from the chat.** The assistant can publish a post to a connected network. Only posting now: no scheduling, rescheduling, cancelling or deleting.

## Decisions this change reverses
Three earlier decisions are changed on purpose. They are listed so the reversal is a choice and not drift.

| Earlier decision | Where | Now |
|---|---|---|
| The agent's output is content fields only, in a proposal | `chat-content-agent`, `internal/agent` | It also sets the words on the card, through `update_card_text`. **Kept:** it never chooses layout, colours, background, fonts or anything else about how the card looks. |
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

- **Anything about how a card looks:** layout, background, colour set, size, pattern, title size, art strength, fade, logo and footer switches, fonts. The person sets these in the studio; the agent is given them as context and is refused if it tries.
- Scheduling, rescheduling, cancelling or deleting through an agent.
- Uploading or generating images through an agent: photos, screenshot, background image, a post's own picture or pictures, a PDF attachment.
- Putting an article's public page online (its summary and address can be set).
- Publishing an article to a network (the app cannot do that for a person either).
- Networks the app cannot publish to. Today it publishes to LinkedIn only.
- Changing a brand's profile, colours, font list or credentials.
- Controls that only change what a person sees: preview size grid, feed preview, light or dark.
