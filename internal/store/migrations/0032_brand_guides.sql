-- A brand's own writing guides, one per kind (post, article, greeting), every save a version. The highest version is
-- the one in use. An empty body means the brand uses the house style the agents came with.
CREATE TABLE brand_guides (
  profile_id TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('post', 'article', 'greeting')),
  version    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, kind, version)
);
