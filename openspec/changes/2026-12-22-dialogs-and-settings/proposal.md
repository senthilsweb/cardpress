# One dialog design, and settings in a dialog

**Status:** in progress (asked for by the owner on 2026-11-26, with a reference picture; started 2026-11-27). The shared dialog and the background picker are built, not deployed. Settings are not moved yet.

## Why
Popups differ from one another, and settings are separate pages that leave the work behind.

## The dialog
```
┌ Title ─────────────────────────────────────────────────────── ✕ ┐
│ [ Search      ⌘K ] │ Page heading                    [ Action ] │
│                    │ One line saying what this page is          │
│ GROUP              │ Tab one   Tab two                          │
│  ▸ Item   (picked) │ [ Search the list ]        [ Export ] [ + ]│
│  ▸ Item            │ ┌ Name ──────────┬ Access ──┬ Status ────┐ │
│ GROUP              │ │ …              │ …        │ …          │ │
│  ▸ Item            │ └────────────────┴──────────┴────────────┘ │
│                    │                          [ Cancel ] [Save] │
└────────────────────┴────────────────────────────────────────────┘
```
- One shared component: large (up to 1200 × 90% of the window), title bar with close, left column with search and grouped
  items with icons, right pane with heading, sub-line, optional tabs and actions, and a fixed footer when there is
  something to save.
- Escape and the close button leave; unsaved changes ask first. One dialog at a time: a second choice (a file, a
  confirmation inside it) replaces the pane, it does not stack.
- Full screen on a phone, the left column becoming a drop-down.
- Small confirmations and short forms stay small.

## Settings
| Group | Pages |
|---|---|
| Me | Account, Appearance (new, see `2026-12-23-shell-and-themes`), API keys |
| Brand | Brands, Brand look, Social accounts, Media |
| Administration | Users, Assistant |

- Settings open over the page in use and close back to it.
- Addresses stay (`/settings/social/` opens the dialog on that page), so links, the user guide and bookmarks work.
- The brand editor keeps its live card preview inside the pane.
- Pages a role may not see are not listed.

## Moved to the dialog design
Background picker (already close: heading per category and a footer), ornament picker, media picker, settings.

## Replaces
In `openspec/project.md`: "Settings are pages … not drawers" and the short list of allowed popups, once built.
