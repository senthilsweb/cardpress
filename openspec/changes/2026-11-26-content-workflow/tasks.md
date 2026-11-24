# Tasks

## Bolt 1: data model and approval
- [x] Migration 0009 (`title`, `design`, `design_version`, `approved_at`, `scheduled_at`, `timezone`)
- [x] `service.CardDesign` with validation, and tests
- [x] Approve, unapprove, edit-resets-approval, schedule and cancel; the publish gate; tests
- [x] `docs/data-model.md` updated

## Bolt 2: editor
- [x] Rich toolbar for articles: code, code block, divider, table, underline, strike, H1
- [x] Images: upload, paste, drop; shrink to 1600 px; stored as base64 in the text
- [x] The card design saved with the draft; "Use brand design"
- [x] Approve and the approval gate in the editor and Full preview

## Bolt 3: library
- [ ] Server-side pages with numbers and a total
- [ ] Full content and the card in the detail view
- [ ] Edit, Approve, Schedule, Delete

## Bolt 4: test content
- [ ] `scripts/import-register`: Markdown to the editor's JSON, images embedded, designs varied
- [ ] Docs for the script; nothing of the content committed

## Bolt 5: finish
- [ ] Docs: library, editor, publishing, workspace; data model complete
- [ ] Re-record the demo
