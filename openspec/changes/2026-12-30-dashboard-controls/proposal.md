# Dashboard controls: shadcn throughout, the date range in a pop-up

**Status:** released in `v0.2.1`; deployed.

## Why
The custom dates appeared as two browser date fields on a row of their own, which took space and did not look like the
rest of the app.

## What changes
**Date range.** Pressing **Custom** opens a calendar in a pop-up at that tab; nothing below moves.

- Press a first day, then a last day; the same day twice, or one press, is a single day. **Apply** uses it; **Cancel**,
  Esc or a press outside keeps what was there.
- Two months side by side, one on a phone. Days after today cannot be pressed. At most five years.
- When a range is in use the tab shows it, such as "1 Oct – 15 Oct", and pressing it opens the calendar again.

**Controls.** The dashboard is built from the app's shadcn components:

| Part | Component |
|---|---|
| This brand / All brands, the period | Toggle group |
| Date range | Popover and calendar |
| Totals, posts, articles, assistant, lists | Card |
| Largest sessions, by brand, the chart's figures | Table |
| Buttons and links that act | Button |
| Errors, "No brand yet" | Alert |
| Loading | Skeleton |
| Show as a table | Collapsible |

The cost chart stays as it is drawn today.

New packages: `react-day-picker`, `@radix-ui/react-popover`, `@radix-ui/react-collapsible` (all MIT).

## Out of scope
The same pass over other pages; a chart library.
