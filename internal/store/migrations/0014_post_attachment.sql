-- A post can carry a picture of its own in place of the card.
--   attachment_kind  what goes out with the post: 'card' (the designed card, the default) or 'image' (the picture below)
--   attachment       the picture's bytes (PNG or JPEG); NULL for a card
--   attachment_type  its media type, image/png or image/jpeg; empty for a card
-- A job records what it carries, so the queue can say so and its picture is served with the right type.
ALTER TABLE drafts ADD COLUMN attachment_kind TEXT NOT NULL DEFAULT 'card' CHECK (attachment_kind IN ('card', 'image'));
ALTER TABLE drafts ADD COLUMN attachment      BLOB;
ALTER TABLE drafts ADD COLUMN attachment_type TEXT NOT NULL DEFAULT '';

ALTER TABLE publish_jobs ADD COLUMN attachment_kind TEXT NOT NULL DEFAULT 'card' CHECK (attachment_kind IN ('card', 'image'));
ALTER TABLE publish_jobs ADD COLUMN image_type      TEXT NOT NULL DEFAULT 'image/png';
