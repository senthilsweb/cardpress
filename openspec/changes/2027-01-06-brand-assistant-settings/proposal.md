# Assistant settings for each brand: models, checks, writing guides and a budget

**Status:** proposed by the owner on 2026-11-28; waiting for the owner's go-ahead on the decisions below.

## Asked for
1. Choose the model of the coordinator and of each writer, per brand. An administrator may pick a stronger one.
2. Switch the grader on or off, and set how many times it may send a draft back (3 today).
3. A brand's own writing instructions that replace ours, written in the app. Only the variable part is theirs; the
   fixed part stays ours. Guard against prompt injection.
4. A budget per brand, an alert at a threshold, and a stop when it is used up. All brands share one API key, so the
   app counts from the cost it already records.
5. Start with Markdown authoring and a preview. Upload of a skill as a zip, with a validator, comes later.
6. Everything from Settings, in the present dialog.
7. Anything else that belongs with this.

(Sign-in caching is [`2027-01-07-sign-in-cache`](../2027-01-07-sign-in-cache/proposal.md); payments are
[`2027-01-08-plans-and-payments`](../2027-01-08-plans-and-payments/proposal.md).)

## Found on `v0.6.0`
| Area | Now |
|---|---|
| Models | Fixed in each agent's file: coordinator, post writer and greetings writer on Haiku 5.5, article writer on Sonnet 5.5. One set of agents serves every brand |
| Grader | The app sends the rubric and `max_iterations: 3` with each graded request, from the manifest. Not settable |
| Writing instructions | One `house-style.md` per skill, the same for every brand. A brand's saved notes are the only brand text the agents see |
| Budget | `CARDPRESS_AGENT_BUDGET_CENTS` (200) per conversation, the same for all. No limit per brand or per month |
| Cost | Recorded per reply in `chat_usage`; a brand's total is on the dashboard |
| Who may chat | With the real agent, administrators only: its tools act as one account |
| Markdown | No Markdown editor, preview or sanitiser in the app |

A limit of the platform shapes the design: a session may replace the **coordinator's** model for itself, but writers
attached to the coordinator always run as they were created. A different writer model therefore needs a different
writer agent.

## What changes
- **Settings → Brand → Assistant**, for administrators: models, checks, budget, and the writing guides.
- **Models.** One choice each for the coordinator, the post writer, the article writer and the greetings writer, from
  a list the server allows (Haiku 5.5, Sonnet 5.5, Opus 5.5; more by configuration). The coordinator's choice is sent
  with the session. For a writer, the app makes a copy of our writer agent with the chosen model, once per choice,
  and reuses it for every brand that chooses the same.
- **Checks.** On or off, and 1 to 5 rounds. Off: the first draft is not graded.
- **Writing guides.** One per kind (posts, articles, greetings), in Markdown, with a preview and a history. A brand's
  guide replaces our house style for that kind in full. Our fixed part (the record format, limits, tools and safety
  rules) is not editable and is shown read-only. The writer reads the guide as data through a new tool, and the
  grader's style lines are replaced by the guide.
- **Budget.** A monthly amount per brand and an alert percentage (80 by default). At the alert the chat and the
  dashboard say so. At the amount the chat refuses new requests until the month ends or the amount is raised; a
  request in progress is stopped by the session's own cap. A monthly amount for the whole server works the same way.
- **Also** (item 7): the settings in use are recorded with each conversation and cost is shown by model; every change
  to these settings goes in the security log; "Use defaults" on every part; a model that is no longer allowed falls
  back to ours; the coordinator's "Posting" instructions are corrected in the same agent release.

## Decisions for the owner
1. **Writer models through copies of our agents**, made by the app. The other way is a fixed set of tiers built in
   the agent repository, which cannot give a choice per writer.
2. **Guides are read as data through a tool**, not uploaded as real skills. It needs no agent per brand, a saved guide
   is used by the next conversation, and the text has less authority than an instruction. Real skills and zip upload
   come later, on the same copies as decision 1.
3. **Who edits:** administrators for everything; the brand's owner may also edit the guides.
4. **A model check of a guide when it is saved** (Haiku, a fraction of a cent, not counted against the brand), on top
   of the fixed rules. Recommended; it can be left out.
5. **Budget month:** the calendar month in UTC. A brand with no amount has no limit of its own.

## Not in this change
Zip upload and real skills per brand; effort levels; the grader's own model (the platform chooses it); e-mail alerts
(there is no mail); chat for people who are not administrators; payments.
