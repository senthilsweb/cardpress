-- What a conversation with a real assistant has cost, one row for each reply. The figure the service reports is the
-- running total of one session, so what each reply added is kept beside it: a conversation that had to start a new
-- session still adds up.
CREATE TABLE chat_usage (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT    NOT NULL,
  message_id      TEXT    NOT NULL,
  session_id      TEXT    NOT NULL,
  total_cents     INTEGER NOT NULL,
  added_cents     INTEGER NOT NULL,
  active_seconds  REAL    NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL
);

CREATE INDEX chat_usage_conv ON chat_usage (conversation_id, session_id);
