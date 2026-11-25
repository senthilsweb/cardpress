# Chat workspace: talk on the left, see the post and the article

**Status:** parts A (layout and linked drafts) and B (sources and the message box) are built; Undo is not.

## Why
- The assistant is a drawer that covers part of the canvas.
- The canvas shows only the card or feed post. An article is read in the editor or the Full preview.
- A conversation takes one source, a page or pasted text, fixed at the start. It takes no files.
- A conversation is not tied to a particular post and article.

## What changes
- The left column has two modes, **Chat** and **Edit**. Chat opens first. Edit holds today's Design, Text, Write (was Post) and Brand tabs.
- The canvas shows **Post**, **Article**, or **Both** side by side.
- The item picker moves above the canvas.
- A conversation links one post and one article.
- Sources: links, long pasted text, and PDF, DOCX, Markdown or text files, any number, at any point. A conversation can also start from a topic.
- Each change the assistant makes is listed in the chat with **Undo**.

## Reverses
`openspec/project.md` says the layout is kept and new features fit into it. The header, left column and canvas stay; what the column and the canvas hold changes, and the assistant leaves the right drawer. Settings, history, accounts and saved notes stay in the right drawer.

## Considered
A third column with chat and controls side by side. Rejected: on a laptop it squeezes the canvas.

## Depends on
Part A and B work with the current assistant and need nothing from `2026-12-02-conversational-designer`; the managed agents arrive in step 5 of that change.

## Out of scope
- Sources other than the ones listed (audio, video, spreadsheets, scanned pages without text).
- More than one post or article per conversation.
- Editing text directly on the canvas.
