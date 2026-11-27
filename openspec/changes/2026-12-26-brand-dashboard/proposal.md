# A dashboard for each brand

**Status:** built (agreed by the owner on 2026-11-27, with a Sign in button on the home page), not deployed.

## Why
Nothing shows how much has been written, what is waiting, or what the assistant has cost.

## What changes
`/dashboard/`, for the open brand. It becomes the page a person lands on after signing in, and where the logo leads. The
studio stays one press away in the side bar, and a link to a draft still opens the studio.

| Block | Shows |
|---|---|
| Posts | total, and by status: draft, approved, scheduled, published, failed |
| Articles | total, and by status: draft, approved, page published |
| Next up | the next five scheduled items |
| Recent | the last five edited items |
| Assistant cost | cost at list price in the period, with a bar for each day or week |
| Sessions | assistant sessions used, replies, working time, average cost for a session |
| Largest sessions | the five most costly: conversation, cost, replies, working time, date |

- **Period:** 7 days, 30 days (default), 90 days, All. Counts by status are as of now; cost and sessions follow the period.
- **All brands:** a switch showing the totals of every brand the person may see, with a row for each.
- A block with nothing yet says so and offers the next step (New post).
- Clicking a count opens the Library filtered to it; clicking a session opens its conversation.

## Data
Everything comes from what is already stored: items, publishing jobs and `chat_usage` (one row for each reply, since
migration 0020). No migration.

- **Cost** is the list price the agent service reports, in US dollars, to the cent. It is not an invoice.
- **Not counted:** work done before cost was recorded, sessions started outside CardPress (test scripts), and
  conversations that were deleted, whose rows go with them. The page says this under the figures.
- **Tokens** are not stored, so they are not shown.

## Server
`GET /api/v1/dashboard?profileId=<id>` or `?scope=all`, with `days=7|30|90|0` and `tz`, under the same access rules as the
Library. Days are counted in the person's time zone. Archived brands are not in All brands.

## Home page
On a server with accounts the public home page offers **Sign in** to someone who is not signed in.

## Out of scope
Likes, views or other figures from the networks; budgets and alerts; export.
