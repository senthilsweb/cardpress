# Tasks

## Bolt 1: data
- [x] Confirm the decisions in `design.md`
- [x] Migration `0007_brands.sql`: per-brand credentials, `archived_at`
- [x] `Settings.Resolve` and the credential routes take a profile id; the environment override applies to the first brand only
- [x] Per-brand profile endpoints: create (blank or copy), save, reorder, archive, restore, delete
- [x] Publisher and scheduler resolve credentials by the job's profile
- [x] Tests: isolation between brands, migration, deletion rules, environment override

## Bolt 2: interface
- [x] Brand switcher in the header; remember the open brand
- [x] New brand and Manage brands drawers
- [x] Profile tab renamed Brand; Social accounts, queue and assistant follow the open brand
- [x] Publish confirmation names the brand and the LinkedIn account; disabled without a connection

## Bolt 3: agents and docs
- [ ] MCP and chat name the brand; audit records it
- [ ] Docs (workspace, publishing, social accounts, reference) and the demo
