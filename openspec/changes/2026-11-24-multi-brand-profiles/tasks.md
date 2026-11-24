# Tasks

## Bolt 1: data
- [ ] Confirm the decisions in `design.md`
- [ ] Migration `0007_brands.sql`: per-brand credentials, `archived_at`
- [ ] `Settings.Resolve` and the credential routes take a profile id; the environment override applies to the first brand only
- [ ] Per-brand profile endpoints: create (blank or copy), save, reorder, archive, restore, delete
- [ ] Publisher and scheduler resolve credentials by the job's profile
- [ ] Tests: isolation between brands, migration, deletion rules, environment override

## Bolt 2: interface
- [ ] Brand switcher in the header; remember the open brand
- [ ] New brand and Manage brands drawers
- [ ] Profile tab renamed Brand; Social accounts, queue and assistant follow the open brand
- [ ] Publish confirmation names the brand and the LinkedIn account; disabled without a connection

## Bolt 3: agents and docs
- [ ] MCP and chat name the brand; audit records it
- [ ] Docs (workspace, publishing, social accounts, reference) and the demo
