# Social settings

## Why
Programmatic publishing needs credentials for each network, and the app has nowhere to keep them.

## What changes
- Settings open from a gear icon in the header as a **right-hand drawer** (non-modal, no scrim): header in the app's theme, networks as tabs (LinkedIn, X, Instagram), a scrolling body, and Save and Test connection frozen in a footer. It is built as a reusable `Drawer` so later tool settings can use the same pattern.
  - LinkedIn: Client ID, Client Secret, Access Token, Author URN.
  - X: API Key, API Secret, Access Token, Access Token Secret.
  - Instagram: App ID, App Secret, Long-lived Token, Business Account ID.
- Secrets are encrypted at rest (AES-GCM, key from `CARDPRESS_SECRET_KEY`) and never returned in full to the browser.
- Environment variables (`CARDPRESS_<NETWORK>_<FIELD>`) override stored values.
- Identifiers (client ID, API key, app ID, URNs, account ID) are shown in full; only secrets are masked. All fields are encrypted at rest.
- There is no separate enable switch: a network is usable when its fields are filled in. Individual stored values can be removed.
- "Test connection" works for LinkedIn (token introspection, then author URN and scope checks). X and Instagram are stored and labelled "publishing not yet supported".

## Out of scope
OAuth login flow and token refresh. The user pastes tokens for now.
