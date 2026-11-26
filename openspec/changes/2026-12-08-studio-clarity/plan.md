# Order of work

Each step is shown on a local copy first. A pull request follows the owner's confirmation.

| Step | Change | Needs agent redeploy |
|---|---|---|
| 0 | Start fresh with New (built, on `feature/start-fresh`) | no |
| 1 | Full-page calendar with day view (`2026-12-04-publishing-calendar`) | no |
| 2 | Grid of posts and articles (`2026-12-09-content-grid`) | no |
| 3 | The whole conversation, reopened (`2026-12-10-chat-history`) | no |
| 4 | Content schema and new fields (`2026-12-06-content-schema`) | yes |
| 5 | A clearer studio (`2026-12-08-studio-clarity`), which draws Details from the schema | no |
| 6 | Choosing options with live preview (`2026-12-07-assistant-choices`) | yes |
| 7 | Published items as embeddings (`2026-12-11-content-embeddings`), ahead of search | no |

Steps 0 to 2 can go out together as the first pull request. Step 7 depends only on publishing and can move earlier; with the schema in place it also embeds topic and audience.
