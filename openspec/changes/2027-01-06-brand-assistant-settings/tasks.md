# Tasks

Bolts 1 to 4 and 6 need only CardPress. Bolts 5 and 7 also change the agent repository.

## Bolt 1: the settings and their page
- [ ] Migration; stored settings per brand and for the server; API for administrators; security log entries
- [ ] Settings → Brand → Assistant: models, checks and budget fields, Save / Cancel, Use defaults
- [ ] Tests, browser check

## Bolt 2: checks
- [ ] On or off and the number of rounds, used when a graded request is built
- [ ] Tests

## Bolt 3: budget
- [ ] Spent per brand and for the server by month; refusal before a request; the session's cap set for each request
- [ ] Alerts at the percentage and at the amount: recorded once, a line in the chat, the bar on the dashboard and in settings
- [ ] Tests, browser check

## Bolt 4: the coordinator's model
- [ ] The session is created with the brand's model; the models used are recorded with the conversation
- [ ] The dashboard shows the model
- [ ] Tests

## Bolt 5: the writers' models
- [ ] Agent repository: manifest version 7 with the writers' ids, versions and models
- [ ] CardPress reads versions 6 and 7; copies of agents made on save, recorded and reused; a command that lists them
- [ ] Tests with the stand-in API
- [ ] One real session on a copy (ask first: it costs money)

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
