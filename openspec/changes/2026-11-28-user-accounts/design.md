# Design

## Accounts
`users` (migration 0011):

| Column | Meaning |
|---|---|
| `id` | |
| `email` | Required, unique, stored lower-case |
| `first_name`, `last_name` | Required. The **full name is derived** (`first last`), never stored |
| `phone` | Optional, free text up to 30 characters |
| `birth_date` | Optional, `YYYY-MM-DD`; a real date, not in the future |
| `password_hash` | argon2id. Never returned by any endpoint |
| `role` | `admin`, `editor` or `writer` |
| `status` | `active` or `disabled` |
| `created_at`, `last_login_at` | |

Passwords: at least 10 characters, at most 200, no composition rules (a long passphrase is better than a symbol). Email is not verified, because there is no mail service; a password is reset by an admin, or on the server with `cardpress user reset-password <email>`.

Phone and date of birth are personal data. They are shown only to the person and to admins, and never appear on public pages, in MCP, in logs or in any list an editor or writer can reach.

## Sessions
A cookie `cardpress_session` (HttpOnly, SameSite=Lax, `Secure` over https), holding a random token whose hash is stored in `sessions` (`user_id`, `expires_at`, `last_seen_at`). Fourteen days, renewed while in use. Signing out removes it; changing a password or disabling a user removes that person's other sessions. The existing cross-origin guard stays in front of every state-changing request. Sign-in is rate-limited (five failures per account and address in fifteen minutes, then a pause), and says only "email or password is wrong".

## Roles

| | Admin | Editor | Writer |
|---|---|---|---|
| Sees | every brand, draft, post and account | their own | their own |
| Creates brands (workspaces) | yes | yes, as many as they like | yes, as many as they like |
| Writes and edits drafts | yes | yes | yes |
| **Approves** | any draft | their own drafts | **no** |
| Publishes, schedules, publishes pages | yes | their own | **no** |
| Connects social accounts | any brand | their own brands | no |
| Users and roles | yes | no | no |

**To confirm (1): how a writer's work goes out.** Because a writer sees only their own work, nobody but an admin can review it. So the reading is: a writer drafts; an **admin** approves, and publishes using the brand's social accounts (an admin may open any brand's Social accounts). An editor is self-approving in their own space. If you want writers reviewed by an editor instead, editors would need to see writers' drafts, which breaks "see only your own".

## Signing up
- The login page is a centred card: email, password, **Sign in**, and a **Create an account** link. Sign-up is the same kind of page: first name, last name, email, password (shown once with a show/hide), then phone and date of birth under "Optional".
- The **first account created becomes Admin** and adopts the brands and drafts that exist today. After that, anyone may sign up (open sign-up, as asked) and gets the **default role Writer**.

**To confirm (2): the default role.** You first said Editor and then agreed to my suggestion of Writer. With separate workspaces an Editor could only publish through accounts they connected themselves, so Editor is also safe. The default is one setting, `CARDPRESS_DEFAULT_ROLE` (`writer`, the cautious value, unless you say otherwise). `CARDPRESS_SIGNUP=closed` turns self-sign-up off for a private server.

## Ownership
- `profiles.owner_id`: the person who made the brand. Existing brands belong to the first admin.
- `drafts.created_by`, `drafts.approved_by`, `publish_jobs.created_by`, `conversations.user_id`: who did it, shown in the library and the post's details.
- Preferences (theme, layout, open brand, custom fonts) become **per person**: `preferences` gains `user_id`.
- Credentials are already kept per brand, so one person's LinkedIn token is never used for another's brand. The credentials set in the environment belong to the first brand, owned by the first admin.

**One rule, one place.** Every request carries a principal (a user, or the token as an admin). A single check decides whether a principal may reach a brand, and every route goes through it: the lists (state, library, drafts, jobs, conversations) are filtered by it, and any route naming an id looks up its brand first. The scheduler is not a request and runs every user's due posts with that brand's own credentials.

## Screens
- `/login` and `/signup`: centred, one card each, short copy.
- **Account menu** (the sidebar footer): your full name and role; **Profile**, **Users** (admins only), theme, docs, **Sign out**.
- **Profile** (right drawer): names, phone, date of birth (three drop-downs), change password.
- **Users** (right drawer, admins): a list with role as a drop-down, **Disable**, **Set a new password**, and "Add a user".
- A writer does not see Approve, Publish, Schedule or Social accounts. The server refuses them too.

## API
`POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET` and `PUT /auth/me`, `PUT /auth/password`; admins: `GET` and `POST /users`, `PUT /users/{id}` (role, status), `PUT /users/{id}/password`. `GET /info` reports whether sign-in is needed and whether sign-up is open.

## Testing the isolation
The risk is a route that forgets the check. A table-driven test calls every route of the API as user B against ids that belong to user A (brand, draft, job, attempt, library, conversation, settings, page) and expects `404` for each; it fails if a new route is added that the table does not cover. A second test walks the role matrix.

## Decisions
1. Three roles: Admin, Editor, Writer. (Agreed.)
2. Open sign-up with a **Create an account** link on a centred login page. (Your change.)
3. Default self-sign-up role: Writer, configurable. **To confirm (2).**
4. A writer's work is approved and published by an admin. **To confirm (1).**
5. Password reset by an admin or the command line; no email. (Agreed.)
6. Date of birth is collected, optional, with drop-downs. (Your change.)
7. Everyone but admins sees only their own brands; a brand is the workspace.
