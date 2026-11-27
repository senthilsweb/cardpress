# Dashboard totals and a date range

**Status:** being built (asked for by the owner on 2026-11-27, for the release after `v0.2.0`). Extends
`2026-12-26-brand-dashboard`.

## Why
The dashboard does not say how many brands or people there are, shows cost only for what is in view, and offers four
fixed periods.

## What changes
**Totals**, a row at the top. They are the same under This brand and All brands.

| Figure | Counts | Follows the period | Who sees it |
|---|---|---|---|
| Brands | brands the person may open, without archived ones | no | everyone |
| Users | active accounts, with how many are disabled | no | admins, on a server with accounts |
| LLM cost | assistant cost in US dollars over those brands | yes | everyone |

**Date range.** 7 days, 30 days (default), 90 days, All, and **Custom** with a first and a last day, both included.
The choice is remembered in the browser. It covers:

- cost, sessions, replies, working time and largest sessions;
- posts and articles, **by the day they were created**, with their status as it is now. A post that was scheduled or
  sent counts by the day its draft was created.

**Next up** and **Recently edited** do not follow the period.

A count still opens the list behind it: the Library takes the same dates, shows them above the list, and can clear them.

**Fixed with it:** a person with no brand yet (a new account) saw "not found" on the dashboard. It now shows empty
figures and offers the studio, which starts the first brand.

## Server
- `GET /api/v1/dashboard` also takes `from` and `to` (`YYYY-MM-DD`, together, instead of `days`), at most five years
  apart. The answer gains `totals` and the `period` it covers.
- `GET /api/v1/library` takes `from`, `to` and `tz`: items created on those days.
- Users are counted only for a signed-in admin or the server token; an API key is not told.
- No migration.

## Out of scope
The cost of anything but assistant replies in CardPress (it is not an invoice); a list of users on the dashboard.
