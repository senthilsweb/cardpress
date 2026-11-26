# Library

The **Library** is the list of everything you have posted, scheduled and drafted, newest first, like a blog index. Open it from **Library** in the navigation, or go to `/library/`. Its panel's **Posts** and **Articles** narrow the list (`/library/?kind=post`); the drop-downs above the list do the same and also choose a status.

## Grid and List

The library shows as a **Grid** (a table, the default on wide screens) or a **List**. The choice is remembered in this browser.

- **Sort:** click a column heading (Title, Type, Status, When, Brand). Click again to reverse the order. Dates start with the newest.
- **Columns:** shows or hides Type, Status, When, Brand (with All brands), Written by, Approved by, Version, Planned, Public page and LinkedIn.
- **The row menu (⋯):**
  - **View** opens the item beside the grid, read-only when it has been sent or is waiting.
  - **Edit** opens it in the studio.
  - **Schedule…** (an approved post) or **Plan a date…** (an approved article).
  - **Back to draft** (an approved item).
  - **Delete.**
- **Select rows** with the boxes, then **Delete** them together.
  - Only rows that can be deleted can be ticked. A draft must be back in draft first, and a scheduled post must be cancelled first.
  - The confirmation says what goes. Deleting a sent post removes its record here; the post stays on LinkedIn.
  - Each row is deleted on its own, with the same checks as a single delete, and the result says which could not be.

## The list

Each row shows a small image: the card that was posted, or for a draft its own card drawn from the design saved with it (a plain frame if it has none, or a design too large to list), a status, the kind (post or article), the date, a title and the start of the text. A published post also links to LinkedIn.

| Status | Meaning |
|---|---|
| Draft | Written but not approved |
| Approved | Marked final. A post can now be published or scheduled. An article may have a planned date. |
| Scheduled, Published, Failed, Missed, Check LinkedIn | The state of the post sent from it; see [Publishing](publishing.md) |

An item with a live [public page](public-pages.md) shows a **Page** badge and a link to it. A draft that became a post is listed once, as the post. Empty drafts are left out. The title is the one you gave an article, else the first line; a long first paragraph is cut at a word and the rest becomes the excerpt.

**Paging is done by the server.** The list shows 10, 20 or 50 rows a page (your choice is remembered), with numbered pages, previous and next, and the total ("1–10 of 16"). Search looks through the title, the whole text and the hashtags; the filters are brand (or **All brands**), posts or articles, and status. Changing a filter goes back to the first page.

## An item in full

Click a row to open it in place.

- **A draft or article** shows its **card, drawn from the design saved with it**, then the **full text** exactly as written: headings, lists, code, tables and pictures. Its buttons:
  - **Edit** opens it in the editor, in its own brand.
  - **Approve** / **Back to draft**.
  - **Schedule…** (an approved post) opens its Full preview with the schedule step, because the card image is made there.
  - **Plan a date** / **Change date** (an approved article) saves a planned date. Nothing is sent: LinkedIn has no way to receive an article, so the date is a reminder and a way to order the list.
  - **For LinkedIn** (articles) prepares the article for LinkedIn's article editor; see [the workspace](workspace.md#for-linkedin).
  - **Markdown** and **HTML** (articles) download the article, pictures included.
  - **Delete** asks twice. A draft with a post waiting to be sent cannot be edited or deleted until that post is cancelled.
- **A post that was sent** shows the card that was posted, the text and hashtags as sent, when it was created, scheduled and posted, LinkedIn's post id and link, the alt text, and each try with what LinkedIn answered. **Delete record** removes it from here after a second click; the post itself stays on LinkedIn.

## How it works

| Piece | Where |
|---|---|
| Merging posts and drafts, titles, filters, search, paging | `internal/service/library.go` |
| `GET /api/v1/library?profileId=&scope=all&kind=&status=&q=&page=&pageSize=` returns `{items, total, page, pageSize, pages}` | `internal/api/api.go` |
| The page, the list and the detail | `web/src/pages/library.astro`, `web/src/components/library/Library.tsx` |
| Reading a saved text | `web/src/components/studio/DocView.tsx` |
| The menu | `web/src/components/studio/AccountMenu.tsx` |

The list is built from the saved text each time, so nothing extra is stored. It is merged in memory one brand at a time, which suits one person's volume; a page past the end shows the last one, and a page size other than 10, 20 or 50 is refused.
