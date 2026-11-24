# Design

## Data model (migration 0009)
`drafts` gains:

| Column | Type | Meaning |
|---|---|---|
| `title` | TEXT | Shown in lists. Set by the editor; if empty the first line is used |
| `design` | TEXT (JSON) | The card design, see below. `'{}'` for old drafts, which take the brand's design |
| `design_version` | INTEGER | The shape of `design`, so it can change later without guessing |
| `approved_at` | TEXT | When it was approved, empty if not |
| `scheduled_at` | TEXT | For an approved item: when it should go out (UTC), empty if not planned |
| `timezone` | TEXT | The zone the time was chosen in |

`status` becomes a small state machine:

```
 draft ──approve──▶ approved ──schedule──▶ scheduled ──(time comes)──▶ published
   ▲                   │                        │
   └──── edit ─────────┴──────── edit ──────────┘      (any change returns it to draft)
```

The sending itself stays in `publish_jobs` (the record of a trip to LinkedIn). A job can only be created from an `approved` draft, and its snapshot is taken at that moment.

### The design JSON
The TypeScript `Design` type becomes a Go struct (`service.CardDesign`) with validation, so the server rejects what the editor could not render: `layout` and `background` from fixed lists, `paletteId` a known id, numbers in range, text length limits, `fonts` by role. The JSON carries `"v": 1`. The editor and the library both render from it with the same `Card` component, so a design is never described twice.

### Images in the text
An image is a node `{"type":"image","attrs":{"src":"data:image/png;base64,…","alt":"…"}}`. The editor shrinks an image to at most 1600 px on its long side before it is stored. The document limit rises from 2 MB to 25 MB. SQLite and Turso both hold this without trouble; the limit is a guard, not a target.

## Approval
- `POST /drafts/{id}/approve` and `/unapprove`. Approving needs text, and for a post a size within LinkedIn's limit.
- `PUT /drafts/{id}` that changes the text, hashtags, alt text or design resets `status` to `draft` and clears `approved_at` and `scheduled_at`.
- `POST /publish/jobs` refuses a draft that is not `approved`. Publishing from outside (MCP) can only propose, as today.
- `POST /drafts/{id}/schedule` `{scheduledAt, timezone}` creates the job (the existing scheduler sends it) and moves the draft to `scheduled`. Cancelling moves it back to `approved`.

## Library
- `GET /library?page=&pageSize=` returns `{items, total, page, pages}`. The page size is 10, 20 or 50 (default 20). Numbered pages replace Load more.
- An item opens to its **full content** (the editor's text rendered read-only, images included) and its **card** drawn from the stored design.
- Actions: **Edit** opens the editor on that item; **Approve** / **Back to draft**; **Schedule** (an approved item, date and zone); **Delete** (a draft, with a confirmation; a posted record keeps the existing "Delete record").

## Editor
Posts stay plain text with LinkedIn's rules (no headings, optional unicode styles). Articles get the rich set: H1 to H3, bold, italic, underline, strike, inline code, code block, quote, bullet and numbered lists, link, image (upload, paste or drop), divider, table, undo and redo. The toolbar is one row that wraps on a narrow sidebar, and the editor can be expanded as it can now.

## Test content import
`scripts/import-register/`: reads a folder you give it and posts through the API, so nothing is written to the database behind the server's back.
- It reads only `linkedin-posts/<slug>/post.md` and `article-drafts/<slug>/<slug>.md` (and the images those use). Nothing else in the folder is opened.
- Markdown becomes the editor's JSON (headings, paragraphs, lists, quotes, code, images, links, bold, italic). Images are read from disk and embedded as base64.
- Each item gets a card design from the editor's own catalogue: its layout, background and colour set differ from item to item (the colour name in a file such as `…-cream-emerald-…png` is used when it matches a colour set).
- Items arrive as drafts; a few are approved. None are scheduled or sent, and the import refuses to run against a database that has LinkedIn credentials.
- Your content is not copied into this repository.

## Decisions
1. **What Publish and Schedule mean for an article.** LinkedIn has no API for articles, so CardPress cannot send one. Recommended: for an article, **Approve** marks it final and **Schedule** records the planned date (a reminder and a sort key); **Export** gives Markdown or HTML. Publishing to your own site (a Markdown file or a commit) is a later change.
2. **Page size.** Recommended: 20, with 10 and 50.
3. **Image limits.** Recommended: shrink to 1600 px, 25 MB per document.
4. **How much to import.** Recommended: about ten posts and six articles with images, a mix of draft and approved.
5. **Design for a new item.** Built: a new item starts from the brand's current design, and the brand's design follows the latest card edited in the Design tab, so a new item looks like the last one you made. A separate "reset to the brand design" was left out, since the two are the same thing.
