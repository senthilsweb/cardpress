-- A post can carry several pictures (LinkedIn shows them as a grid). Each picture is its own row, so no single statement
-- carries more than one file.
--   draft_images   the pictures of a post whose attachment_kind is 'images', in order
--     position     0, 1, 2... the order they are shown in
--     data, type   the bytes (PNG or JPEG) and the media type
--     alt_text     the description of this picture for screen readers
--   job_images     the same pictures as they were when the post was published or scheduled, so a scheduled post sends
--                  what was approved even if the draft changes later
CREATE TABLE draft_images (
  id         TEXT PRIMARY KEY,
  draft_id   TEXT NOT NULL,
  position   INTEGER NOT NULL,
  data       BLOB NOT NULL,
  type       TEXT NOT NULL,
  alt_text   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX draft_images_draft ON draft_images (draft_id, position);

CREATE TABLE job_images (
  job_id   TEXT NOT NULL,
  position INTEGER NOT NULL,
  data     BLOB NOT NULL,
  type     TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (job_id, position)
);
