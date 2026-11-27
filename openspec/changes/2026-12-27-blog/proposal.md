# A blog for published articles and posts

**Status:** proposed (asked for by the owner on 2026-11-27). Not built. Changes `2026-11-27-public-pages`.

## Why
Published pages sit under two separate plain lists. Readers expect one blog.

## Addresses
| Address | Shows |
|---|---|
| `/blog` | articles and posts together, newest first |
| `/blog?show=article` or `?show=post` | one kind |
| `/blog?page=2` | the next page |
| `/blog/article/{slug}` | an article |
| `/blog/post/{slug}` | a post |

The earlier addresses (`/articles`, `/articles/{slug}`, `/posts`, `/posts/{slug}`, with their covers and pictures) answer
with a permanent redirect, so links already shared keep working. The sitemap and canonical links use the new addresses.

## The list
- A heading with a line about the blog and the number of items.
- A switch: **All · Articles · Posts**, each with its count.
- One row for each item: the card as a thumbnail, badges for kind and brand, the date, the title and a short extract.
- **Pages are made by the server**, 12 items each, with Newer, page numbers and Older, `rel="prev"` and `rel="next"`.
  No script is needed.

## An item's page
Title, summary, author, date and reading time; the cover; the text; hashtags; for a long article, a contents list from its
headings beside the text (above it on a phone). A link back to the blog.

## Unchanged
Only an approved item whose page was published is shown. The pages send no scripts, keep their strict content policy and
carry the same tags for search engines and social previews.

## Decisions to confirm
- **Brands:** `/blog` shows every brand's published items, each labelled; `?brand=<id>` shows one. Someone who writes for
  several clients may prefer each brand's blog kept apart.
- **Pages of 12** items.

## Out of scope
Search, RSS, comments, a theme editor, custom domains for each brand.
