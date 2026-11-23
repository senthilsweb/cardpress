-- A draft is the content of one post or article. The card design stays in the designs table.
CREATE TABLE drafts (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('post', 'article')),
  status         TEXT NOT NULL DEFAULT 'draft',
  doc            TEXT NOT NULL,
  hashtags       TEXT NOT NULL DEFAULT '[]',
  alt_text       TEXT NOT NULL DEFAULT '',
  unicode_styles INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX drafts_profile_updated ON drafts (profile_id, updated_at DESC);
