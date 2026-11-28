-- What happened around signing in and the accounts, for an administrator to read. Never a password or a token. The
-- server keeps the newest ones only.
CREATE TABLE security_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  event   TEXT NOT NULL,
  actor   TEXT NOT NULL DEFAULT '', -- who did it: an email, or empty for a visitor who is not signed in
  subject TEXT NOT NULL DEFAULT '', -- whose account it is about (an email)
  address TEXT NOT NULL DEFAULT '', -- where the request came from
  detail  TEXT NOT NULL DEFAULT ''
);
