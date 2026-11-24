# Multiple brands (profiles)

**Status:** Bolts 1 and 2 implemented. Bolt 3 is open: MCP and chat name the brand, the audit records it, and the demo is re-recorded.

## Why
CardPress has one profile: a name, handle, logo, fonts and colours that every card, draft and post uses. Someone who writes for more than one brand (a personal account, a company page, a client) has to export and import profiles to switch, and the one LinkedIn connection posts as one account.

## What the code already does
- `profiles` holds many rows in order, and `GET /state` returns all of them. `designs`, `drafts`, `publish_jobs` and `conversations` are already keyed by `profile_id`.
- The screen uses only `profiles[0]`, and the legacy import keeps one profile.
- **Social credentials are global**: `credentials (network, field)`, and the environment override `CARDPRESS_<NETWORK>_<FIELD>` is global too. A second brand would post with the first brand's LinkedIn token.
- `PUT /profiles` replaces the whole list, so removing a brand removes its row without looking at its jobs or drafts.
- Preferences (theme, layout) are global, which stays right.

## What changes
1. **Per-brand credentials** (database change, see `design.md`).
2. **Per-brand endpoints** for creating, renaming, duplicating, reordering and archiving brands, replacing the whole-list `PUT /profiles`.
3. **Publishing and the scheduler** resolve credentials by the job's brand.
4. **A brand switcher** in the header, a "New brand" drawer and a "Manage brands" drawer; Social accounts, the queue and the assistant follow the open brand. The publish confirmation names the brand and the LinkedIn account it will post as.
5. **MCP and chat** act on a named brand.

## Out of scope
User accounts, sign-in, teams, roles and sharing a brand between people (there is still one shared token). Multi-user is a separate change.

## Decisions to confirm
See `design.md`, "Decisions".
