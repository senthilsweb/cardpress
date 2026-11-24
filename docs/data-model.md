# Data model

CardPress keeps everything in one database: SQLite in a file by default, or Turso (libSQL) with `CARDPRESS_DB`. The schema is made of numbered migrations in `internal/store/migrations/`, applied in order at start-up and recorded in `schema_migrations`. This page describes the schema as it is, and notes what the next change adds. **It is updated with every migration.**

## Conventions

- Ids are 16 hex characters made by the server (`newID`). A brand's id is chosen when it is created.
- Times are UTC text in RFC 3339 (`2026-11-24T17:43:50Z`); drafts keep milliseconds. Text sorts correctly, so no date type is needed.
- Structured values are JSON text (`hashtags`, `doc`, `data`, `steps`). The shape of each is below. The server validates them on the way in.
- A brand owns its rows through `profile_id`. There are no database foreign keys: the services delete a brand's rows together (see `DeleteProfile`), inside one transaction.
- Secrets are never stored in plain text: `credentials.value` is sealed with the secret key (AES-GCM, tied to its network and field).

## Relationships

```mermaid
erDiagram
    profiles ||--o| designs : "card design"
    profiles ||--o{ drafts : writes
    profiles ||--o{ credentials : "has accounts"
    profiles ||--o{ publish_jobs : posts
    profiles ||--o{ conversations : chats
    drafts ||--o{ publish_jobs : "becomes (draft_id)"
    publish_jobs ||--o{ publish_attempts : "tries"
    conversations ||--o{ chat_messages : contains
    conversations ||--o{ proposals : "proposes"
    proposals }o--o| drafts : "approved into (draft_id)"
    preferences
    mcp_audit
```

## Tables

### Brands and look

