# Tasks

## A. Layout and linked drafts (current assistant)
- [x] Migration: `conversations.post_draft_id`, `article_draft_id`; service and API
- [x] Left column: Chat / Edit switch; chat moved from the drawer; header button removed; "Post" tab renamed "Write"
- [x] Canvas: Post, Article, Both; item picker above the canvas; changed dot
- [x] Article reading view
- [x] Narrow screens: Chat, Preview, Edit
- [x] Saved layout holds mode, view and column width; resize grip
- [x] Searchable item picker
- [x] `openspec/project.md` layout line
- [x] Browser check: both themes, laptop and phone widths

## B. Sources
- [x] Migration `conversation_sources`, moving existing sources
- [x] Text, Markdown and DOCX reading with limits; PDF check
- [x] Start without a source; add sources mid-conversation
- [x] Web: **+** menu, chips, long paste, refusals
- [ ] Try a mounted PDF with a managed session (ask first: it costs money)
- [x] Docs: `docs/chat.md`, `docs/data-model.md`
- [x] One message box: attach inside it, paper plane to send, Stop while replying

## History and sessions
- [x] History drawer with search, linked items and cost; Notes tab
- [x] A lost session is restarted from the saved messages and sources
- [x] `chat_usage` and the cost on screen (filled when the managed agent reports it)

## C. Changes and Undo
## Bolt 3: change lines under a reply
- [x] The record of changes and the undo endpoint (built by `2026-12-07-assistant-choices`)
- [x] Name what a reply changed, with Undo and View; no migration (kept with the reply)
- [x] Tests, user guide, browser check
