# Assistant settings for each brand: models, checks, writing guides and a budget

**Status:** proposed by the owner on 2026-11-28; decisions taken the same day (below); being built: bolts 1 to 7 of 8 built.

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
- **Models, as tiers.** Three sets of agents are built in the agent repository: Standard (today's), Strong and
  Best. An administrator picks one set per brand. The app makes no agents of its own.

  | Tier | Coordinator | Post and greetings writers | Article writer |
  |---|---|---|---|
  | Standard | Haiku 5.5 | Haiku 5.5 | Sonnet 5.5 |
  | Strong | Sonnet 5.5 | Sonnet 5.5 | Opus 5.5 |
  | Best | Opus 5.5 | Opus 5.5 | Opus 5.5 |
- **Checks.** On or off, and 1 to 5 rounds. Off: the first draft is not graded.
- **Writing guides.** One per kind (posts, articles, greetings), in Markdown, with a preview and a history. A brand's
  guide replaces our house style for that kind in full. Our fixed part (the record format, limits, tools and safety
  rules) is not editable and is shown read-only. The writer reads the guide as data through a new tool, and the
  grader's style lines are replaced by the guide.
- **Budget.** A monthly amount per brand and an alert percentage (80 by default). At the alert the chat and the
  dashboard say so. At the amount the chat refuses new requests until the month ends or the amount is raised; a
  request in progress is stopped by the session's own cap. A monthly amount for the whole server works the same way.
- **Also** (item 7): the tier in use is recorded with each conversation and cost is shown by tier; every change
  to these settings goes in the security log; "Use defaults" on every part; a tier that is no longer offered falls
  back to Standard; the coordinator's "Posting" instructions are corrected in the same agent release.

## Decisions (owner, 2026-11-28)
1. **Tiers**, all three, built in the agent repository. Not a choice per writer.
2. **Who edits:** administrators for everything; the brand's owner may also edit the guides.
3. **A model check of a guide when it is saved**, on top of the fixed rules.
4. A plan, later, is per brand; a person on their own makes a brand for themselves.

5. **A guide is read as data through a tool**, not uploaded as a real skill per brand.
6. **One guide per kind**, with a history and Restore. Named variations with one active can come later.

Budget month, unless the owner says otherwise: the calendar month in UTC; a brand with no amount has no limit of its
own.

## Not in this change
Zip upload and real skills per brand; a model per writer; effort levels; the grader's own model (the platform chooses it); e-mail alerts
(there is no mail); chat for people who are not administrators; payments.
