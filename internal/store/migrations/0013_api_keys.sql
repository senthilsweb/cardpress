-- API keys let a program (an MCP client, a script) act for a person without their password.
--   user_id      the person the key acts for; it sees only what that person sees
--   prefix       the first characters of the key, to tell keys apart in a list. The key itself is never stored: key_hash is
--                the SHA-256 of it, and the full key is shown once, when it is made.
--   scope        what the key may do, at most what its person may do. Today: 'editor' (write, approve, publish, social
--                accounts; never users, and never other people's work, even for an admin's key).
--   revoked_at   set when the key is revoked; a revoked key stops working at once.
CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  scope        TEXT NOT NULL DEFAULT 'editor' CHECK (scope IN ('editor')),
  created_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL DEFAULT '',
  revoked_at   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX api_keys_user ON api_keys (user_id);
