# Library

The **Library** is the list of everything you have posted, scheduled and drafted, newest first, like a blog index. Open it from the account menu (your brand at the bottom of the sidebar), or go to `/library/`.

## What a row shows

A small image (the card that was posted; drafts show a plain icon), a status, the kind (post or article), the date, a title, and the start of the text. A published post also links to LinkedIn.

| Status | Meaning |
|---|---|
| Published | Sent to LinkedIn |
| Scheduled | Waiting for its time |
| Failed, Missed, Check LinkedIn | See [Publishing](publishing.md) |
| Draft | Written but never sent. A draft that became a post is listed once, as the post. Empty drafts are left out. |

The title is the first line of a post, or the first heading of an article. A long first paragraph is cut at a word and the rest of it becomes the excerpt.

## Finding things

Search looks through the text and hashtags. The filters are the brand (or **All brands**), posts or articles, and the status. Thirty rows load at a time; **Load more** shows the next thirty.

## A published post is a record

Click a post to see exactly what was kept: the text and hashtags as sent, when it was created, scheduled and posted, LinkedIn's post id and link, the alt text, and each try with what LinkedIn answered (see [Publishing](publishing.md)). **Delete record** removes it from here after a second click; the post itself stays on LinkedIn.

A draft opens in the editor, in its own brand, on the Post tab.

## How it works

| Piece | Where |
|---|---|
| Merging posts and drafts, titles, filters, search, paging | `internal/service/library.go` |
| `GET /api/v1/library?profileId=&scope=all&kind=&status=&q=&before=&limit=` | `internal/api/api.go` |
| The page | `web/src/pages/library.astro`, `web/src/components/library/Library.tsx` |
| The menu | `web/src/components/studio/AccountMenu.tsx` |

The list is built from the saved text each time, so nothing extra is stored. It is merged in memory one brand at a time, which suits one person's volume. `before` is a cursor, the `next` value of the previous page.