| Table | Migration | Columns |
|---|---|---|
| `profiles` | 0001, 0007, 0011 | `id` (PK), `position`, `data` (JSON: name, handle, website, logo, fonts, colour sets), `updated_at`, `archived_at` (set when a brand is archived, empty otherwise), `owner_id` (who made it; empty for brands that predate accounts, which the first account adopts) |
| `designs` | 0001 | `profile_id` (PK), `data` (JSON: the brand's current card design), `updated_at` |
| `preferences` | 0001 | `key` (PK), `value` (JSON), `updated_at`. Keys: `theme`, `layout`, `customFonts`, `activeProfile`, `envProfile` |

`envProfile` names the brand that the `CARDPRESS_<NETWORK>_<FIELD>` environment variables belong to. It is set when the first brand is saved and is never moved.

### Writing

| Table | Migration | Columns |
|---|---|---|
| `drafts` | 0002, 0009 | `id` (PK), `profile_id`, `kind` (`post` or `article`), `status` (`draft`, `approved`, `scheduled`, `published`), `doc` (JSON, the editor's rich text), `hashtags` (JSON array), `alt_text`, `unicode_styles` (0/1), `title`, `design` (JSON, the card), `design_version`, `approved_at`, `scheduled_at`, `timezone`, `slug`, `summary`, `page_at`, `cover` (BLOB), `created_by`, `approved_by` (user ids), `created_at`, `updated_at`. Indexes `(profile_id, updated_at DESC)`, `(profile_id, status, updated_at DESC)`, unique `(kind, slug)` where `slug` is set, and `(kind, page_at DESC)` for live pages |

`doc` is a TipTap/ProseMirror document: `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"}]}]}`. It is limited to 25 MB, because an article keeps its images inside its text as base64 (`{"type":"image","attrs":{"src":"data:image/png;base64,…"}}`).

### Publishing

| Table | Migration | Columns |
|---|---|---|
| `publish_jobs` | 0004 | `id` (PK), `profile_id`, `draft_id`, `network` (`linkedin`), `status`, `body`, `hashtags` (JSON), `alt_text`, `image` (BLOB, the card PNG), `scheduled_at`, `timezone`, `error`, `post_urn`, `post_url`, `created_by`, `created_at`, `updated_at`, `published_at`. Indexes `(status, scheduled_at)` and `(profile_id, created_at DESC)` |
| `publish_attempts` | 0008 | `id` (PK), `job_id`, `started_at`, `finished_at`, `outcome`, `error`, `steps` (JSON). Index `(job_id, started_at)` |
| `credentials` | 0003, 0007 | `profile_id`, `network`, `field`, `value` (sealed), `updated_at`. Primary key `(profile_id, network, field)` |

A job is a snapshot: its `body`, `hashtags`, `alt_text` and `image` are copied when it is confirmed, so editing the draft later never changes what was sent. Statuses: `scheduled`, `publishing`, `published`, `failed`, `missed`, `needs_review`, `cancelled`.

`publish_attempts.steps` is a JSON array, one entry per call to LinkedIn: `{step, method, host, path, status, headers, body, error, at, ms}`. It holds LinkedIn's answer only: never the access token, and an upload address is kept without its query (it carries a signature). `headers` keeps a short list (`X-Restli-Id`, `X-Li-Uuid`, `Retry-After`, …).

### Assistant

| Table | Migration | Columns |
|---|---|---|
| `conversations` | 0005, 0011 | `id` (PK), `user_id`, `profile_id`, `title`, `session_id`, `source_kind`, `source_url`, `source_title`, `source_text`, `source_truncated`, `created_at`, `updated_at` |
| `chat_messages` | 0005 | `id` (PK), `conversation_id`, `seq`, `role` (`user` or `assistant`), `content`, `created_at`. Unique `(conversation_id, seq)` |
| `proposals` | 0005 | `id` (PK), `conversation_id`, `message_id`, `kind`, `title`, `body`, `hashtags`, `alt_text`, `rationale`, `status` (`pending`, `approved`, `rejected`), `edited`, `original`, `draft_id`, `created_at`, `decided_at` |

### Outside agents

| Table | Migration | Columns |
|---|---|---|
| `mcp_audit` | 0006 | `id` (autoincrement), `at`, `transport`, `caller`, `tool`, `args`, `outcome` (`ok` or `error`), `detail` |

## Migration history

| No. | Adds |
|---|---|
| 0001 | `profiles`, `designs`, `preferences` |
| 0002 | `drafts` |
| 0003 | `credentials` (one set per network) |
| 0004 | `publish_jobs` |
| 0005 | `conversations`, `chat_messages`, `proposals` |
| 0006 | `mcp_audit` |
| 0007 | Brands: `credentials` keyed by brand, `profiles.archived_at`, the `envProfile` preference |
| 0008 | `publish_attempts` |
| 0009 | `drafts`: `title`, `design`, `design_version`, `approved_at`, `scheduled_at`, `timezone`; the status workflow |
| 0010 | `drafts`: `slug`, `summary`, `page_at`, `cover`; the public pages |
| 0011 | Accounts: `users`, `user_roles`, `sessions`, `user_preferences`; `profiles.owner_id`, `drafts.created_by` and `approved_by`, `publish_jobs.created_by`, `conversations.user_id` |
| 0012 | `draft_versions` and `doc_blobs`: the history of an item |
| 0013 | `api_keys`: keys for programs (MCP, scripts), scoped and revocable |

## Draft status and approval

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> approved: approve
    approved --> draft: unapprove, or any edit
    approved --> scheduled: a post is published or scheduled
    scheduled --> published: LinkedIn accepted it
    scheduled --> approved: cancelled, failed or missed
    published --> draft: edit, or unapprove
```

- Only an `approved` draft can be made into a `publish_jobs` row. The server refuses anything else (`409`), so what is approved is what goes out.
- Saving the **same** content again changes nothing; saving **different** text, hashtags, alt text, title or design returns an approved or published draft to `draft` and clears `approved_at` and `scheduled_at`.
- While a post is waiting or running (`scheduled`) the draft cannot be edited. Cancel the post first.
- The draft's status follows its job: waiting, running or "check LinkedIn" means `scheduled`; posted means `published`; failed, missed, cancelled or discarded hands it back as `approved`.
- An **article** is never sent (LinkedIn has no API for articles). Approving marks it final; `scheduled_at` holds its planned date, a reminder only, and its status stays `approved`.

### The public page columns

`slug` is the page's address within its kind (`/articles/<slug>` or `/posts/<slug>`) and is unique per kind. `page_at` is when the page went live; **empty means it is not public**. `summary` is the description for previews (empty: the first paragraph). `cover` is the card as a PNG (1200 × 627), the page's preview image, `NULL` when there is none. Only an item whose status is `approved`, `scheduled` or `published` can have a live page, and the public reader checks that again; any change to the item, or taking its approval back, clears `page_at` and `cover`. Taking a page down clears only `page_at`, so its address is kept. See [Public pages](public-pages.md).

### Accounts

| Table | Columns |
|---|---|
| `users` | `id` (PK), `email` (unique, lower-case), `first_name`, `last_name`, `phone`, `birth_date` (`YYYY-MM-DD` or empty), `password_hash` (argon2id), `status` (`active` or `disabled`), `created_at`, `last_login_at`. The full name is `first_name last_name`; it is not stored |
| `user_roles` | `user_id`, `role` (`admin`, `editor` or `writer`); primary key `(user_id, role)`. One row each today, but a person may hold several: what they may do is everything any of their roles allows |
| `sessions` | `token_hash` (PK, the hash of the cookie value), `user_id`, `created_at`, `last_seen_at`, `expires_at` |
| `user_preferences` | `(user_id, key)` (PK), `value`, `updated_at`: theme, layout, the open brand, custom fonts. System-wide keys (such as `envProfile`) stay in `preferences` |
| `api_keys` | `id` (PK), `user_id`, `name`, `prefix` (the key's first characters, to tell keys apart), `key_hash` (SHA-256 of the key; unique; **the key itself is never stored**), `scope` (`editor`), `created_at`, `last_used_at`, `revoked_at` (empty while the key works) |

A brand belongs to the person in `profiles.owner_id`, and everything keyed by `profile_id` (designs, drafts, posts, conversations, credentials) follows it. An admin sees all; anyone else sees only their own brands. See [Accounts and roles](accounts.md).

### History

`draft_versions` holds one row per saved state of an item: `draft_id`, `seq` (1, 2, 3… per item), `label` (`created`, `auto`, `manual`, `approved`, `sent`, `restored`), `note`, `kind`, `title`, `doc`, `hashtags`, `alt_text`, `unicode_styles`, `design`, `design_version`, `blobs`, `created_by`, `created_at`. Versions are taken when an item is created, approved, sent or restored, when saved by hand, and automatically after a change if ten minutes have passed since the last. At most 100 are kept per item (the oldest automatic ones go first). In a version's `doc` each picture is replaced by `blob:<hash>`; `doc_blobs` (`hash`, `mime`, `data`) holds each distinct picture once, so ten versions of an article with seven pictures store seven pictures, not seventy. Pictures no version refers to are removed.

### The design column

`drafts.design` is the card, as the typed JSON `service.CardDesign` (version in `design_version`, currently 1): `sizeId`, `layout` (`hero`, `center`, `quote`, `stat`, `split`, `cover`), `background`, `paletteId`, `seed`, `eyebrow`, `title`, `subtitle`, `footer`, `footerLeft`, `tag`, `quoteAuthor`, `statValue`, `titleScale` (0.2 to 4), `intensity` and `bottomFade` (0 to 1), `showLogo`, `showFooter`, `photos` (data URLs, at most 12), `screenshot`, `bgImage`, and `fonts` by role. The server refuses unknown fields, out-of-range numbers and unknown layouts. A draft saved without a design has none (`design_version` 0), and the editor starts it from the brand's design.

The editor and the library draw the card from this one object with the same component, so a design is never described twice. The brand's own design (`designs`) stays as the starting point for new items.

