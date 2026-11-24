-- Credentials belong to a brand (a profile). Existing credentials move to the first profile, which is the only one on every
-- installation made before this migration, so nothing is lost and no value is re-encrypted. With no profile saved yet they
-- are kept under an empty id, which the service treats as belonging to the first profile once it exists.
CREATE TABLE credentials_new (
  profile_id TEXT NOT NULL,
  network    TEXT NOT NULL,
  field      TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, network, field)
);

INSERT INTO credentials_new (profile_id, network, field, value, updated_at)
  SELECT COALESCE((SELECT id FROM profiles ORDER BY position LIMIT 1), ''), network, field, value, updated_at FROM credentials;

DROP TABLE credentials;

ALTER TABLE credentials_new RENAME TO credentials;

-- A brand can be archived: hidden from the studio, but its drafts, posts, conversations and credentials are kept.
ALTER TABLE profiles ADD COLUMN archived_at TEXT;

-- Credentials set through environment variables belong to one brand: the first one. This records which, so the choice
-- does not move when brands are reordered or archived.
INSERT OR IGNORE INTO preferences (key, value, updated_at)
  SELECT 'envProfile', json_quote(id), updated_at FROM profiles ORDER BY position LIMIT 1;
