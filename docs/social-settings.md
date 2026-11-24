# Social accounts

Open **Social accounts** from the account menu: click your brand at the bottom of the sidebar. It slides in from the right as a drawer, not a modal: nothing is dimmed or blocked, so you can keep using the studio while it is open. It holds the keys and tokens the server uses to publish, with a tab for LinkedIn, X and Instagram. **Save** and **Test connection** are frozen at the bottom and act on the selected tab. **Esc** or the close button closes it; if you have unsaved changes it asks before discarding them (a dot on a tab shows which network has some).

| Network | Fields | Status |
|---|---|---|
| LinkedIn | Client ID, Client secret, Access token, Author URN | Can be tested; publishing comes with the LinkedIn publishing change |
| X | API key, API secret, Access token, Access token secret | Stored only; publishing not yet supported |
| Instagram | App ID, App secret, Long-lived access token, Business account ID | Stored only; publishing not yet supported |

You paste the values in. There is no LinkedIn sign-in (OAuth) flow in the studio yet, and tokens are not refreshed for you: when a LinkedIn token expires (about 60 days), create a new one and enter it again.

## What the drawer does

- **Secrets are masked.** After saving, a secret shows as `••••` plus its last four characters (or only `••••` if it is short). The full value is never sent back to the browser, so it cannot be revealed later; type a new one to replace it. IDs and URNs are shown in full.
- **Save** stores only the fields you changed. **Remove** (the bin icon, click twice to confirm) deletes one stored value.
- **Test connection** (LinkedIn, enabled once every field is filled and saved) asks LinkedIn whether the access token is active and when it expires, then checks that the author URN is well formed and that the token's scopes allow posting as that author (`w_member_social` for a person, `w_organization_social` for a page). It reports valid, invalid, expired, incomplete, or "could not reach LinkedIn". When LinkedIn refuses the check it says which value it did not accept (the Client ID, the Client secret, or the access token), without repeating what you entered. The check is optional: publishing needs only the access token and the author URN. Save your changes first.

## How credentials are protected

- Each value is encrypted with AES-256-GCM before it is written to the database. The key is derived from a secret with HKDF-SHA256, every value has its own random nonce, and the network and field name are bound in, so a value cannot be copied into another field.
- **The key:**
  - `CARDPRESS_SECRET_KEY` (at least 32 characters, e.g. `openssl rand -hex 32`) is used if set. This is required with a hosted database (Turso) or when the server listens on an address other than loopback.
  - Otherwise, for a local setup (a database file and a loopback address), the server creates `data/secret.key` (mode 0600) on first start and uses that. **Back it up together with the database**: without the key the stored credentials cannot be read, and the card will say "Cannot be read – enter it again".
  - With no key at all the server still runs, but refuses to store credentials and says why. Values from environment variables still work.
- Changing the key makes existing stored credentials unreadable. They are not deleted; entering a value again replaces it.
- Responses from the API never contain a secret. They are also marked `no-store`.
- LinkedIn is called at a fixed address and redirects are never followed, so credentials are only sent where intended.

Social accounts belong to a brand, and a brand belongs to a person. Only its owner (an editor) and admins can open this screen or use the stored credentials; a writer cannot see it at all (see [Accounts and roles](accounts.md)). Anyone with the server's `CARDPRESS_API_TOKEN` acts as an admin, so keep it secret (see [Deployment](deployment.md)).

## Environment variables

A credential can come from the environment instead. An environment value overrides a stored one, is shown as "Set by environment", and cannot be changed in the screen. This suits Docker and CI.

**With several brands, environment credentials belong to the first brand only.** An environment variable is global, so applying it to every brand would make them all post as the same account. The first brand created keeps them, even if you later reorder or archive brands; every other brand uses credentials stored in the app.

| LinkedIn | X | Instagram |
|---|---|---|
| `CARDPRESS_LINKEDIN_CLIENT_ID` | `CARDPRESS_X_API_KEY` | `CARDPRESS_INSTAGRAM_APP_ID` |
| `CARDPRESS_LINKEDIN_CLIENT_SECRET` | `CARDPRESS_X_API_SECRET` | `CARDPRESS_INSTAGRAM_APP_SECRET` |
| `CARDPRESS_LINKEDIN_ACCESS_TOKEN` | `CARDPRESS_X_ACCESS_TOKEN` | `CARDPRESS_INSTAGRAM_ACCESS_TOKEN` |
| `CARDPRESS_LINKEDIN_AUTHOR_URN` | `CARDPRESS_X_ACCESS_TOKEN_SECRET` | `CARDPRESS_INSTAGRAM_BUSINESS_ACCOUNT_ID` |

## One set per brand

Credentials belong to a brand (a profile). Each brand has its own LinkedIn (and X and Instagram) connection, stored encrypted, and a post is only ever published with the credentials of the brand that owns it. A brand never falls back to another brand's token. Installations that predate brands keep their credentials on the first brand.

## API

Credentials are per brand:

| Request | Purpose |
|---|---|
| `GET /api/v1/profiles/{id}/settings` | All networks for that brand, `canStore`, and where the key comes from |
| `GET /api/v1/profiles/{id}/settings/{network}` | One network |
| `PUT /api/v1/profiles/{id}/settings/{network}` | `{"fields": {"accessToken": "…"}}`. A string stores it, `""` removes it, `null` or leaving it out keeps it |
| `POST /api/v1/profiles/{id}/settings/{network}/test` | Test connection. `501` for X and Instagram |

The older routes without a brand (`/api/v1/settings...`) act on the first brand and remain for now.

Server code: `internal/secrets` (encryption), `internal/service/settings.go`, `networks.go` and `linkedin.go`.
