# Content workflow: draft, approve, publish

## Why
A post or article in CardPress is only text today. Its card design belongs to the brand, not to the item, so two posts cannot look different and a post in the library cannot show the card it was made with. There is no approval step, so anything in the editor can be published. Articles have no images or code in the editor. The library lists items but cannot edit, schedule or delete them, and it pages with "Load more" rather than numbered pages. There is also no realistic content to test any of this with.

## What the code already does
- `drafts` holds the rich text (TipTap JSON, 2 MB limit), hashtags, alt text and a `status` that is always `draft`.
- `designs` holds one card design per brand.
- `publish_jobs` is created straight from the editor's Full preview with a snapshot of the text and the PNG.
- The library lists jobs and drafts (cursor paging) and shows the record of a posted job.

## What changes
1. **The card design belongs to the item.** `drafts.design` holds a strongly typed, versioned JSON design (layout, background, colours, text, fonts). The library renders the card from it, so what you designed in the editor is what you see later. The brand's design stays as the starting point for new items.
2. **Draft, approve, publish.** A draft must be **approved** before it can be published or scheduled, and the server enforces it. Editing an approved item sends it back to draft, so what is approved is what goes out.
3. **A better editor.** Headings, lists, quotes, links, code, code blocks, dividers, tables and **images embedded in the text**, so a whole article, pictures included, lives in one database row.
4. **A library you can work in.** Server-side pages with numbers and a total, and for each item: **Edit** (opens the editor), **Approve**, **Schedule**, **Delete**, with the full content and its card shown.
5. **Real content to test with.** An import script that reads your posts and articles from a folder, converts Markdown to the editor's JSON, embeds images, and gives each item a different card design.
6. **A data model document** (`docs/data-model.md`) that is updated with every change to the schema.

## Out of scope
Publishing an article to a blog or to LinkedIn's article editor (LinkedIn has no API for articles); see the decisions. X and Instagram. Sign-in and approvers other than yourself.

## Decisions to confirm
See `design.md`, "Decisions".
