# A clearer studio: navigation and one place per item

**Status:** revised 2026-11-25 after the owner's review. The owner accepted Chat | Details | Design and asked for a second-level navigation in place of the account popup and the right drawers. Nothing is built.

## Why
The owner finds the studio confusing. What causes it:

1. **Where things live is hidden.** Library, account settings, API keys, users, social accounts and brands sit in an account popup. Each opens a drawer over the studio, so none has its own address, and two can't be compared side by side.
2. **One item is edited in several places.** Card words are under Edit, Text; the post is under Edit, Write; the summary and address appear only when publishing.
3. **Two rows of switches** on the left (Chat | Edit, then four tabs) and two more above the canvas.
4. **Status is hidden.** Approve sits at the bottom of Write, and the only way to find what is missing is to try.
5. **Chat and item are loosely tied.** There are two New buttons, Post / Article ticks that look like the canvas switch, and replies that are blocks of text.

## What changes
- **Primary navigation:** a narrow icon rail on the far left: Studio, Library, Calendar, Settings, and at the bottom the person. No navigation along the top.
- **Secondary navigation** next to it, for the area that is open:
  - Settings: Account, Brands, Social accounts, API keys, Users, Assistant.
  - Library: views and saved filters.
  - Calendar: "Ready to schedule".
  - Studio: the Chat | Details | Design column.
- **Settings become pages** with their own addresses (`/settings/api-keys/` and so on), not drawers.
- **Few popups:** the brand switcher; the person's menu (theme, docs, sign out); confirmations; the small schedule form; the expanded editor and full preview as today. Nothing else opens over the page.
- **The studio's column, one row: Chat | Details | Design.**
  - **Details** is one form for the item on screen, built from the content schema. Every field appears once, grouped, with counters, versions and who approved it. Status and the next action stay pinned at the bottom.
  - **Design** holds today's Design tab.
- Above the canvas: the item, its status, its version, and one **New**.
- **Chat:** replies become short cards showing what was saved, the check result and any options to choose. Conversations are listed in the Chat column itself, not in a drawer.

## Rules that stay
Canvas, cards, publishing rules and roles. Old links (`/studio/?open=account` and the like) still work and land on the new pages.

## Out of scope
Public pages and the look of cards.
