# Preview from the canvas, "see less", and About

**Status:** built (asked for by the owner on 2026-11-27), not deployed.

## Why
- Seeing the whole post as it will be sent takes three steps: open Details, then Full preview.
- In the LinkedIn preview "…see more" opens the text and nothing closes it again.
- Nowhere in the app says which version of CardPress and of the assistant is running.

## What changes
1. **Full preview on the canvas.** A **Full preview** button on the canvas toolbar, beside Feed preview, in every column
   (Chat, Details, Design) and on a phone's Preview. It shows the item as it is now, with unsaved typing and card changes,
   and offers what Full preview offers today. The studio stays on the column it was on. Shortcut: **Ctrl/⌘ + Enter**
   when the focus is not in a text field.
2. **See more and see less.** In any feed preview (canvas and Full preview) the text opens with the network's own wording
   and closes again with **see less**. Switching items closes it.
3. **About.** **About CardPress** in the person's menu, just above Sign out, opens a small card (the owner removed a
   second entry in the side bar on 2026-11-27):

| Part | Shows |
|---|---|
| CardPress | version, build commit and date, database (SQLite or libSQL) |
| Assistant | name, connected or not, agent version, content schema version |
| Links | user guide, documentation, source code, licence (MIT) |

   A **Copy** button copies these lines for a problem report. 

## Server
`GET /api/v1/info` keeps what it says to anyone (name, version) and adds, **only to a signed-in person** (or with the
token), `build` (commit, date) and, in `agent`, `version` and `schemaVersion` from the manifest. The image build passes the
commit and date in. No ids, addresses or keys are shown.

## Out of scope
A change log in the app, update checks.
