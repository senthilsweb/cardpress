-- A conversation can draw on several sources (pages, pasted text, files), added at any point.
CREATE TABLE conversation_sources (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT    NOT NULL,
  message_id      TEXT    NOT NULL DEFAULT '', -- the message it went with, empty until sent
  kind            TEXT    NOT NULL,            -- url, text, md, docx or pdf
  name            TEXT    NOT NULL DEFAULT '',
  url             TEXT    NOT NULL DEFAULT '',
  chars           INTEGER NOT NULL DEFAULT 0,
  truncated       INTEGER NOT NULL DEFAULT 0,
  text            TEXT    NOT NULL,
  data            BLOB,                        -- a PDF as it was attached
  delivered       INTEGER NOT NULL DEFAULT 0,  -- the agent has answered a message that carried it
  created_at      TEXT    NOT NULL
);

CREATE INDEX conversation_sources_conv ON conversation_sources (conversation_id, created_at);

-- the single source each conversation had until now
INSERT INTO conversation_sources (id, conversation_id, message_id, kind, name, url, chars, truncated, text, delivered, created_at)
SELECT 's-' || c.id, c.id,
       COALESCE((SELECT m.id FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.seq LIMIT 1), ''),
       c.source_kind, c.source_title, c.source_url, length(c.source_text), c.source_truncated, c.source_text,
       EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'assistant'),
       c.created_at
FROM conversations c WHERE c.source_text <> '';
