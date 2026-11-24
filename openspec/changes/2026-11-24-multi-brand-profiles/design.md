# Design: multiple brands

## Rules that must hold
1. A post is only ever published with the credentials of the brand that owns the job.
2. Nothing silently changes brand: the open brand is always visible, and the publish confirmation names it.
3. Removing a brand never destroys scheduled posts or history without a clear confirmation.
4. Existing installations keep working: today's single profile and its credentials carry over unchanged.

## Database

One migration, `0007_brands.sql`.

### `credentials` gets a brand
`credentials` is keyed `(network, field)`. SQLite cannot change a primary key in place, so the table is rebuilt:

```sql
CREATE TABLE credentials_new (
  profile_id TEXT NOT NULL,
  network    TEXT NOT NULL,
  field      TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, network, field)
);
INSERT INTO credentials_new (profile_id, network, field, value, updated_at)
  SELECT COALESCE((SELECT id FROM profiles ORDER BY position LIMIT 1), ''), network, field, value, updated_at FROM credentials;
DROP TABLE credentials;
ALTER TABLE credentials_new RENAME TO credentials;
```

Existing credentials move to the first brand (the only one on every current installation). An installation with credentials but no profile row yet (possible before first save) gets `profile_id = ''`, which the service treats as the first brand until it exists. Values stay encrypted and are not re-encrypted.

### `profiles` can be archived
```sql
ALTER TABLE profiles ADD COLUMN archived_at TEXT;
```
Archiving hides a brand but keeps its drafts, jobs, conversations and credentials, so history and the audit trail stay intact. `State` returns only unarchived brands. A brand can be restored. Permanent deletion is a separate, explicit action that is refused while the brand has scheduled or in-flight posts.

### Unchanged
`designs` (one working design per brand), `drafts`, `publish_jobs`, `conversations` and `mcp_audit` already carry or do not need a brand. `preferences` stays global (theme, layout), plus one new key `activeProfile` to remember the last open brand.

## API

| Route | Purpose |
|---|---|
| `POST /profiles` | Create a brand: blank, or `copyFrom` another brand (identity, palettes, fonts; not credentials, drafts or jobs) |
| `PUT /profiles/{id}` | Save one brand |
| `PUT /profiles/order` | Reorder |
| `POST /profiles/{id}/archive`, `POST /profiles/{id}/restore` | Archive and restore |
| `DELETE /profiles/{id}` | Permanent delete; 409 with the reason while it has scheduled or publishing posts |
| `GET/PUT /profiles/{id}/settings/{network}`, `POST .../test` | Credentials of one brand |
| `GET /publish/jobs?profile={id}` | One brand's queue; omit for all brands |

`PUT /profiles` (replace all) and the global `/settings/...` routes stay for one release and act on the first brand, then are removed. Chat and MCP already take a profile id; `propose_content` requires one.

### Environment credentials
`CARDPRESS_<NETWORK>_<FIELD>` today overrides stored credentials. With several brands an environment override cannot be global without posting as the wrong account, so it applies to **the first brand only**, and the other brands use stored credentials. A per-brand environment syntax (`CARDPRESS_<BRAND>_<NETWORK>_<FIELD>`) is possible later.

## Interface

The overall layout does not change. Three additions and a few small changes.

### 1. Brand switcher in the header
A compact control on the right of the header, next to the Assistant button, showing the open brand's mark or initials, its name and a chevron. It opens a menu:

```
 ┌───────────────────────────┐
 │ ● Senthil Karuppaiah   ✓  │
 │ ● Zynomi                  │
 │ ● Client: Acme            │
 │ ─────────────────────────│
 │ + New brand…              │
 │ ⚙ Manage brands…         │
 └───────────────────────────┘
```
Each brand shows a dot in its accent colour. The header's own colours do not change per brand; the card canvas does.

### 2. New brand and Manage brands (right-hand drawers)
Same drawer as Social accounts and the Assistant (themed header, scrolling body, frozen footer actions).

```
 NEW BRAND                         ✕
 ───────────────────────────────────
 Brand name      [ Zynomi          ]
 Handle          [ @zynomi         ]
 Start from      (•) Blank
                 ( ) A copy of "Senthil Karuppaiah"
                     Copies identity, colours and
                     fonts. Not accounts or posts.
 ───────────────────────────────────
                       [Cancel] [Create]
```
Manage brands lists brands with drag to reorder, Duplicate, Archive, and an "Archived" section with Restore and Delete permanently.

### 3. The Profile tab becomes Brand
The tab edits the open brand (name, handle, website, logo, headshot, fonts, colour sets). Only the label changes.

### 4. Everything follows the open brand
- **Social accounts** shows "Accounts for <brand>" with the brand's chip at the top, each brand with its own connection state and token expiry.
- **Publishing queue** shows the open brand's posts, with an "All brands" toggle that adds a brand chip to each row.
- **Assistant** conversations are the open brand's, and the drawer title carries the brand name.
- **Publish confirmation** reads "Post this as **<brand>** from **<LinkedIn account>** now?", and a brand without a connected account cannot publish (the button explains why).
- **Drafts** and the working card are per brand, so switching brand switches the whole studio.

### Empty and edge states
- First run: one brand, "My brand", and no switcher menu clutter (the control still shows the name).
- A brand with no LinkedIn connection: the publish button is disabled with "Connect LinkedIn for <brand>", linking to its Social accounts.
- Archiving the open brand switches to the next one.

## Bolts
1. **Data**: migration, per-brand `Resolve`, per-brand endpoints, deletion rules, and isolation tests.
2. **Interface**: switcher, New brand, Manage brands, per-brand accounts and queue, publish confirmation.
3. **Agents and docs**: brand in MCP and chat, the docs and the demo.

## Tests that matter
- Brand A's job never reads brand B's credentials (including when B has them and A does not).
- The environment override applies to the first brand only.
- The migration carries credentials onto the first brand and leaves values readable.
- A brand with scheduled posts cannot be permanently deleted; archiving keeps its history.
- Switching brands never shows another brand's drafts, queue or conversations.

## Decisions
1. **Removal**: archive first (reversible) and permanent delete only from the archive. *Recommended.*
2. **Environment credentials**: first brand only. *Recommended.* The alternative is a per-brand environment naming scheme now.
3. **Duplicating a brand**: copies identity, colours and fonts, never credentials or posts. *Recommended.* The alternative is a shared theme several brands reuse.
4. **Where the open brand lives**: remembered on the server (`activeProfile`), URL stays `/studio/`. *Recommended.* The alternative is `/studio/<brand>/`, which allows bookmarks per brand and two tabs on two brands.
