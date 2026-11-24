# Public pages

An approved article or post can have a **public page**: a page on your own server, rendered there, that anyone with the address can read. It carries the tags that search engines and social networks read, so a link to it shows a proper preview: the title, a description and the card as the image.

| Address | What it is |
|---|---|
| `/articles/{slug}` and `/posts/{slug}` | One page |
| `/articles` and `/posts` | A list, newest first, 20 to a page (`?page=2`) |
| `/articles/{slug}/cover.png` | The card, used as the preview image (1200 × 627) |
| `/articles/{slug}/img/{n}` | The nth picture inside an article, served as its own file |
| `/sitemap.xml`, `/robots.txt` | For crawlers |

## Publishing a page

1. **Approve** the article or post. Only an approved item can have a page.
2. Open its **Full preview** and click **Publish page…** in the *Public page* row at the bottom.
3. Optionally set the **address** (lower-case letters, digits and hyphens; by default it is made from the title, or for a post from its first line) and a **description** (otherwise the first paragraph, or for a post the text after its first line).
4. **Publish.** The editor draws the card to a PNG, and the server keeps it as the page's preview image.

**Update page** publishes again (a new card, address or description); **Take down** removes the page and keeps its address for next time. The Library marks an item that has a page and links to it.

**A page is public only on purpose.** Nothing is public by default, and no draft is ever served. The page always shows the approved text: if you change the item, or take its approval back, the page goes offline until you approve and publish again.

## What a crawler or a link preview sees

The HTML is complete without any script. In its head:

- `<title>`, `<meta name="description">`, a canonical link and `robots: index,follow,max-image-preview:large`;
- **Open Graph**: `og:type` (`article`), `og:title`, `og:description`, `og:url`, `og:site_name`, `og:image` with its width, height and alt text, and `article:published_time`, `article:modified_time` and one `article:tag` per hashtag;
- **Twitter card**: `summary_large_image` (or `summary` when there is no card image) with title, description and image;
- **JSON-LD**: an `Article`, or a `SocialMediaPosting` for a post, with headline, description, dates, image, keywords and the author from the brand.

The body is clean semantic HTML: the title as the only `h1` (a first heading in the text that repeats it is not shown twice), headings from `h2`, paragraphs, lists, quotes, code, tables and figures. Pictures are separate files with `loading="lazy"`, never inlined, so a page of a few pictures is still a few kilobytes of HTML. The preview image is `?v=<time>` stamped, so a link preview refreshes when the card changes.

## Settings

Set `CARDPRESS_PUBLIC_URL` (for example `https://example.com`) so canonical links, previews and the sitemap use your real address. Without it the request's own host is used, which is right for a trial and wrong behind a proxy that changes it. A host name that is not a valid one is never repeated into a page. `CARDPRESS_SITE_NAME` names the site in titles and previews. See [Configuration](configuration.md).

## Access and safety

- The public routes are **outside the API**, so they need no token, while the API and the editor's data stay protected. Only published pages are served, only for an item that is still approved; everything else is a `404`.
- What you wrote cannot break the page: all text is escaped, links are limited to web and mail addresses, a picture that is not an embedded image is not served, and the structured data cannot close its own script tag.
- Pages are sent with a strict content-security policy (no scripts, images from the same site only), `nosniff`, and a referrer policy. A picture is served with a sandbox policy.
- `GET` and `HEAD` only. Pages and pictures carry an `ETag`, so a crawler's second visit costs a `304`. A page can be cached for five minutes, a picture for a day.
- `robots.txt` allows the pages and keeps crawlers out of `/api/`, `/mcp`, `/studio/` and `/library/`.

Check a preview with the link-preview tool of each network after publishing; they fetch the page the way a visitor would, so the server must be reachable from the internet at `CARDPRESS_PUBLIC_URL`.

## How it works

| Piece | Where |
|---|---|
| Publishing, taking down, addresses, the live-pages reader | `internal/service/pages.go` |
| The routes, the templates, the safe renderer, the sitemap | `internal/pages/` |
| `POST` and `DELETE /api/v1/drafts/{id}/page` | `internal/api/api.go` |
| The *Public page* controls | `web/src/components/studio/PageBar.tsx` |
| Columns `slug`, `summary`, `page_at`, `cover` | migration `0010`, see [Data model](data-model.md) |
