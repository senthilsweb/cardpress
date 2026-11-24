# Tasks

## Bolt 1: accounts and sessions
- [ ] Migration 0011: `users`, `sessions`; argon2id hashing; sign-up, sign-in, sign-out, `me`, change password
- [ ] The first account becomes admin and adopts today's brands and drafts
- [ ] Sign-in rate limiting; sessions end on password change or disabling
- [ ] The bearer token keeps working as an admin; local mode with no accounts is unchanged
- [ ] `cardpress user reset-password <email>`

## Bolt 2: ownership and roles
- [ ] `owner_id`, `created_by`, `approved_by`; per-person preferences
- [ ] One principal check on every route; lists filtered by it
- [ ] The role matrix enforced (approve, publish, social accounts, users)
- [ ] The isolation test over every route, and the role test

## Bolt 3: screens
- [ ] `/login` and `/signup` (centred), the first-run state
- [ ] Account menu: name and role, Profile, Users, Sign out
- [ ] Profile drawer (names, phone, date of birth drop-downs, password) and Users drawer
- [ ] Role-aware screens (a writer has no Approve or Publish)

## Bolt 4: finish
- [ ] Docs: accounts and roles, configuration, data model, security notes
- [ ] Who approved, shown in the library
