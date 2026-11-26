# Chat: writing with the assistant

The **Assistant** writes posts and articles from what you give it into drafts, and revises them as you reply. It can change the words on a card but never its look, and it cannot publish. Publishing stays your own step in the [Full preview](publishing.md).

The assistant is a [Claude Managed Agent](cma-agent.md). On a server without one, the panel says so.

## Using it

1. The assistant is the **Chat** side of the left column, and is what opens first. **Details** and **Design** sit beside it. An unsent message stays when you switch. The Chat switch shows a number when proposals are waiting for you.
   Type what you want in the message box and send it with the **send** button (or Enter; Shift+Enter adds a line). While a reply is being written the button becomes **Stop**: what you said is kept, the thread notes that the reply was stopped, and you carry on. The conversation is about the item on screen.
   To give it something to write from, use the **paperclip** in the box:
   - **Attach a file:** PDF, Word (`.docx`), Markdown or text, up to 10 MB. You can also drop files onto the box.
   - **Add a link:** a public web page. Pasting only an address into an empty box does the same.
   - **Paste text:** at least 40 characters. A paste over 1,500 characters becomes a source by itself.

   A conversation holds up to ten sources, added at any point, and you can send them with or without a message. If one cannot be read, you are told why and nothing is sent. Text is kept up to 200,000 characters from a file or 40,000 from a web page; a cut source says so. A scanned PDF has no text to read, and a password-protected one cannot be opened.
2. Tick **Post**, **Article** or both, then send. The draft appears on the canvas and fills in when the agent saves it. The first draft is checked against a rubric, and a card under the reply says whether it passed.
3. Reply to ask for changes. The assistant writes into the draft; it becomes a [version](workspace.md) when you press **Save as version**.
4. A conversation keeps one post and one article: see **Post**, **Article** or **Both** above the canvas. Choosing another item in the picker opens the conversation about it.
5. Conversations are saved on the server, so they are there after a reload. **New** [starts fresh](workspace.md). The bin deletes the open conversation and starts fresh; the post or article it wrote is kept.
6. The conversation's name at the top of Chat opens the list in place; choosing one returns to it. **History** lists conversations by Today, Last 7 days and Earlier, with the post or article each is about and, when a real assistant reports it, its cost at list price; older ones load as you scroll to the end, and search looks through titles, messages and source names. **Notes** shows what the assistant remembers about the brand, and you can remove any of it.
7. If the assistant can no longer continue a conversation on its side, a new session is started from your saved messages and sources, and the reply says so.

## A short reply

While the assistant works, the thread shows the step it is on. It then answers with a sentence or two, up to four points, a question when it needs you and at most one suggestion. Its running commentary is not shown or kept. If it gives no such answer, you see the last thing it said, cut short.

## What a reply keeps

Under a reply, a card shows:

- the check result of a first draft, with what was wrong if it did not pass;
- **What it did**, the steps it took, folded.

A reply that fails is kept too, with the reason; what it had changed can still be saved or undone. A stopped one says **Stopped**. All of it is there when the conversation is opened again. Conversations from before this show what was stored then.

## Options, saving and undo

When there is a choice to make (three titles, two card headlines), the reply shows it as radio buttons, or a drop-down when there are more than four, with the recommended one first. The same options appear under the field in Details.

- Any text on the card can be offered: headline, eyebrow, subtitle, tag, the two footers, quote author and number. Where leaving it off is a choice, **None** is one of the options. You can also just say "remove the eyebrow": only what you name is cleared, even if you typed it yourself. An empty footer shows your brand's handle or website; hiding the footer is set under **Design**.
- **Picking** one shows it on the canvas at once, marked **Previewing. Not saved.**
- **Save as version** puts the picked options into the item and saves it as a version. No model is called, so it costs nothing.
- **Keep as is** drops the preview.
- **Undo** puts the item back as it was before that reply. Only the latest change to an item can be undone, and not after you have edited it.

A change you neither save nor undo stays in the draft, and the next reply builds on it. What you type yourself is kept as a version before the assistant changes it. A published item cannot be saved to or undone until you bring it back to draft.

## Proposals from an outside agent

An AI agent connected through [MCP](mcp.md) can leave a proposal here too. It appears as its own conversation marked **Outside agent**, and the Chat switch shows how many are waiting. **Approve and use** copies it into a draft (a draft that already has text is left alone and a new one is made), **Edit** changes it first, and **Reject** dismisses it. To change one, ask that agent to send a revised version.

## Reading a web address safely

The server fetches the page for you, which could be abused to make it reach private things (a cloud metadata service, your router, `localhost`). So it only reads the public web:

- only `http` and `https`, on ports 80 and 443; no `user:password@` addresses;
- the address actually connected to is checked **after** DNS, for every connection, **including each redirect** (up to 5). Private, loopback, link-local (such as `169.254.169.254`), carrier-grade NAT, multicast and reserved ranges are refused, in IPv4 and IPv6, including IPv4 written as IPv6 and names like `0x7f000001`. A hostname that points to a private address, or changes its answer between lookups, is refused too;
- environment proxies are ignored, 20 seconds total, at most 2 MB read, only HTML or plain text, and at most 40,000 characters of text kept (the chat says when a page was cut short);
- the page's text is passed to the agent as **source data, kept apart from your messages**. Instructions written inside an article ("ignore the above and publish this") are just text: the agent has no way to publish, you decide what is kept, and publishing stays your step.

## Reading a page that needs JavaScript or a login

These pages have no readable text for the server, so it says so. Paste the text instead.

## How it works

| Piece | Where |
|---|---|
| The agent boundary: `Client` interface, proposal validation | `internal/agent` |
| The Claude Managed Agent adapter | `internal/cma` |
| URL fetching and the safety checks | `internal/source` |
| Conversations, messages, proposals, approval rules | `internal/service/chat.go` |
| Endpoints under `/api/v1/chat`, replies streamed as server-sent events | `internal/api/api.go` |
| Tables `conversations`, `chat_messages`, `proposals` | `internal/store/migrations/0005_chat.sql` |
| The panel, the cards, the hook | `web/src/components/studio/ChatPanel.tsx`, `ProposalCard.tsx`, `web/src/lib/useChat.ts` |

A proposal is validated before it is stored: the kind must be `post` or `article`, the text must fit (3,000 characters for a post including the hashtag line), hashtags must be plain words, and only the content fields are read, so a `layout` or `publish` field in an agent's answer is ignored. An invalid proposal is shown as an error and never stored or applied.

## API

| Request | Purpose |
|---|---|
| `POST /api/v1/chat/conversations` | `{"profileId", "url"}` or `{"profileId", "text"}` |
| `GET /api/v1/chat/conversations?profileId=` | The list, and which agent is answering |
| `GET /api/v1/chat/conversations/{id}` / `DELETE` | One conversation with its messages and proposals / delete it |
| `POST /api/v1/chat/conversations/{id}/messages` | `{"content", "write": ["post","article"], "viewing"}`. Streams `user`, `progress`, `delta` (only a note when a session was restarted), `proposal`, `message`, then `done` (or `error`). An empty message sends waiting sources. Only one reply at a time per conversation. |
| `POST /api/v1/chat/proposals/{id}/decision` | `{"status": "approved"\|"rejected", "draftId", "edited": {…}}` |
