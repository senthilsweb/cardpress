# CardPress

Self-hosted studio for LinkedIn and blog social cards in my brand colours and fonts, with an authoring chat, a rich-text composer, direct LinkedIn publishing and a lightweight scheduler.

- Front end: Astro and React (`web/`). Back end: Go (`main.go`, `server/`).
- **State: all in the database** (SQLite file locally, Turso/libSQL when hosted). Nothing in browser localStorage.
- Two deployment modes: (1) on-prem single binary with the web app embedded; (2) web app deployed as a Node/JS app, talking to the Go API on a separate host.
- The LLM and chat prepare content only. Publishing is a deterministic, human-confirmed action; failures are corrected by a person, never retried automatically.
- The service layer is also exposed over MCP so an external agent can use it.
- Every signed-in page has a header, a side bar naming each area, and the page on its own surface, in the person's colour theme (`changes/2026-12-23-shell-and-themes`). In the studio the column beside the side bar is Chat | Details | Design and the page is the canvas.
- A single profile; no profile switcher.
- Settings open in one large dialog (`components/ui/panel-dialog.tsx`) over the page in use, and keep their addresses under `/settings/` (`changes/2026-12-22-dialogs-and-settings`). The background picker uses the same dialog. There are no drawers. Other popups are kept to the brand switcher, the person's menu, confirmations, the schedule form, and the expanded editor and full preview. Selecting an item in the Library or Calendar opens an item pane that is part of the page.
- No authentication yet. An optional shared bearer token guards non-local exposure; real auth is a later change.
- Run: `make dev`, `make build`, `make run`.
- Docs: `docs/`. Changes: `openspec/changes/<date>-<slug>/` (proposal.md, tasks.md, specs/).

## Change order
1. server-foundation
2. composer-richtext-preview
3. social-settings
4. linkedin-publish-schedule
5. chat-content-agent
6. mcp-server
7. agent-cma-adapter

UI work done alongside: workspace-panels (collapsible sidebar and sections, grid canvas).
