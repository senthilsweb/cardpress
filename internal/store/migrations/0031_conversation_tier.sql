-- The tier a conversation's session was started on, so that it keeps it and the dashboard can say which. Empty for
-- conversations from before tiers and for assistants without them.
ALTER TABLE conversations ADD COLUMN tier TEXT NOT NULL DEFAULT '';
