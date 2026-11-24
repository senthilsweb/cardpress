# Design

See `docs/accounts.md` for the behaviour and `docs/data-model.md` for the tables. This records the decisions.

## Decisions
1. **Roles:** Admin, Editor, Writer, held one per row in `user_roles`. A person may do what any of their roles allows.
2. **Default role:** Editor (`CARDPRESS_DEFAULT_ROLE`, or `writer`). Workspaces are separate, so an editor can only publish through accounts they connected themselves.
3. **Sign-up:** open, on a link from the centred sign-in page. `CARDPRESS_SIGNUP=closed` turns it off after the first account. `CARDPRESS_ADMIN_EMAIL` limits who may create the first one.
4. **No login-free mode.** Even on localhost nothing opens until the first account exists; the first-run page is the admin sign-up.
5. **A writer's work** is approved and published by an admin, who sees everything. An editor approves their own.
6. **Isolation by one rule in one place.** Every route is declared in a table with the scope it names and the permission it needs. Another person's thing answers `404`, a thing of theirs that their role forbids answers `403`. A test walks the whole table as a second person.
7. **Passwords:** at least 10 characters, argon2id, no composition rules. Sign-in is rate-limited. No email, so an admin or the command line resets a password.
8. **Date of birth** is collected, optional, and visible only to the person and admins.
9. **API keys.** A key belongs to a person and acts as them within its scope. One scope for now, `editor` (write, approve, publish, social accounts), always capped by what the person may do, and never an admin: an admin's key reaches only the admin's own brands. Stored as a SHA-256 hash with a short prefix for the list; shown once; at most 20 per person; revoked at once; a disabled person's keys stop. A key cannot make keys, change the password or details, or manage people. MCP tools check brand ownership against the key's person.
10. **MCP over HTTP needs a key or the token** once any account exists (it works outside any one workspace). `cardpress mcp` over stdio is a local process and is unchanged.
11. **Versions** (see `2026-11-28-editor-and-versions`).

## Things learned while building
- A second person's first brand cannot be called "personal" (the id is taken), so the app creates it under a unique id when the first attempt is refused.
- Preferences became per person; system-wide keys such as the brand that environment credentials belong to stay global.
- `ReplaceDesigns` used to delete every design; it now replaces only the caller's own.
