# A grid of posts and articles

**Status:** proposed; the owner asked for it on 2026-11-25. Nothing is built.

## Why
The Library lists items one under another, with actions hidden inside each opened row. There is no way to compare, sort or act on many items.

## What changes
- The Library gets a **Grid** view (a data table) beside today's **List**; the choice is remembered and Grid is the default on wide screens.
- Sort by column, search, filter by brand, type and status, and choose which columns show.
- Each row has a menu: **View**, **Edit** (opens the editor), **Schedule**, **Back to draft**, **Delete**.
- Select rows to delete several at once.
- **View** opens the right drawer: the card, the text and the record. A published item is shown read-only.

## Rules that stay
- A person sees their own brands; an admin sees all. Actions follow the role.
- Delete always asks first. A waiting post must be cancelled before it can be deleted.
- Published items cannot be edited; **Back to draft** is the way to change one.

## Out of scope
Editing cells in the grid, export, saved views.
