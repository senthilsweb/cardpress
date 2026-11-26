-- What an assistant's reply changed in an item: kept so the person can undo it, and to say whether they saved it as a
-- version. 'open' while the reply is written, then 'pending'; 'saved', 'undone', or 'passed' once a later reply changed
-- the item. `before` is the item as it was, held only while it can still be undone.
CREATE TABLE chat_changes (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id      TEXT NOT NULL DEFAULT '',
  draft_id        TEXT NOT NULL,
  before          TEXT NOT NULL,
  before_revision INTEGER NOT NULL,
  after_revision  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX chat_changes_conversation ON chat_changes (conversation_id);
CREATE INDEX chat_changes_draft ON chat_changes (draft_id, status);

-- Values an assistant offered for one field of an item. The first option is the one it recommends. 'pending', 'chosen',
-- 'dismissed' (the reply was undone) or 'superseded' (a newer offer for the same field).
CREATE TABLE choices (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id      TEXT NOT NULL DEFAULT '',
  draft_id        TEXT NOT NULL,
  field           TEXT NOT NULL,
  options         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  chosen          INTEGER NOT NULL DEFAULT -1,
  created_at      TEXT NOT NULL,
  decided_at      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX choices_conversation ON choices (conversation_id);
CREATE INDEX choices_draft ON choices (draft_id, field);
