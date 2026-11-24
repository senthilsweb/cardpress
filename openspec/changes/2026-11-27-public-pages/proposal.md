# Public pages for articles and posts

## Why
An approved article or post lives only inside the studio. There is nowhere to send a person (or a social network) to read it. A link to a page that is rendered on the server, with the right tags in its HTML, lets LinkedIn, X, Slack and search engines show a proper preview and index the text.

## What changes
1. **A page per item**, served by the Go server and rendered there (no JavaScript needed to read it):
   `/articles/{slug}` and `/posts/{slug}`, with index lists at `/articles` and `/posts` (numbered pages), `/sitemap.xml` and `/robots.txt`.
2. **What a crawler sees:** a `<title>` and description, a canonical URL, Open Graph and Twitter card tags (`og:image` is the item's card), JSON-LD (`Article` or `SocialMediaPosting`), `article:published_time`, and a clean semantic body.
3. **A page is a deliberate step.** An item is public only after **Publish page** on an **approved** item. Editing it, or taking approval back, takes the page offline until it is approved and published again, so the public text is always the approved text. Nothing is public by default and no draft is ever served.
4. **The card as the preview image.** The editor renders the card to a PNG when you publish the page and the server keeps it with the item; the page serves it as `og:image` (1200×627).
5. **Slugs.** Made from the title (or the first line of a post), unique per kind, editable when publishing.
6. **No token to read.** The public routes are outside the API, so they need no token. They serve only published pages and send no scripts (a strict content-security policy).

## Out of scope
Comments, search on the public site, RSS (can follow), a theme editor for the pages, per-page analytics.

## Decisions (taken, change if you disagree)
- URLs: `/articles/{slug}` and `/posts/{slug}`.
- The server must know its public address to write absolute URLs: `CARDPRESS_PUBLIC_URL`. Without it the request's own host is used, which is right for a trial and wrong behind some proxies.
- Pictures inside an article are served as their own files (`/articles/{slug}/img/{n}`), not inlined, so a page stays small.
- A post's page shows its card, its text and its hashtags (as plain text).
