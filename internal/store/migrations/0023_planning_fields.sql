-- Who an item is for, what it is about, the campaign it belongs to, and an approver's notes on it.
ALTER TABLE drafts ADD COLUMN audience     TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN topic        TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN campaign     TEXT NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN review_notes TEXT NOT NULL DEFAULT '';
-- A version holds the first three; one taken before they existed holds none (NULL), and restoring it leaves them alone.
-- Review notes are about the item, not part of any version of it.
ALTER TABLE draft_versions ADD COLUMN audience TEXT;
ALTER TABLE draft_versions ADD COLUMN topic    TEXT;
ALTER TABLE draft_versions ADD COLUMN campaign TEXT;
