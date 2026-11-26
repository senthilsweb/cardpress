# Calendar

The **Calendar** (`/calendar/`, on the navigation bar) shows what goes out when: posts that were sent, posts waiting to be sent, posts with a problem, and articles with a planned date. It takes the whole page.

## Views

- **Month** shows six weeks around the month. A day shows up to three items, then "+n more". Click a day's number to open that day.
- **Week** shows seven days, Monday to Sunday, each with its items in time order.
- **Day** shows the hours of one day, each item at its time.
- **‹ Today ›** moves by a month, a week or a day.
- The address keeps the view and the day (`/calendar/?view=week&day=2026-11-26`), so a reload or a shared link shows the same thing.
- On a narrow screen the calendar opens on the day view.

Every item shows its time in your time zone, named at the foot of the page. Hover an item to see its own time zone as well.

| Mark | Meaning |
|---|---|
| Green, with a lock | Sent. Read-only. |
| Amber | Waiting to be sent |
| Red | Failed, missed, or needs a look on LinkedIn |
| Blue, dashed | An article's planned date. Nothing is sent to a network. |

**Brand** shows one brand or **All brands**. A person sees their own brands; an admin sees all of them.

## Opening an item

Click an item to open its page in the [Library](library.md):
- **A sent post** is read-only: its card, its text, when it went out and the link to LinkedIn.
- **A waiting post** has **Move…** (a new date, time and zone) and **Cancel post**. A cancelled post's draft stays approved, so it can be scheduled again.

## Putting something on the calendar

**Ready to schedule** lists approved posts and articles with no date. The **+** on a day, or on an hour in the day view, opens the same list with that time filled in.
- **An article** gets its planned date there.
- **A post** opens its preview in the studio. Its card is drawn there, and you confirm what goes out, as for any post. See [Publishing](publishing.md).

Writers can see the calendar but cannot schedule.

## How it works

| Part | Where |
|---|---|
| `GET /api/v1/calendar?profileId=&from=&to=` (or `scope=all`) | Posts and planned articles between two times, at most 45 days. Cancelled posts are left out |
| `GET /api/v1/calendar/ready?profileId=` | Approved items with no date |
| `internal/service/calendar.go` | Both reads, narrowed by owner and role like the library |
| `web/src/components/calendar/Calendar.tsx`, `web/src/lib/calendar.ts` | The page, and its date arithmetic (weeks start on Monday) |
