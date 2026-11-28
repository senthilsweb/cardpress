# Tasks

Bolts 1 to 4 and 6 need only CardPress. Bolts 5 and 7 change the agent repository.

## Bolt 1: the settings and their page
- [x] Migration; stored settings per brand; API (read by who sees the brand, changed by administrators); security log entries
- [x] Settings → Brand assistant: tier, checks and budget fields, Save / Cancel, Use defaults
- [x] Tests, browser check (`scripts/record-demo/check-brand-assistant.mjs`)

## Bolt 2: checks
- [x] On or off and the number of rounds, used when a graded request is built; a first draft written without a check is not graded later
- [x] Tests

## Bolt 3: budget
- [x] The server's monthly amount (stored, API, Settings → Assistant; `CARDPRESS_AGENT_MONTH_CENTS`)
- [x] Spent per brand and for the server by month, in a ledger that outlives deleted conversations and brands; refusal before a request (402); the session's cap set for each request
- [x] A reply that fails or is stopped has its cost recorded too, so it counts
- [x] Alerts at the percentage and at the amount: recorded once, a notice in the chat, the bar on the dashboard and in settings
- [x] Tests, browser check (`scripts/record-demo/check-budget.mjs`; the stand-in knows spending limits)

## Bolt 4: tiers in the app
- [x] Manifest versions 5 to 7; version 7 lists the tiers; the brand's tier chooses the agents when a session is created; the tier is kept with the conversation
- [x] The dashboard shows the tier of the largest sessions
- [x] Tests

## Bolt 5: tiers in the agent repository
- [ ] Strong and Best agents generated from the Standard ones; manifest version 7
- [ ] One real session on a stronger tier (ask first: it costs money)

## Bolt 6: writing guides in the app
- [ ] Migration; guides with versions; the fixed rules for a guide's text; API
- [ ] The editor with preview, Start from ours, History and Restore
- [ ] The model check on save (ask first before the first real call)
- [ ] Tests, browser check

## Bolt 7: the writers use the guide
- [ ] `get_writing_guide` on the MCP server; the rubric built from the fixed lines and the guide
- [ ] Agent repository: skills read the guide first; writers may call the tool; rubrics in two parts; the coordinator's "Posting" correction
- [ ] Tests; one real post with a guide (ask first)

## Bolt 8: docs
- [ ] User guide, configuration, data model, the contract (version 7), `docs/cma-agent.md`

## Release
- [ ] Deploy CardPress (ask first)
- [ ] Apply the agents and set the new manifest (ask first)
