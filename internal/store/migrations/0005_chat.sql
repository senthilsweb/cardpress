-- The chat that prepares post content. A conversation is about one source (a fetched page or pasted text); its
-- proposals are content suggestions that a person approves or rejects. Nothing here publishes anything.
CREATE TABLE conversations (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  session_id       TEXT NOT NULL DEFAULT '',
  source_kind      TEXT NOT NULL,
  source_url       TEXT NOT NULL DEFAULT '',
  source_title     TEXT NOT NULL DEFAULT '',
  source_text      TEXT NOT NULL,
  source_truncated INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX conversations_profile ON conversations (profile_id, updated_at DESC);

CREATE TABLE chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);

CREATE TABLE proposals (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  hashtags        TEXT NOT NULL DEFAULT '[]',
  alt_text        TEXT NOT NULL DEFAULT '',
  rationale       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  edited          INTEGER NOT NULL DEFAULT 0,
  original        TEXT NOT NULL DEFAULT '',
  draft_id        TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  decided_at      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX proposals_conversation ON proposals (conversation_id, created_at);
