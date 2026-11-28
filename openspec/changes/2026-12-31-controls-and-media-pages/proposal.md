# Consistent controls, Add user at the top, Media in pages

**Status:** released in `v0.2.1`; deployed.

## Why
Drop-downs in the chat and for user roles do not look like the rest of the app. **Add a user** sits at the bottom of the
Users page, which is easy to miss and confusing. The media list sends every entry at once.

## What changes
- **Drop-downs** are the app's shadcn ones everywhere: user roles, brand type and country, time zone, date of birth.
  The two long lists, **country** and **time zone**, open with a search box; a city that has two names, such as
  Calcutta and Kolkata, is found by either.
- A long drop-down stays within the window and scrolls (its height limit did not apply).
- **Radio buttons and tick boxes** in the chat, and the other ones in the app, are shadcn too.
- **Users:** **Add user** is at the top right, with the count of people at the left. It opens a small form over the page,
  which asks before typed details are lost.
- **Media** comes in pages from the server, 12, 24 (default) or 48 at a time, with search and filters applied there.

## Server
`GET /api/v1/profiles/{id}/assets?q=&kind=&tag=&page=&pageSize=` gives one page: `items`, `total`, `page`, `pageSize`,
`pages`, and for the whole library `count`, `tags`, `usedBytes`, `limitBytes`.

New packages: `@radix-ui/react-radio-group`, `@radix-ui/react-checkbox` (MIT).

## Out of scope
The native date-and-time field for scheduling, and the colour field.
