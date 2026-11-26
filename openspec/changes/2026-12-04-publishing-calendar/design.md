# Design

- Route `/calendar/`, a full page with the same header and account menu as the Library. The calendar grid takes the whole window below the header: no studio sidebar or canvas around it.
- Data from the existing jobs and drafts: a new read `GET /api/v1/calendar?from=&to=&profileId=` returning `{at, type: job|plan, status, draftId, kind, title, brand}` in the viewer's time zone.
- Day view: the hours of one day, each item at its time. Opening a day from the month goes here.
- Every item in every view shows its time. Narrow screens use the day and week lists.
- Month view: the grid fills the height of the window, day cells growing with it; as many items as fit in a cell, then "+n". Week view: a list per day with times.
- A day's **Schedule** opens the right-hand drawer: search the approved items (as the draft picker does), time, time zone, confirm. Posts use the existing job endpoint (the browser draws the card image); articles use the planned-date endpoint.
- Selecting an item opens a drawer with its preview, **Open in studio**, and for a waiting post **Move** and **Cancel**.
- Account menu: **Calendar** below Library. Library: a calendar button on each article row, to `/calendar/?draft=<id>`.

## The page
```
┌ CardPress   Calendar ───────────────────────────────────── account ▾ ┐
│ ‹ November 2026 ›  [Today]   [Month][Week][Day]   Brand: All ▾            │
├──────┬──────┬──────┬──────┬──────┬──────┬──────────────────────────── │
│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun                        │
│ 23   │ 24   │ 25   │ 26 + │ 27   │ 28   │ 29                         │
│      │ ✓ 9:00 Post  │ ◷ 10:00 Post │ ▢ Article (planned)             │
└──────┴──────┴──────┴──────┴──────┴──────┴─────────────────────────────┘
✓ sent   ◷ waiting   ! failed or missed   ▢ planned article
```

## Not scheduled yet
A list in the right drawer ("Ready to schedule") of approved items with no date, so the calendar can be filled without leaving it.

## Access
A person sees their own brands; an admin sees all. Writers see the calendar and cannot schedule.

## The day
```
‹ Thursday 26 November ›          [Month][Week][Day]
 08:00
 09:00  🔒 Post · Our first release            sent 09:00        read-only
 10:00  ◷ Post · Eleven broken dashboards      waiting 10:00     Move · Cancel
 11:00
 All day  ▢ Article · Short data contracts     planned 14:30
```

## Published items
Selecting one opens the drawer read-only: card, text, when it was sent, who approved it and the LinkedIn link. No move, cancel or edit.
