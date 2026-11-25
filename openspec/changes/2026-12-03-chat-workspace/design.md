# Design

## Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  CardPress                                         Brand ▾         │
├────────────────────┬─────────────────────────────────────────────────┤
│ [ Chat ]  Edit     │ [ Post ● ]  Article   Both        Item ▾        │
├────────────────────┼─────────────────────────────────────────────────┤
│ Sources            │  sizes · feed preview · copy · download         │
│ (link)(report.pdf) │                                                 │
│                    │            ┌───────────────────┐                │
│ You: shorter title │            │   live preview    │                │
│ ✓ Changed title,   │            └───────────────────┘                │
│   tag     · Undo   │            Post text under the card             │
│ ✓ Article created  │                                                 │
├────────────────────┤                                                 │
│ [Post] [Article]   │                                                 │
│ + │ Message…    ➤  │                                                 │
└────────────────────┴─────────────────────────────────────────────────┘
```

### Left column (380 px unless dragged to 320–720, collapsible as today)
- A grip on its right edge resizes it; the canvas keeps at least 480 px. The width is part of the saved layout.
- Mode switch **Chat | Edit**. The mode and the view are kept in the saved layout preference.
- Chat: conversation menu (new, earlier, delete), source chips, thread, message box. Above the box, **Post** and **Article** toggles say what to write.
- Edit: the four tabs. **Write** edits the item on screen; with Both, the one last clicked.
- Account menu stays at the foot.
- The header's assistant button goes. Waiting proposals from outside agents are counted on the Chat switch.

### Canvas
- **Post:** today's canvas: sizes, All sizes, feed preview, shuffle, copy, zip, download.
- **Article:** reading view of what the public page would show: card cover, title, summary, body. Copy for LinkedIn, Full preview, and **Edit**, which opens the existing large editor. Read from the same document the editor writes; pictures shown.
- **Both:** side by side from 900 px of canvas width; not offered below it. Pressing in a side makes its item the one being worked on; the size and export bar shows when that is the post.
- While Edit is on Design, Text or Brand, the canvas shows the card of the item, also for an article.
- With Chat open, the feed preview starts on.
- A view appears when its item exists. A dot marks a view that changed while another was shown; the view does not switch by itself, except when the first item of a kind is created and nothing else is on screen.

### Item picker
Searches the brand's drafts by title, text and hashtag as the person types, newest first with matches in the name ahead, filtered to posts or articles if wanted. At most 50 rows are listed.

The search runs in the browser over the drafts the studio has already loaded. The studio loads every draft in full; with many articles that load needs paging and a server search, which is a separate change.

### Narrow screens
A bottom switch: Chat, Preview, Edit. One at a time.

## Linked drafts
`conversations` gets `post_draft_id` and `article_draft_id`.

- Starting a conversation links the post on screen, or the article if that is on screen.
- Opening a conversation shows its items.
- Choosing an item in the picker opens the latest conversation linked to it; if there is none, the chat shows an empty conversation that will link it.
- Deleting a draft clears the link. Deleting a conversation keeps its drafts.
- A conversation from an outside agent keeps its proposals and has no links until one is approved.

## Sources
Table `conversation_sources (id, conversation_id, message_id, kind, name, url, chars, truncated, text, data, created_at)`. The migration moves each conversation's single source into it.

| Kind | Added by | Stored | Limits |
|---|---|---|---|
| `url` | pasting an address | extracted text | today's fetch rules |
| `text` | **+ Text**, or pasting more than 1,500 characters | the text | 200,000 characters |
| `md` | file (`.md`, `.txt`) | the text | 10 MB file, 200,000 characters kept |
| `docx` | file | extracted text | 10 MB file; unpacked size capped against crafted archives |
| `pdf` | file | extracted text and the file | 10 MB, checked as PDF, 300 pages |

- At most 10 sources per conversation. A cut source says so.
- DOCX text is read in Go (zip and XML), no new service.
- PDF text is read in the server too (a Go library, with a time limit and a page limit), so any assistant can use it. The file is also kept, so a managed agent can be given the pages themselves later; whether that works must be tried first. A PDF with no text (a scan) is refused.
- Files are kept in the database. SQLite is the supported choice for large files; a local libSQL server refuses values over about 4.7 MB.
- `POST /chat/conversations/{id}/sources` (JSON for url and text, multipart for files), `DELETE …/sources/{sid}` for one not yet sent.

## Message box
One box for the whole chat, also before a conversation exists. Attach (paperclip) at the lower left, send (paper plane) at the lower right; while a reply is written the send button is **Stop**. Attachments are staged in the box and sent with the message; if one is refused, none is added and the box keeps its contents. Stopping cancels the request, which cancels the agent's work (a managed session is interrupted), and the thread records that the reply was stopped.

## Changes and Undo
Table `chat_changes (id, conversation_id, message_id, draft_id, before, after, created_at, undone_at)`, holding only the fields a turn changed.

- The turn's card in the thread names them: "Changed title, tag · Undo", "Article created · View".
- Undo restores `before` for each field that still equals `after`. A field the person has since changed is left, and the card says so.
- Undo does not call the agent. The next message reports the restored values in `changes`.
- A created item is not deleted by Undo. A post that was sent cannot be undone, and its card has no Undo.
- Changes are recorded from tool results, so this arrives with step 5 of the designer change. Until then the current assistant's proposals work as today.
