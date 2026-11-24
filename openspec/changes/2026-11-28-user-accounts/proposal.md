# Sign-in, roles and separate workspaces

**Status:** Implemented. Not tested at phone width. An email service (verification, emailed reset) and single sign-on are out of scope.

## Why
CardPress had no users. Access was one shared token (or none, on localhost), so everyone who could reach the server saw every brand, every draft and every stored LinkedIn credential. To let more than one person use one server, each person needs an account, a space of their own, and a role that says what they may do.

## What changed
1. **Accounts.** First name, last name, email and a password are required; phone and date of birth (three drop-downs) are optional. The full name is made from first and last name.
2. **Nothing opens without an admin account.** Any app page except the landing page sends a visitor to **Create the admin account** until one exists, then to a centred **sign-in** page, which has a **Create an account** link. The first account becomes the admin and adopts what exists.
3. **Roles.** Admin, **Editor (the default)**, Writer. Stored one row each, so a person could hold several later; the screens give one.
   - **Editor:** writes, reviews, approves and publishes their own work.
   - **Writer:** writes drafts, brings an item back to draft, deletes their own drafts. Cannot approve or publish.
   - **Admin:** everything, on everyone's work.
4. **Separate workspaces.** Editors and writers see only their own brands and what is in them, and may make as many brands as they like; a brand is the workspace. Admins see everything.
5. **Delete rule.** Only a draft can be deleted. An approved or posted item is brought back to draft first.
6. **Who did what** is recorded on drafts (written by, approved by) and posts.
7. **Account settings** (profile and **Change password**), a **Users** panel for admins, and **Sign out**, in the account menu.
8. `cardpress user reset-password <email>`; MCP over HTTP needs the token once any account exists.

## What stays
The bearer token still works for machines and acts as an admin. Public pages stay open to everyone.

## Out of scope
Email verification and emailed password reset, single sign-on, sharing a brand between people, teams, per-brand roles, billing.
