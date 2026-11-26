# Design

- Route `/calendar/`, a full page with the same header and account menu as the Library. The calendar grid takes the whole window below the header: no studio sidebar or canvas around it.
- Data from the existing jobs and drafts: a new read `GET /api/v1/calendar?from=&to=&profileId=` returning `{at, type: job|plan, status, draftId, kind, title, brand}` in the viewer's time zone.
- Month view: the grid fills the height of the window, day cells growing with it; as many items as fit in a cell, then "+n". Week view: a list per day with times. Narrow screens: the week list only.
- A day's **Schedule** opens the right-hand drawer: search the approved items (as the draft picker does), time, time zone, confirm. Posts use the existing job endpoint (the browser draws the card image); articles use the planned-date endpoint.
- Selecting an item opens a drawer with its preview, **Open in studio**, and for a waiting post **Move** and **Cancel**.
- Account menu: **Calendar** below Library. Library: a calendar button on each article row, to `/calendar/?draft=<id>`.

## The page
```
┌ CardPress   Calendar ───────────────────────────────────── account ▾ ┐
│ ‹ November 2026 ›  [Today]   [Month][Week]   Brand: All ▾            │
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
