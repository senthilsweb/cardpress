-- A publish job is a confirmed post waiting for, or recording, its trip to LinkedIn. The text and image are snapshots,
-- so editing the draft or the card afterwards never changes what was scheduled.
CREATE TABLE publish_jobs (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  draft_id     TEXT NOT NULL DEFAULT '',
  network      TEXT NOT NULL DEFAULT 'linkedin',
  status       TEXT NOT NULL,
  body         TEXT NOT NULL,
  hashtags     TEXT NOT NULL DEFAULT '[]',
  alt_text     TEXT NOT NULL DEFAULT '',
  image        BLOB NOT NULL,
  scheduled_at TEXT,
  timezone     TEXT NOT NULL DEFAULT '',
  error        TEXT NOT NULL DEFAULT '',
  post_urn     TEXT NOT NULL DEFAULT '',
  post_url     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX publish_jobs_due ON publish_jobs (status, scheduled_at);
CREATE INDEX publish_jobs_profile ON publish_jobs (profile_id, created_at DESC);
