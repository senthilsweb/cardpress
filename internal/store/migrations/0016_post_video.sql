-- A post can carry a video in place of the card (attachment_kind 'video'). Only its public address is kept, never the
-- file: video_url is the address and video_size the size it had when it was checked, so a file that changed afterwards
-- is not posted. A video's title is in attachment_title, and a job's `image` is empty.
ALTER TABLE drafts ADD COLUMN video_url  TEXT    NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN video_size INTEGER NOT NULL DEFAULT 0;

ALTER TABLE publish_jobs ADD COLUMN video_url  TEXT    NOT NULL DEFAULT '';
ALTER TABLE publish_jobs ADD COLUMN video_size INTEGER NOT NULL DEFAULT 0;
