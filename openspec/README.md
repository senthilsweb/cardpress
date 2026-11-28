# Changes: where things stand

As of 2026-11-28. Latest release, deployed: **`v0.6.0`**. "Released" means in a release or in the code deployed before versions
began (`v0.2.0`). Each change's `tasks.md` is the record; this page repeats what is open there.

## Next
Proposed on 2026-11-28; the first is built and waits for its release:
[`2027-01-06-brand-assistant-settings`](changes/2027-01-06-brand-assistant-settings/proposal.md) (tier, checks,
writing guides and a budget per brand) and [`2027-01-07-sign-in-cache`](changes/2027-01-07-sign-in-cache/proposal.md).
[`2027-01-08-plans-and-payments`](changes/2027-01-08-plans-and-payments/proposal.md) is a sketch for discussion.

The owner also has issues from basic testing to report, for a bug fix bolt.

## Decisions
| Date | Decision |
|---|---|
| 2026-11-27 | Greetings (`12-14`, `12-19`) and embeddings (`12-11`) can wait; chat and bug fixes first |
| 2026-11-28 | Posting by an agent is on hold (`12-02`): the present flow works, and publishing stays with a person |
| 2026-11-28 | The owner's remaining checks (a real phone, posts with attachments and others) are done later |

## All changes
| Change | What | Stands | Open tasks |
|---|---|---|---|
| [`2026-11-22-agent-cma-adapter`](changes/2026-11-22-agent-cma-adapter/proposal.md) | Claude Managed Agent adapter | Released |  |
| [`2026-11-22-backgrounds-and-profiles`](changes/2026-11-22-backgrounds-and-profiles/proposal.md) | Backgrounds and profiles | Released |  |
| [`2026-11-22-card-footer-and-sample`](changes/2026-11-22-card-footer-and-sample/proposal.md) | Card footer and sample card | Released |  |
| [`2026-11-22-chat-content-agent`](changes/2026-11-22-chat-content-agent/proposal.md) | Chat for content | Released | 1 |
| [`2026-11-22-composer-richtext-preview`](changes/2026-11-22-composer-richtext-preview/proposal.md) | Composer: rich text and full preview | Released |  |
| [`2026-11-22-dropin-backgrounds`](changes/2026-11-22-dropin-backgrounds/proposal.md) | Drop-in backgrounds | Released |  |
| [`2026-11-22-linkedin-publish-schedule`](changes/2026-11-22-linkedin-publish-schedule/proposal.md) | LinkedIn publish and schedule | Released | 2 |
| [`2026-11-22-logo-line-and-fonts`](changes/2026-11-22-logo-line-and-fonts/proposal.md) | Logo small line and per-element fonts | Released |  |
| [`2026-11-22-mcp-server`](changes/2026-11-22-mcp-server/proposal.md) | MCP server | Released | 2 |
| [`2026-11-22-server-foundation`](changes/2026-11-22-server-foundation/proposal.md) | Server foundation | Released | 2 |
| [`2026-11-22-social-settings`](changes/2026-11-22-social-settings/proposal.md) | Social settings | Released | 2 |
| [`2026-11-22-standard-theme-palettes`](changes/2026-11-22-standard-theme-palettes/proposal.md) | Standard theme palettes | Released |  |
| [`2026-11-22-studio-scaffold`](changes/2026-11-22-studio-scaffold/proposal.md) | Studio scaffold | Released |  |
| [`2026-11-22-workspace-panels`](changes/2026-11-22-workspace-panels/proposal.md) | Workspace panels | Released | 1 |
| [`2026-11-24-multi-brand-profiles`](changes/2026-11-24-multi-brand-profiles/proposal.md) | Multiple brands (profiles) | Released | 2 |
| [`2026-11-25-library-and-account-menu`](changes/2026-11-25-library-and-account-menu/proposal.md) | Library and account menu | Released | 1 |
| [`2026-11-26-content-workflow`](changes/2026-11-26-content-workflow/proposal.md) | Content workflow: draft, approve, publish | Released | 1 |
| [`2026-11-27-public-pages`](changes/2026-11-27-public-pages/proposal.md) | Public pages for articles and posts | Released | 1 |
| [`2026-11-28-editor-and-versions`](changes/2026-11-28-editor-and-versions/proposal.md) | A better long-article editor, and version history | Released |  |
| [`2026-11-28-user-accounts`](changes/2026-11-28-user-accounts/proposal.md) | Sign-in, roles and separate workspaces | Released | 1 |
| [`2026-11-29-editor-text-not-saved`](changes/2026-11-29-editor-text-not-saved/proposal.md) | Issue: typed text was never saved | Released |  |
| [`2026-11-29-linkedin-test-connection-issue`](changes/2026-11-29-linkedin-test-connection-issue/proposal.md) | Issue: LinkedIn "Test connection" rejects the Client ID and secret on the deployed server | Released | 3 |
| [`2026-11-30-linkedin-attachments`](changes/2026-11-30-linkedin-attachments/proposal.md) | LinkedIn attachments: your own image, several images, a document, a video | Released | 12 |
| [`2026-12-01-opentelemetry`](changes/2026-12-01-opentelemetry/proposal.md) | OpenTelemetry: traces, metrics and logs over OTLP | Released | 3 |
| [`2026-12-02-conversational-designer`](changes/2026-12-02-conversational-designer/proposal.md) | Conversational designer: the assistant writes the card's words and the post, and can post | Part released; agent posting on hold | 12 |
| [`2026-12-03-chat-workspace`](changes/2026-12-03-chat-workspace/proposal.md) | Chat workspace: talk on the left, see the post and the article | Part released; change lines in `v0.5.0` | 1 |
| [`2026-12-04-publishing-calendar`](changes/2026-12-04-publishing-calendar/proposal.md) | Publishing calendar | Released |  |
| [`2026-12-05-versions-and-publish-lock`](changes/2026-12-05-versions-and-publish-lock/proposal.md) | Versions of every change, and published items stay published | Released |  |
| [`2026-12-06-content-schema`](changes/2026-12-06-content-schema/proposal.md) | Content fields: one schema for the studio and the agents | Released |  |
| [`2026-12-07-assistant-choices`](changes/2026-12-07-assistant-choices/proposal.md) | Choosing options, and saving a reply as a version | Released |  |
| [`2026-12-08-studio-clarity`](changes/2026-12-08-studio-clarity/proposal.md) | A clearer studio: navigation and one place per item | Released | 1 |
| [`2026-12-09-content-grid`](changes/2026-12-09-content-grid/proposal.md) | A grid of posts and articles | Released | 1 |
| [`2026-12-10-chat-history`](changes/2026-12-10-chat-history/proposal.md) | The whole conversation, reopened | Released |  |
| [`2026-12-11-content-embeddings`](changes/2026-12-11-content-embeddings/proposal.md) | Published posts and articles as vector embeddings | Proposed; deferred | 6 |
| [`2026-12-12-chat-reply-summary`](changes/2026-12-12-chat-reply-summary/proposal.md) | Chat: a short reply instead of the agent's running text | Released |  |
| [`2026-12-13-background-categories`](changes/2026-12-13-background-categories/proposal.md) | Background categories and seasonal greetings | Released |  |
| [`2026-12-14-greetings-and-picker`](changes/2026-12-14-greetings-and-picker/proposal.md) | Greeting texts and a template picker | Part released; deferred | 5 |
| [`2026-12-15-user-guide`](changes/2026-12-15-user-guide/proposal.md) | User guide | Released |  |
| [`2026-12-16-chat-answer-buttons`](changes/2026-12-16-chat-answer-buttons/proposal.md) | Answer buttons for the assistant's questions | `v0.5.0`, agents applied; paid test open | 1 |
| [`2026-12-19-greeting-layouts`](changes/2026-12-19-greeting-layouts/proposal.md) | Greeting layouts | Part released; deferred | 4 |
| [`2026-12-20-pluggable-ornaments`](changes/2026-12-20-pluggable-ornaments/proposal.md) | Pluggable ornaments | `v0.4.0` |  |
| [`2026-12-21-media-library`](changes/2026-12-21-media-library/proposal.md) | Media library, per brand | `v0.2.1`, `v0.3.0` |  |
| [`2026-12-22-dialogs-and-settings`](changes/2026-12-22-dialogs-and-settings/proposal.md) | One dialog design, and settings in a dialog | Released |  |
| [`2026-12-23-shell-and-themes`](changes/2026-12-23-shell-and-themes/proposal.md) | A header, a labelled side bar, and colour themes | Released | 1 |
| [`2026-12-24-preview-and-about`](changes/2026-12-24-preview-and-about/proposal.md) | Preview from the canvas, "see less", and About | `v0.2.0` |  |
| [`2026-12-25-brand-details`](changes/2026-12-25-brand-details/proposal.md) | Brand details: who the brand is | `v0.2.0` |  |
| [`2026-12-26-brand-dashboard`](changes/2026-12-26-brand-dashboard/proposal.md) | A dashboard for each brand | `v0.2.0` |  |
| [`2026-12-28-versions`](changes/2026-12-28-versions/proposal.md) | A version for every merge | `v0.2.0` | 1 |
| [`2026-12-29-dashboard-totals`](changes/2026-12-29-dashboard-totals/proposal.md) | Dashboard totals and a date range | `v0.2.1` |  |
| [`2026-12-30-dashboard-controls`](changes/2026-12-30-dashboard-controls/proposal.md) | Dashboard controls: shadcn throughout, the date range in a pop-up | `v0.2.1` |  |
| [`2026-12-31-controls-and-media-pages`](changes/2026-12-31-controls-and-media-pages/proposal.md) | Consistent controls, Add user at the top, Media in pages | `v0.2.1` |  |
| [`2027-01-01-settings-forms`](changes/2027-01-01-settings-forms/proposal.md) | A first brand of one's own, and settings forms that save the same way | `v0.3.0` |  |
| [`2027-01-02-pictures-shown`](changes/2027-01-02-pictures-shown/proposal.md) | An added picture is seen | `v0.4.0` |  |
| [`2027-01-03-greeting-readability`](changes/2027-01-03-greeting-readability/proposal.md) | Greeting cards: words that fit, art that shows | `v0.4.1` |  |
| [`2027-01-04-screen-fixes`](changes/2027-01-04-screen-fixes/proposal.md) | Screen fixes: phones, unsaved settings, greeting footers | `v0.5.0` |  |
| [`2027-01-05-security`](changes/2027-01-05-security/proposal.md) | Security: sessions, browser storage, sign-up settings, hardening | `v0.6.0` |  |
| [`2027-01-06-brand-assistant-settings`](changes/2027-01-06-brand-assistant-settings/proposal.md) | Assistant settings for each brand: tier, checks, writing guides and a budget | Built, not released | paid checks, release |
| [`2027-01-07-sign-in-cache`](changes/2027-01-07-sign-in-cache/proposal.md) | Sign-in kept in memory, and the prompt cache measured | Being built: bolt 1 of 2 done | 1 bolt |
| [`2027-01-08-plans-and-payments`](changes/2027-01-08-plans-and-payments/proposal.md) | Plans and payments | Sketch for discussion | |

