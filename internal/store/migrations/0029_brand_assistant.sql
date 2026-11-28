-- How the assistant works for one brand: its tier, whether first drafts are checked and how often, and a monthly
-- amount. One row for a brand whose administrator saved any of it. Other brands use the server's defaults.
CREATE TABLE brand_assistant (
  profile_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
