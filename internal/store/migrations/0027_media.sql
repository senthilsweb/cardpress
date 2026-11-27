-- A brand's media library: pictures, PDF documents and links to videos.
--   assets       one entry in a brand's library. A file is named by the hash of its bytes; a video is only a link.
--                The thumbnail is the entry's own (it is made by the browser that uploaded it), so one brand's upload
--                never decides what another brand sees.
--   asset_blobs  each distinct file once, however many entries point at it.
CREATE TABLE asset_blobs (
  hash TEXT PRIMARY KEY,
  data BLOB NOT NULL
);

CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'video')),
  name       TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  hash       TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  mime       TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  thumb      BLOB,
  thumb_mime TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX assets_brand ON assets (profile_id, created_at);
CREATE INDEX assets_hash ON assets (hash);