## Open tasks
Older items include checks against real accounts that cost money or post publicly: ask before running them.

### `2026-11-22-chat-content-agent`
- Try the fetcher on more real sites (pages needing JavaScript return a clear "no readable text" message)

### `2026-11-22-linkedin-publish-schedule`
- Verify the escaped character list and the `{hashtag|\#|tag}` template against LinkedIn's current documentation, and that hashtags and underscores display correctly
- Decide how to refresh LinkedIn tokens (they expire in about 60 days); for now a failed publish shows the reason

### `2026-11-22-mcp-server`
- Try it from a real MCP client application (only protocol-level clients were used here)
- A screen in the app to read the audit trail (for now: the API and the table)

### `2026-11-22-server-foundation`
- libSQL connection test (needs a Turso database)
- Run against a real Turso database (not yet run)

### `2026-11-22-social-settings`
- (Test connection now says which value LinkedIn refused; seen: `invalid_client_id` with HTTP 400. A valid answer is still unconfirmed.) Confirm a valid token's introspection response (`active`, `expires_at`, `scope`) with a real LinkedIn app; only a fake server has produced that shape so far
- Confirm the LinkedIn endpoint and scope names against LinkedIn's current documentation

### `2026-11-22-workspace-panels`
- Check the layout on a phone-width screen on a real device (only the desktop width was exercised)

