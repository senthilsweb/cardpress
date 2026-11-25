# CardPress

Self-hosted studio for LinkedIn and blog social cards in my brand colours and fonts, with an authoring chat, a rich-text composer, direct LinkedIn publishing and a lightweight scheduler.

- Front end: Astro and React (`web/`). Back end: Go (`main.go`, `server/`).
- **State: all in the database** (SQLite file locally, Turso/libSQL when hosted). Nothing in browser localStorage.
- Two deployment modes: (1) on-prem single binary with the web app embedded; (2) web app deployed as a Node/JS app, talking to the Go API on a separate host.
- The LLM and chat prepare content only. Publishing is a deterministic, human-confirmed action; failures are corrected by a person, never retried automatically.
- The service layer is also exposed over MCP so an external agent can use it.
- The studio layout is a header, a left column (Chat or Edit) and a canvas (Post, Article or both); new features fit into it.
- A single profile; no profile switcher.
- Settings and tool panels open in a right-hand, non-modal drawer (header in the app theme, scrolling body, frozen footer for actions), not a centred modal. Use `components/ui/drawer.tsx`.
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

UI work done alongside: workspace-panels (collapsible sidebar and sections, grid canvas). (blocked on the agent repo)
