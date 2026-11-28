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
- [x] Strong and Best agents generated from the Standard ones; manifest version 7 (cardpress-agent, branch `feature/tiers`)
- [x] Preview of the apply: 8 agents to create, nothing else changed
- [ ] One real session on a stronger tier, after the apply (ask first: it costs money)

## Bolt 6: writing guides in the app
- [x] Migration; guides with versions (the newest 50); the fixed rules for a guide's text; API for the brand's owner and administrators
- [x] The editor with preview, Start from ours, History and Restore, Use our style
- [x] The model check on save, tested against a fake service
- [x] Tests, browser check (`scripts/record-demo/check-guides.mjs`)
- [ ] One real check of a good and a bad guide (ask first: a fraction of a cent each)

## Bolt 7: the writers use the guide
- [x] `get_writing_guide` on the MCP server; the rubric built with the brand's guide
- [x] Agent repository: skills read the guide first; writers may call the tool; style lines marked; manifest carries our styles and rules; the coordinator no longer offers to post
- [x] Tests
- [ ] One real post with a guide, after the deploy and apply (ask first)

## Bolt 8: docs
- [x] User guide, configuration, data model, MCP, the contract (version 7), `docs/cma-agent.md`

## Release
- [ ] Deploy CardPress (ask first)
- [ ] Apply the agents and set the new manifest (ask first)
