# Order of work

The owner's rule: the user experience comes first. Each step is shown on a local copy first, and a pull request follows the owner's confirmation.

| Step | Change | Needs agent redeploy |
|---|---|---|
| 0 | Start fresh with New (built, on `feature/start-fresh`) | no |
| 1 | The frame: rail, secondary navigation, settings as pages (`2026-12-08-studio-clarity`, first part) | no |
| 2 | Grid of posts and articles in the Library (`2026-12-09-content-grid`) | no |
| 3 | Full-page calendar with day view (`2026-12-04-publishing-calendar`) | no |
| 4 | Typed content models in the agent project, used by the studio from a copy (`2026-12-06-content-schema`, studio side and new fields) | no |
| 5 | The studio column: Chat \| Details \| Design, Details from the models (`2026-12-08-studio-clarity`, second part) | no |
| 6 | The whole conversation, reopened, with reply cards (`2026-12-10-chat-history`) | no |
| 7 | Agents read the models; `headline` naming; contract 6 (`2026-12-06-content-schema`, agent side) | yes |
| 8 | Choosing options with live preview (`2026-12-07-assistant-choices`) | yes |
| 9 | Published items as embeddings (`2026-12-11-content-embeddings`), ahead of search | no |

- **First pull request:** steps 0 to 2, the frame with the grid in it.
- **Second:** steps 3 to 5. After them the person-facing studio is done.
- **Third:** steps 6 to 8, the assistant's side. Step 7 is one agent redeploy, and step 8 can share it.
- Step 9 depends only on publishing and can be moved earlier.
