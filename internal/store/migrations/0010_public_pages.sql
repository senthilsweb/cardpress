-- A public page for an approved article or post, rendered by the server for readers, search engines and social networks.
--   slug      the page's address within its kind: /articles/<slug> or /posts/<slug>. Empty until a page is published.
--   summary   the description for search and social previews; empty means it is made from the start of the text
--   page_at   when the page went live (UTC). Empty means it is not public. Only an approved item can have one, and any
--             change to the item (or taking its approval back) clears it.
--   cover     the card as a PNG (1200 x 627), the page's preview image; NULL when there is none
ALTER TABLE drafts ADD COLUMN slug    TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN page_at TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN cover   BLOB;

CREATE UNIQUE INDEX drafts_page_slug ON drafts (kind, slug) WHERE slug <> '';
CREATE INDEX drafts_page_live ON drafts (kind, page_at DESC) WHERE page_at <> '';
