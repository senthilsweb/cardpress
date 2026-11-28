# CardPress

Self-hosted studio for LinkedIn and blog social cards in my brand colours and fonts, with an authoring chat, a rich-text composer, direct LinkedIn publishing and a lightweight scheduler.

- Front end: Astro and React (`web/`). Back end: Go (`main.go`, `internal/`).
- **State: all in the database** (SQLite file, or libSQL when hosted), uploaded media included. Nothing of the work is kept in browser storage.
- Deployment: one binary with the web app embedded, run as is, in Docker or on Fly.io. Every merge to `main` is a versioned release (`changes/2026-12-28-versions`).
- The assistant writes the post and the card's words, never the look. Publishing is a deterministic, human-confirmed action; failures are corrected by a person, never retried automatically.
- The service layer is also exposed over MCP so an external agent can use it.
- Every signed-in page has a header, a side bar naming each area, and the page on its own surface, in the person's colour theme (`changes/2026-12-23-shell-and-themes`). In the studio the column beside the side bar is Chat | Details | Design and the page is the canvas.
- Several brands, one open at a time, each with its own card design, drafts, social accounts and media library (`changes/2026-11-24-multi-brand-profiles`, `2026-12-21-media-library`).
- A signed-in person lands on the open brand's dashboard (`changes/2026-12-26-brand-dashboard`).
- Settings open in one large dialog (`components/ui/panel-dialog.tsx`) over the page in use, and keep their addresses under `/settings/` (`changes/2026-12-22-dialogs-and-settings`). The background picker uses the same dialog. There are no drawers. Other popups are kept to the brand switcher, the person's menu, confirmations, the schedule form, and the expanded editor and full preview. Selecting an item in the Library or Calendar opens an item pane that is part of the page.
- Accounts with the roles admin, editor and writer, and API keys for tools (`changes/2026-11-28-user-accounts`).
- Screens use the shared shadcn components; every settings form has Save, Cancel and a message (`changes/2027-01-01-settings-forms`).
- Run: `make dev`, `make build`, `make run`.
- Docs: `docs/`. Changes: `openspec/changes/<date>-<slug>/` (proposal.md, tasks.md, specs/).

## Changes
[README.md](README.md) lists every change, where it stands and what is still open.
