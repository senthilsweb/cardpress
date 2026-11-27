# Accounts and roles

CardPress has accounts. Nothing in the app opens until the first one exists, and each person sees only their own work.

## First run

Open the editor, the library or any page except the landing page on a new server and you land on **Create the admin account**. That first account becomes the **admin** and takes over any brands, drafts and settings that already exist. Everyone after that signs up on the same kind of page (a link on the centred sign-in page), or an admin adds them.

> On a server reachable from the internet, whoever signs up first becomes the admin. Set `CARDPRESS_ADMIN_EMAIL` so only that address can create the first account, or create it yourself before you share the address.

## An account

| Field | |
|---|---|
| First name, last name | Required. The full name is made from them |
| Email | Required. Used to sign in; one account per email, in any case |
| Password | Required, at least 10 characters (up to 200), no other rules. A few words work well |
| Phone | Optional |
| Date of birth | Optional, picked from three drop-downs (day, month, year) |

Phone and date of birth are personal data. They are shown only to you and to admins, and never appear on public pages, over MCP, or in anything an editor or writer can list.

There is no email: nothing is verified by mail and a forgotten password is not emailed. An admin sets a new one (**Users**, **New password**), or on the server run `cardpress user reset-password <email>`, which prints a new random password and signs that person out everywhere.

## Roles

| | Admin | Editor (default) | Writer |
|---|---|---|---|
| Sees | everyone's brands, drafts and posts | their own | their own |
| Makes brands (workspaces) | yes | yes, as many as they like | yes, as many as they like |
| Writes and edits drafts, saves versions | yes | yes | yes |
| Brings an item back to draft | yes | yes | yes |
| Deletes a draft | yes | their own | their own |
| **Approves**, plans an article's date | any | their own | no |
| **Publishes**, schedules, publishes a page, removes a record | yes | their own | no |
| Connects social accounts | any brand | their own brands | no |
| Makes API keys (Editor scope) | yes | yes | yes, limited to what a writer may do |
| Users and roles | yes | no | no |

A new account is an **Editor** by default (`CARDPRESS_DEFAULT_ROLE=writer` makes it a writer). A **writer** drafts; an **admin** reviews, approves and publishes their work, and may open the brand's Social accounts to do so. An editor approves and publishes their own work.

A brand is the workspace: there is no separate concept. Each person's brands, designs, drafts, posts, conversations and social accounts are kept apart, so one person's LinkedIn credentials are never used for another's brand.

**Deleting.** Only a draft can be deleted. An approved or posted item must be **brought back to draft** first, which also takes down its public page.

**One role today, several in the data.** The screens give a person one role. The data model stores roles one per row, and a person may do whatever any of their roles allows, so more than one can be given later without a change to it.

## Signing in

A session lasts 14 days and is renewed while you use it. Signing out ends it. Changing your password signs you out on your other devices, and so does an admin setting one or disabling you. After five wrong passwords for one account, or too many from one address, sign-in pauses for 15 minutes. The message for a wrong email and a wrong password is the same.

The session is an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https). Browser requests from another site are refused. Passwords are stored as argon2id hashes; no endpoint returns one.

## From the app

**Settings** (in the navigation on the left) has **Account** (your names, phone and date of birth, and **Password**), **API keys**, and for admins **Users** (add a person, change a role, disable or enable, set a password) and **Assistant**. Your name at the bottom of the navigation opens **Sign out**. A writer does not see Approve, Publish, Schedule, Social accounts or the page controls; the server refuses them as well.

## API keys, the token and MCP

A person can make **API keys** (Settings, API keys) for programs such as an MCP client. A key acts as that person with the **Editor scope**: it can write, approve and publish on their own work, never more than the person may do, never as an admin, and never on anyone else's work. Keys are stored as hashes, shown once, and revoked at once. See [MCP](mcp.md#api-keys).

`CARDPRESS_API_TOKEN` still works for machines and scripts: a request with `Authorization: Bearer <token>` acts as an admin, with or without any account. **MCP over HTTP needs a key or the token as soon as any account exists**, because MCP works outside any one person's workspace. `cardpress mcp` over stdio runs as a process on your own machine and is not affected.

## Settings

| Variable | Default | |
|---|---|---|
| `CARDPRESS_DEFAULT_ROLE` | `editor` | The role of a person who signs up: `editor` or `writer` |
| `CARDPRESS_SIGNUP` | `open` | `closed` stops self sign-up once the first account exists; admins then add people |
| `CARDPRESS_ADMIN_EMAIL` | | If set, only this email can create the first (admin) account |

## How it works

| Piece | Where |
|---|---|
| Accounts, passwords, sessions, rate limiting | `internal/service/accounts.go`, `principal.go` |
| Who may call each route (the policy table) | `internal/api/auth.go`, `table()` in `internal/api/api.go` |
| Ownership of brands and what each list shows | `internal/service/studio.go`, `brands.go`, `library.go` |
| Sign-in and sign-up pages | `web/src/components/auth/AuthPage.tsx` |
| Settings pages | `web/src/components/settings/SettingsDialog.tsx`, with `studio/AccountSettings.tsx` and `settings/UsersSettings.tsx` |

Every route of the API is listed once in the table with the scope it names (a brand, a draft, a post, a conversation) and the permission a role must hold. A test walks the whole table as a second person against the first person's ids and expects the same answer a missing thing would get (`404`).
