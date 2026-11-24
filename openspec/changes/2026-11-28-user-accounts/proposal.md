# Sign-in, roles and separate workspaces

**Status:** Proposed. Not started. Two readings are marked "To confirm" in `design.md`.

## Why
CardPress has no users. Access is one shared token (or none, on localhost), so everyone who can reach the server sees every brand, every draft and every stored LinkedIn credential. To let more than one person use one server, each person needs their own account, their own space, and a role that says what they may do.

## What changes
1. **Accounts.** A person signs up with **first name, last name, email and a password**. Phone and date of birth are optional. The full name is made from first and last name. Date of birth is picked from three drop-downs.
2. **A centred sign-in page** with a **Create an account** option, and the same style of page for sign-up.
3. **Three roles:** **Admin**, **Editor**, **Writer**.
4. **Separate workspaces.** Editors and writers see only what they authored. A person may create as many brands ("workspaces") as they like, and each brand keeps its own posts, cards, drafts and social accounts. Admins see everything.
5. **Who did what.** Drafts, approvals and posts record the person.
6. **Profile and Users screens** in the right-hand drawer, and a **Sign out**.

## What stays
- The bearer token stays for machines (MCP, scripts) and acts as an admin.
- Public pages (`/articles`, `/posts`) stay open to everyone.
- Local use on `127.0.0.1` with no accounts stays free of any login until the first account is created.
- A brand is the workspace: no new concept is added.

## Out of scope
Email verification and emailed password reset (there is no mail service), single sign-on, sharing a brand between people, teams, per-brand roles, billing.

## Decisions
See `design.md`, "Decisions".
