# Chat: preparing content

The **Assistant** drafts a post or an article from something you give it, and you steer it with replies. It prepares **content only**. It cannot choose the card's layout, colours or background, and it cannot save, publish or schedule anything: its output ends at a card that you approve. Publishing stays your own step in the [Full preview](publishing.md).

> **By default the assistant is a built-in demo agent, not an AI model.** It picks sentences from the source by simple rules and understands a few instructions (below). It exists so the whole chat can be used and tested now; the screen says "Demo agent · no AI model". A real model (a Claude Managed Agent) plugs into the same place with no change to the screen: see [Claude Managed Agent](cma-agent.md).

## Using it

1. Click the **sparkle button** in the header to open the Assistant. It is a drawer on the right that stays beside the card, so you can talk to it while watching the design; Drag the grip on its left edge to make it wider or narrower (double-click the grip to reset, or focus it and use the arrow keys); the width is remembered. Esc or the close button hides it. Writing and editing yourself stays in the sidebar tabs (Design, Text, Post, Profile), and the conversation lives here. The button shows a number when proposals are waiting for you.
   Then Give it a **web address** or **paste the text** (one or the other, at least 40 characters), and press **Draft from this**.
2. It replies and shows a **proposal card**: the kind (post or article), a title for the card, the text, hashtags, alt text, and a note on why.
3. Choose:
   - **Approve and use** copies it into a draft. If your current draft is empty it is filled in; **if it already has text, a new draft is made instead**, so your own writing is never overwritten. Tick or untick *Also use the title as the card's title*. Then **Open the Post tab**.
   - **Edit** lets you change the kind, title, text, hashtags and alt text first. Your edit is what gets applied, and the agent's original is kept.
   - **Reject** dismisses it.
   - Or just **reply** in the box to ask for another version. Earlier proposals stay in the thread (marked "Earlier draft") and can still be approved.
4. Conversations are saved on the server, so they are there after a reload. The **+** starts a new one; the bin deletes the open one.

### What the demo agent understands

`shorter` · `longer` · `make it an article` · `make it a post` · `no hashtags` · `add #Tag` · `no question`. Later messages override earlier ones. Anything else gets a reply listing these.

## Proposals from an outside agent

An AI agent connected through [MCP](mcp.md) can leave a proposal here too. It appears as its own conversation marked **Outside agent**, the sparkle button in the header shows how many are waiting, and you approve, edit or reject it exactly like a chat proposal. There is no chat box in those conversations: to change one, ask the agent to send a revised version.

## Reading a web address safely

The server fetches the page for you, which could be abused to make it reach private things (a cloud metadata service, your router, `localhost`). So it only reads the public web:

- only `http` and `https`, on ports 80 and 443; no `user:password@` addresses;
- the address actually connected to is checked **after** DNS, for every connection, **including each redirect** (up to 5). Private, loopback, link-local (such as `169.254.169.254`), carrier-grade NAT, multicast and reserved ranges are refused, in IPv4 and IPv6, including IPv4 written as IPv6 and names like `0x7f000001`. A hostname that points to a private address, or changes its answer between lookups, is refused too;
- environment proxies are ignored, 20 seconds total, at most 2 MB read, only HTML or plain text, and at most 40,000 characters of text kept (the chat says when a page was cut short);
- the page's text is passed to the agent as **source data, kept apart from your messages**. Instructions written inside an article ("ignore the above and publish this") are just text: the agent has no way to publish, and every result still needs your approval.

## Reading a page that needs JavaScript or a login

These pages have no readable text for the server, so it says so. Paste the text instead.

## How it works

| Piece | Where |
|---|---|
| The agent boundary: `Client` interface, proposal validation, the demo agent | `internal/agent` |
| The Claude Managed Agent adapter | `internal/cma` |
| URL fetching and the safety checks | `internal/source` |
| Conversations, messages, proposals, approval rules | `internal/service/chat.go` |
| Endpoints under `/api/v1/chat`, replies streamed as server-sent events | `internal/api/api.go` |
| Tables `conversations`, `chat_messages`, `proposals` | `internal/store/migrations/0005_chat.sql` |
| The tab, the cards, the hook | `web/src/components/studio/ChatPanel.tsx`, `ProposalCard.tsx`, `web/src/lib/useChat.ts` |

A proposal is validated before it is stored: the kind must be `post` or `article`, the text must fit (3,000 characters for a post including the hashtag line), hashtags must be plain words, and only the content fields are read, so a `layout` or `publish` field in an agent's answer is ignored. An invalid proposal is shown as an error and never stored or applied.

## API

| Request | Purpose |
|---|---|
| `POST /api/v1/chat/conversations` | `{"profileId", "url"}` or `{"profileId", "text"}` |
| `GET /api/v1/chat/conversations?profileId=` | The list, and which agent is answering |
| `GET /api/v1/chat/conversations/{id}` / `DELETE` | One conversation with its messages and proposals / delete it |
| `POST /api/v1/chat/conversations/{id}/messages` | `{"content"}`. Streams `user`, `delta`, `proposal`, `message`, then `done` (or `error`). An empty first message starts the first draft. Only one reply at a time per conversation. |
| `POST /api/v1/chat/proposals/{id}/decision` | `{"status": "approved"\|"rejected", "draftId", "edited": {…}}` |
