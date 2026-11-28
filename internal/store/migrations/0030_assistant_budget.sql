-- What the assistant has cost each brand in each calendar month (UTC), at list price in cents. Kept apart from
-- chat_usage so that deleting a conversation or a brand does not take away what was spent.
CREATE TABLE assistant_spend (
  profile_id TEXT NOT NULL,
  month      TEXT NOT NULL, -- YYYY-MM
  cents      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, month)
);

INSERT INTO assistant_spend (profile_id, month, cents)
  SELECT c.profile_id, substr(u.created_at, 1, 7), SUM(u.added_cents)
  FROM chat_usage u JOIN conversations c ON c.id = u.conversation_id
  GROUP BY c.profile_id, substr(u.created_at, 1, 7);

-- The notices already given about a budget, so that each is given once a month. scope is a brand's id, or '*' for the
-- server's own amount. level is 'alert' or 'used'.
CREATE TABLE budget_alerts (
  scope TEXT NOT NULL,
  month TEXT NOT NULL,
  level TEXT NOT NULL,
  at    TEXT NOT NULL,
  PRIMARY KEY (scope, month, level)
);
