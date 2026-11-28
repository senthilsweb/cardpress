# Tasks

## Bolt 1: accounts and sessions
- [x] Migration 0011: `users`, `user_roles`, `sessions`, `user_preferences`; argon2id; sign-up, sign-in, sign-out, `me`, change password
- [x] The first account becomes admin and adopts today's brands, drafts and settings
- [x] Sign-in rate limiting; sessions end on password change or disabling
- [x] The bearer token keeps working as an admin; MCP over HTTP needs it once accounts exist
- [x] `cardpress user reset-password <email>`

## Bolt 2: ownership and roles
- [x] `owner_id`, `created_by`, `approved_by`; per-person preferences
- [x] A route table with a rule for every route; lists filtered by what the person may see
- [x] The role matrix enforced (approve, publish, social accounts, users); only a draft can be deleted
- [x] The isolation test over every route, and the role test

## Bolt 3: screens
- [x] `/login` and `/signup` (centred); every app page redirects to the first-run admin sign-up until an account exists
- [x] Account menu: name and role, Account settings, Users, Sign out
- [x] Account settings (names, phone, date of birth drop-downs, change password) and Users drawer
- [x] Role-aware screens (a writer has no Approve, Publish, Schedule, page or Social accounts controls)

## Bolt 4: finish
- [x] Docs: accounts and roles, configuration, data model, deployment
- [x] Who wrote and approved an item, shown in the library
- [x] Phone-width check of the new screens (emulated at 390 px in Chrome, 2026-11-27)
- [ ] Re-record the demo

## Bolt 5: API keys
- [x] Migration 0013: `api_keys` (hash only, prefix, scope, last used, revoked)
- [x] Create (secret shown once), list, revoke; at most 20 per person; scope `editor`
- [x] A key acts as its person within its scope, never as an admin; it cannot make keys or change the account
- [x] `/mcp` accepts a key and every MCP tool stays inside the key's person's brands; the JSON API accepts a key too
- [x] Account settings, API keys tab
- [x] `scripts/seed-test-users`: one account per role for testing
