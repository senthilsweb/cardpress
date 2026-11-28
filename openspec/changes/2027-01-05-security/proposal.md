# Security: sessions, browser storage, sign-up settings and hardening

**Status:** proposed by the owner on 2026-11-28; 5 of 7 bolts built and tested; not released.

## Asked for
1. Passwords protected where they are stored.
2. A sign-in that ends after a time without use, set by configuration (20 minutes by default).
3. Nothing in the browser's local storage, including the theme. Preferences come after sign-in and follow changes.
4. An administrator can close sign-up from a Security page under Administration.
5. Any other related security.

## Found on `v0.5.0`
| Area | Now |
|---|---|
| Passwords | Already hashed with argon2id, a salt per password (the four live accounts checked) |
| Sessions | 14 days, extended by use; no limit without use shorter than that |
| Browser storage | Theme, view choices and column choices in `localStorage`; a typed API token in `sessionStorage` |
| Sign-up | Closed only by `CARDPRESS_SIGNUP`, with a restart |
| Behind a proxy | Failed sign-ins are counted by the proxy's address, so one stranger's failures count for everyone |
| Headers | No content security policy or frame protection on the app |

## What changes
- **Passwords stay hashed, not encrypted.** A hash cannot be turned back into the password, even with the server's key.
  New passwords that are common or contain the person's e-mail name are refused. Older, cheaper hashes are renewed at
  sign-in.
- **Sessions end** after 20 minutes without use and 12 hours in all, both settable. The app warns before it signs
  someone out. Background refreshes do not count as use.
- **No browser storage.** Preferences are saved with the person on the server. A small cookie holds only the colours,
  so the first paint is right.
- **Settings → Security** (administrators): sign-up open or closed, the role of a new person, session times, password
  length, sign-in limits, sign out everyone, and a security log.
- **Hardening:** the real client address behind a proxy, security headers, no caching of API answers, a limit on sign-ups.

## Not in this change
Two-factor sign-in, sign-in with another provider, password reset by e-mail (there is no mail), expiry of API keys.
