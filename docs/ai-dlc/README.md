# AI-DLC record

Backdated on 2026-11-22 (the project start) from the work done so far. These are retrospective records, not contemporaneous ones.

## Intent

Make LinkedIn and blog social cards in my own brand colours and fonts, from a single self-hosted binary, without a design tool.

## Units of work and bolts

These are the changes recorded so far, in the order they were built. Later work (the Assistant drawer, the cream and teal theme, the landing page, Docker Compose and this docs site) has no separate proposal yet.

| Unit of work | Bolt | OpenSpec change |
|---|---|---|
| Studio and cards | Scaffold: Astro and React, Go-embedded binary, Dockerfile; layouts, sizes, PNG export | [studio-scaffold](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/studio-scaffold) |
| Look | Built-in backgrounds; profiles and the brochure palettes | [backgrounds-and-profiles](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/backgrounds-and-profiles) |
| Standard theme | Cover palettes shared by every profile; saved-profile migration | [standard-theme-palettes](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/standard-theme-palettes) |
| Extensibility | Drop-in backgrounds in `card/bg/` | [dropin-backgrounds](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/dropin-backgrounds) |
| Typography | Logo small line above or below; per-element Google fonts | [logo-line-and-fonts](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/logo-line-and-fonts) |
| Card footer | Footer text at the bottom right and a sample card from a real post | [card-footer-and-sample](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/card-footer-and-sample) |
| Server | Go server, database, JSON API, token guard | [server-foundation](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/server-foundation) |
| Workspace | Sidebar hide and show, foldable sections, grid canvas | [workspace-panels](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/workspace-panels) |
| Composer | Rich-text post editor, LinkedIn text rules, full preview | [composer-richtext-preview](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/composer-richtext-preview) |
| Credentials | Encrypted social credentials and the Social accounts screen | [social-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/social-settings) |
| Publishing | Publish to LinkedIn now or later, the queue, the scheduler | [linkedin-publish-schedule](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/linkedin-publish-schedule) |
| Assistant | Chat that drafts content from an article, with proposals you approve | [chat-content-agent](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/chat-content-agent) |
| Integration | MCP server for outside agents, with an audit trail | [mcp-server](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/mcp-server) |
| Real agent | Claude Managed Agent adapter behind the same port | [agent-cma-adapter](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/agent-cma-adapter) |

## Later units of work
Recorded as each bolt completes, from 2026-11-27. The changes between the table above and this one are listed in
[openspec/README.md](https://github.com/senthilsweb/cardpress/blob/main/openspec/README.md) and are not yet recorded here.

| Unit of work | Bolt | OpenSpec change |
|---|---|---|
| Greeting cards | The words fit: the greeting block is made smaller when too tall | [greeting-readability](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-03-greeting-readability) |
| Greeting cards | Wash and Shading: a lighter wash behind the words, set by a slider | [greeting-readability](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-03-greeting-readability) |
| Greeting cards | Ornament choices directly under Background | [greeting-readability](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-03-greeting-readability) |
| Chat | Answer buttons in the studio: a question's fixed answers are pressed | [chat-answer-buttons](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2026-12-16-chat-answer-buttons) |
| Chat | The coordinator sends the fixed answers (agent repository) | [chat-answer-buttons](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2026-12-16-chat-answer-buttons) |
| Chat | Change lines: what a reply changed, with Undo and View | [chat-workspace](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2026-12-03-chat-workspace) |
| Screens | Phone screens: the full preview fits the width of the screen | [screen-fixes](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-04-screen-fixes) |
| Screens | Unsaved settings: reloading or closing the tab asks while a settings form has unsaved changes | [screen-fixes](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-04-screen-fixes) |
| Screens | Greeting footers: a greeting card's footer is a little larger and stronger | [screen-fixes](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-04-screen-fixes) |
| Assistant per brand | Settings and their page: a brand's tier, checks and budget are saved by an administrator | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
| Assistant per brand | Checks: a brand's first drafts are graded or not, with its own number of rounds | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
| Assistant per brand | Budget: a monthly amount per brand and for the server, an alert, and a stop when it is used up | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
| Assistant per brand | Tiers in the app: a brand's new conversations start on its tier's agents (manifest version 7) | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
| Assistant per brand | Tiers in the agent project: Strong and Best generated from Standard (not yet applied) | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
| Assistant per brand | Writing guides: Markdown per kind with preview, history and a check on save | [brand-assistant-settings](https://github.com/senthilsweb/cardpress/tree/main/openspec/changes/2027-01-06-brand-assistant-settings) |
