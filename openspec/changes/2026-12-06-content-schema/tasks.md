# Tasks
Studio side (plan step 4, no redeploy)
- [x] Agent project: Zod models, `npm run schema` generating JSON Schema, tool inputs and rubric limits; tests that standards are never looser
- [x] Copy the generated files into the studio; Go loads and checks the schema; MCP tool schemas compared in a test
- [x] Migration for audience, topic, campaign and review notes, with versions, API and the message blocks

The screens that show and edit these fields are step 5 (`2026-12-08-studio-clarity`).

Agent side (plan step 7, redeploy)
- [ ] Skills and rubrics use the generated files; `headline` naming in tools; contract and manifest version 6
- [ ] Redeploy agents and update the manifest on Fly (ask first)
