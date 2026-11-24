# Design

## Account menu
The sidebar (380 px, with the Design, Text, Post and Brand tabs) gets a footer that never scrolls away:

```
┌──────────────────────────┐   click the footer
│ Design Text Post Brand   │   ┌──────────────────────┐
│ ...tab content...        │   │ Library              │
│                          │   │ Social accounts      │
│                          │   │ Manage brands        │
│                          │   │ ──────────────────── │
│                          │   │ Theme        ☾ Dark  │
│                          │   │ Docs ↗               │
├──────────────────────────┤   └──────────────────────┘
│ (ST) Senthilnathan   ⌃   │
└──────────────────────────┘
```

- The footer shows the open brand today: initials in the brand colour, name, handle. With sign-in it shows the person, with the brand beneath.
- The menu is a popover that opens upward, closes on Esc or an outside click, and is fully keyboard-reachable.
- The header keeps the sidebar toggle, the name, the brand switcher and the Assistant. The gear and the theme toggle leave it.
- Library opens `/library/`; Social accounts and Manage brands open the same right drawers as now. They are not changed.
- When the sidebar is hidden the footer is hidden with it, so a small avatar button appears at the left of the header and opens the same menu.
- On a narrow screen the sidebar sits above the canvas, and the footer stays at the bottom of the sidebar.

## Library page
A new static page, `/library/`, a React island like the editor, using the same boot, theme and brand code. It has the same account menu in a left rail, so moving between the editor and the library keeps its place.

```
 Library                                   [ search…            ]
 Posts and articles for Personal           Kind: All ▾  Status: All ▾
 ───────────────────────────────────────────────────────────────────
 [thumb]  Many questions, one SQL row                 Published
          Post · 24 Nov 2026, 12:43 · View on LinkedIn ↗
          An AI function that works row by row…
 ───────────────────────────────────────────────────────────────────
 [thumb]  Bank statements to cash flow insight        Draft
          Article · edited 22 Nov 2026
          From PDF statements to a clean pipeline…
 ───────────────────────────────────────────────────────────────────
                              Load more
```

- One flat list, newest first, no year grouping (like the blog index it follows). Thirty rows at a time, then **Load more**.
- A row shows: thumbnail (the posted image; a drafts shows the card's colours), title, kind, date, status, an excerpt, and the LinkedIn link for a published post.
- Status values: Published, Scheduled, Failed, Check LinkedIn, Draft. Filters: kind (all, posts, articles) and status.
- Search looks in the text of posts and drafts.
- **A published post** opens in place: the full text and hashtags as sent, the image, created, scheduled and posted times, the LinkedIn post id, each try with LinkedIn (the same Details as the queue), and **Delete record** with a confirmation that says the post stays on LinkedIn.
- **A draft** opens in the editor (`/studio/?draft=<id>`) in its brand.
- The brand shown is the open one; an **All brands** switch lists every brand, each row labelled.

## Endpoint
`GET /api/v1/library?profileId=&scope=brand|all&kind=post|article&status=&q=&before=&limit=`

```json
{ "items": [{ "type": "job|draft", "id": "…", "profileId": "…", "kind": "post|article", "status": "published",
              "title": "…", "excerpt": "…", "at": "2026-11-24T17:43:50Z", "postUrl": "…", "draftId": "…" }],
  "next": "<cursor or empty>" }
```

- A draft that has a job is shown once, as the job, so a post is never listed twice. A draft with no job is a Draft.
- `at` is when it was posted, else scheduled, else created for a job, and last edited for a draft. The list is sorted by it, newest first, and `before` is the keyset cursor.
- The title is the first line of the text (a post) or the first heading or line (an article), cut at 80 characters. The excerpt is the next 160. They are computed from the saved text, not stored, so there is no migration.
- The list is merged in memory for one brand at a time. That is fine for the thousands of rows one person produces; it is not a design for a shared server with many users.
- Nothing here sends or changes a post. Delete record uses the existing `DELETE /publish/jobs/{id}`.

## Decisions
1. **The header after the move.** Recommended: sidebar toggle, name, brand switcher, Assistant. Everything else goes in the menu.
2. **Hidden sidebar.** Recommended: an avatar button in the header opens the same menu. The alternative is no menu while the sidebar is hidden.
3. **Delete record.** Recommended: allowed from the Library only, with a confirmation, so a stray click in the queue cannot erase what was posted. The alternative is never deletable except by deleting the brand.
4. **Drafts in the list.** Recommended: shown, with a Draft status. Empty drafts (no text) are left out.
5. **Menu items.** Library, Social accounts, Manage brands, Theme, Docs. Anything else you want in it?
