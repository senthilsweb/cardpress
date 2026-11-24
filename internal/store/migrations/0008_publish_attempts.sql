-- One row per trip to LinkedIn for a job: what each call answered (status, ids, body, no secrets) and how it ended.
-- A job that is retried by hand has several attempts; the older ones are kept.
CREATE TABLE publish_attempts (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  error       TEXT NOT NULL DEFAULT '',
  steps       TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX publish_attempts_job ON publish_attempts (job_id, started_at);
