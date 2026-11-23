-- Statements are split on semicolons: do not put a semicolon inside a string.
CREATE TABLE profiles (
  id         TEXT PRIMARY KEY,
  position   INTEGER NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE designs (
  profile_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE preferences (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
