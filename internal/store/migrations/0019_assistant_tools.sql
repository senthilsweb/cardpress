-- A draft's revision moves with every change to what it says or shows, so two writers (a person in the studio and an
-- assistant) never overwrite each other without knowing.
ALTER TABLE drafts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

-- Short notes the assistant keeps about a brand, which the person can read and remove.
CREATE TABLE agent_memories (
  profile_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, key)
);