### `2026-11-24-multi-brand-profiles`
- MCP and chat name the brand; audit records it
- Docs (workspace, publishing, social accounts, reference) and the demo

### `2026-11-25-library-and-account-menu`
- Re-record the demo with the account menu (deferred: not part of this change)

### `2026-11-26-content-workflow`
- Re-record the demo (deferred: not part of this change)

### `2026-11-27-public-pages`
- Re-record the demo (deferred: not part of this change)

### `2026-11-28-user-accounts`
- Re-record the demo

### `2026-11-29-linkedin-test-connection-issue`
- Reproduce on the deployed server and read the error code now shown
- Confirm the introspection request and client authentication against LinkedIn's documentation
- Confirm a real post goes out with only the token and the author URN

### `2026-11-30-linkedin-attachments`
- Confirm against LinkedIn's documentation: the upload calls, post payloads, size and count limits for image, multi-image, document and video
- Data model: an attachment kind on a draft and a job; job files as references to `doc_blobs`; migration
- One real post
- Not done: the picture is kept in the draft row, not in `doc_blobs` (that comes with documents); the version history does not record it; the library and the public page still show the card
- One real post
- Not done, and different from the proposal: the PDF is held in memory and kept in the draft and job rows (hence the 20 MB limit), not streamed and not in `doc_blobs`. The page count is not checked. Only PDF is accepted. The post is created without waiting for LinkedIn to process the document (a member token cannot read the status); whether LinkedIn accepts that is unknown until a real post
- One real post
- Not done: reordering is by arrows, not by dragging; the version history does not record the pictures; the library and the public page still show the card
- Memory check: the largest allowed video on a 256 MB machine (by design one part is held; not measured)
- A real public video address, and one real post
- Not done: the waiting for processing is inside the "publishing" state, not a job state of its own; duration is not checked; no thumbnail or captions; the library shows no picture for a video job
- Not done: video length, image dimensions and aspect ratio are not checked; publishing to these networks is not built

