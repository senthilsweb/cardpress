# Library and account menu

## Why
Everything that was posted, scheduled or drafted lives in small lists inside the Post tab: the queue shows five items, drafts sit in a picker, and a published post can only be reached while its job is in the queue. There is no place to look back at what went out, when, and what LinkedIn answered. The header also keeps growing: Social accounts and the theme toggle sit beside the Assistant, and sign-in is coming.

## What the code already does
- `publish_jobs` keeps the text, hashtags, image, UTC timestamps, post id and link of every post; `publish_attempts` keeps what LinkedIn answered on each try.
- `drafts` keeps posts and articles per brand, with `updated_at`.
- A published job is no longer offered for removal in the queue, so the record stays.
- There is no list across them, no search, and no way to see an article that was never published.

## What changes
1. **Account menu.** A fixed footer at the bottom of the left sidebar shows the open brand (avatar, name, handle). Clicking it opens a menu upward with the navigation links. **Social accounts** and the **theme** toggle move there from the header. It is also where sign-in will go.
2. **Library page** at `/library/`: a newest-first list of posts and articles, like a blog index, with thumbnail, title, date, excerpt, status and the LinkedIn link. Search, and filters for kind and status. Published posts open to their full record, including each try with LinkedIn.
3. **One list endpoint**, `GET /api/v1/library`, that merges published, scheduled and failed posts with drafts.

## Out of scope
Sign-in and users (the footer is built to show a user later), publishing articles, X and Instagram, editing a published post, analytics on a post.

## Decisions to confirm
See `design.md`, "Decisions".
