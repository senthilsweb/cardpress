-- Accounts, roles and separate workspaces.
--   users          one row per person. The full name is first_name + last_name; it is never stored. Email is stored lower-case.
--   user_roles     a person's roles. One row each today (the screens set one role), but the model allows several: what a
--                  person may do is everything any of their roles allows.
--   sessions       sign-ins. Only a hash of the cookie token is kept.
--   user_preferences  theme, layout, the open brand and custom fonts, per person. System-wide keys stay in `preferences`.
--   owner_id / created_by / approved_by / user_id  who owns a brand and who did what (empty for work that predates accounts;
--                  the first account adopts the existing brands).
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  birth_date    TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  last_login_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role    TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'writer')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE user_preferences (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

ALTER TABLE profiles      ADD COLUMN owner_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts        ADD COLUMN created_by  TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts        ADD COLUMN approved_by TEXT NOT NULL DEFAULT '';
ALTER TABLE publish_jobs  ADD COLUMN created_by  TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN user_id     TEXT NOT NULL DEFAULT '';

CREATE INDEX profiles_owner ON profiles (owner_id);
