# Design

- Route `/calendar/`, in the frame of `2026-12-08-studio-clarity`: Calendar on the rail. The secondary list holds the brand filter, a small month and Ready to schedule. The calendar fills the rest of the window.
- Data from the existing jobs and drafts: a new read `GET /api/v1/calendar?from=&to=&profileId=` returning `{at, timeZone, type: job|plan, status, draftId, kind, title, brand}`. `at` is UTC; the page shows it in the viewer's time zone, and the item pane also shows the item's own zone when it differs.
- Day view: the hours of one day, each item at its time. Opening a day from the month goes here.
- Every item in every view shows its time. Narrow screens use the day and week lists.
- Month view: the grid fills the height of the window, day cells growing with it; as many items as fit in a cell, then "+n". Week view: a list per day with times.
- A day's **Schedule** opens the small schedule popup: search the approved items (as the draft picker does), time, time zone, confirm. Dragging an item from Ready to schedule onto a day opens the same popup with that day set. Posts use the existing job endpoint (the browser draws the card image); articles use the planned-date endpoint.
- Selecting an item opens the item pane beside the calendar (part of the page, not over it): its preview, **Open in studio**, and for a waiting post **Move** and **Cancel**.
- Library: **Schedule** in each row's menu, to `/calendar/?draft=<id>`.

## The page
```
┌ (rail) │ (secondary: brands, month, Ready to schedule) │ Calendar ────────┐
│ ‹ November 2026 ›  [Today]   [Month][Week][Day]                        │
├──────┬──────┬──────┬──────┬──────┬──────┬──────────────────────────── │
│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun                        │
│ 23   │ 24   │ 25   │ 26 + │ 27   │ 28   │ 29                         │
│      │ ✓ 9:00 Post  │ ◷ 10:00 Post │ ▢ Article (planned)             │
└──────┴──────┴──────┴──────┴──────┴──────┴─────────────────────────────┘
✓ sent   ◷ waiting   ! failed or missed   ▢ planned article
```

## Not scheduled yet
A list in the secondary column ("Ready to schedule") of approved items with no date, so the calendar can be filled without leaving it.

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
Selecting one opens the item pane read-only: card, text, when it was sent, who approved it and the LinkedIn link. No move, cancel or edit.
