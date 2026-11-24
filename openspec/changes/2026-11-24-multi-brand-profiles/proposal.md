# Multiple brands (profiles)

## Why
CardPress has one profile: a name, handle, logo, fonts and colours that every card, draft and post uses. Someone who writes for more than one brand (a personal account, a company page, a client) has to export and import profiles to switch. The database already keys drafts, designs, publish jobs and conversations by `profile_id`, so the data model is ready; the screen and the credentials are not.

## What changes
- A **brand switcher** in the header: list, create, rename, duplicate and delete brands. The open brand decides the card, the drafts, the queue and the assistant conversations.
- **Per-brand credentials.** Social credentials are global today. Each brand gets its own LinkedIn (and later X and Instagram) connection, stored encrypted, with the environment-variable override scoped to a brand.
- **Per-brand publishing.** A job publishes with the credentials of its brand; the queue shows only that brand's jobs, with an "all brands" view.
- **MCP and the assistant** act on one brand at a time: `list_profiles` already exists, and proposals are created under a named brand.
- A migration that moves today's credentials onto the existing single profile, so nothing is lost.

## Out of scope
User accounts and sign-in (there is still one shared token), teams, roles, and sharing a brand between people. Those are a separate change.

## Open points
- Whether a brand can reuse another brand's colour sets and fonts (a shared "theme") or each keeps its own copy.
- The deletion rule: whether deleting a brand with scheduled posts is refused or cancels them first.
- The URL shape: `/studio/` with the brand remembered on the server, or `/studio/<brand>/`.
