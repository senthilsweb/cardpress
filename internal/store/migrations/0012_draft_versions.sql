-- The history of an item: a snapshot of its text, hashtags, alt text, title and card at the moments that matter (when it is
-- created, approved, sent, restored, saved by hand, or after a stretch of editing).
--   seq     1, 2, 3... per item
--   label   created, auto, manual, approved, sent, restored
--   note    what the person typed for a manual version, or "from version N" for a restore
--   doc     the text with its pictures replaced by blob:<hash>, so a picture kept in many versions is stored once
--   blobs   the hashes of the pictures this version uses (a JSON array), for cleaning up pictures nothing refers to
-- doc_blobs holds each distinct picture once, keyed by the hash of its bytes.
CREATE TABLE draft_versions (
  id             TEXT PRIMARY KEY,
  draft_id       TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  label          TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  doc            TEXT NOT NULL,
  hashtags       TEXT NOT NULL DEFAULT '[]',
  alt_text       TEXT NOT NULL DEFAULT '',
  unicode_styles INTEGER NOT NULL DEFAULT 0,
  design         TEXT NOT NULL DEFAULT '{}',
  design_version INTEGER NOT NULL DEFAULT 0,
  blobs          TEXT NOT NULL DEFAULT '[]',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  UNIQUE (draft_id, seq)
);

CREATE TABLE doc_blobs (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
);