### `2026-12-01-opentelemetry`
- Run the collector (needs Docker)
- See them in the Arize project
- Memory with telemetry on, on a 256 MB machine

### `2026-12-02-conversational-designer`
- Job changes publish to it (the studio still checks jobs on its own)
- (on hold) API key scope `agent`, accepted on `/mcp` only; `editor` unchanged (migration: `api_keys.scope` has a check that allows only `editor`)
- (on hold) `PUT /api/v1/drafts/{id}/card` and the browser upload after a save or a draft event
- (on hold) Tool `publish_post`: scope, card check, approve if needed, create and run the job, daily limit
- (on hold) Pinned test: the new method list and tool list; server instructions rewritten
- (on hold) Run for real against LinkedIn from an MCP client (ask the owner before each real post)
- Per-person vault and agent key, created on first chat
- (on hold) Recorded changes per reply; `requires_action` and `user.tool_confirmation` (with `publish_post`)
- (on hold) Chat events `evaluation`, `confirm`; `POST /chat/conversations/{id}/confirm`; the Post / Cancel card
- Try it against the real account (ask first: it costs money)
- (on hold) `openspec/project.md`: add that the assistant may post with confirmation, once that is built
- Bug fix: the coordinator says publishing is done by the person (agent repository; needs an apply)

### `2026-12-03-chat-workspace`
- Try a mounted PDF with a managed session (ask first: it costs money)

### `2026-12-08-studio-clarity`
- New screenshots in the docs

### `2026-12-09-content-grid`
- Audience, topic and campaign columns once the content schema adds them

### `2026-12-11-content-embeddings`
Deferred (owner, 2026-11-27).
- Settings and start-up checks (model, dimension, key; off by default)
- An embeddings migration (the next free number); libSQL vector index at start-up; one store function for nearest passages on both databases
- Voyage client (documents and queries), passage splitting, background worker with retry and catch-up
- Hooks after a post is published and after an article page is published; `cardpress embed --all`
- Tests: same results from SQLite and a libSQL server for a small fixture; replace on republish; removed on back to draft and on delete; nothing sent when off
- Docs: configuration, data model, privacy note; one paid run against Voyage (ask first)

### `2026-12-14-greetings-and-picker`
Deferred (owner, 2026-11-27).
- Greetings table, seed, service with cache, API
- Settings → Greetings; add from the picker
- `list_greetings` tool
- Tests, docs, browser check
- Deploy

### `2026-12-16-chat-answer-buttons`
- One paid test

### `2026-12-19-greeting-layouts`
Deferred (owner, 2026-11-27).
- Side art, Framed, Headline only
- Art sets for Diwali, New Year, Lunar New Year
- Templates in the picker
- Tests, browser check at every size, deploy

### `2026-12-23-shell-and-themes`
- New guide pictures

### `2026-12-28-versions`
- Look at the version in About CardPress on a deployed app
