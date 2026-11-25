-- A post can carry a file of its own in place of the card.
--   attachment_kind   what goes out with the post: 'card' (the designed card, the default), 'image' (a picture) or
--                     'document' (a PDF, which LinkedIn shows as pages to swipe through). The server checks the value.
--   attachment        the file's bytes; NULL for a card
--   attachment_type   its media type: image/png, image/jpeg or application/pdf; empty for a card
--   attachment_title  a document's title, shown by LinkedIn above its pages; empty otherwise
-- A job records what it carries (its file is in `image`), so the queue can say so and the file is served with the right type.
ALTER TABLE drafts ADD COLUMN attachment_kind  TEXT NOT NULL DEFAULT 'card';
ALTER TABLE drafts ADD COLUMN attachment       BLOB;
ALTER TABLE drafts ADD COLUMN attachment_type  TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN attachment_title TEXT NOT NULL DEFAULT '';

ALTER TABLE publish_jobs ADD COLUMN attachment_kind  TEXT NOT NULL DEFAULT 'card';
ALTER TABLE publish_jobs ADD COLUMN image_type       TEXT NOT NULL DEFAULT 'image/png';
ALTER TABLE publish_jobs ADD COLUMN attachment_title TEXT NOT NULL DEFAULT '';
