-- The input tokens of each reply and how many of them came from the prompt cache. The totals are the session's running
-- ones; added is what this reply added.
ALTER TABLE chat_usage ADD COLUMN total_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_usage ADD COLUMN total_cached INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_usage ADD COLUMN added_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_usage ADD COLUMN added_cached INTEGER NOT NULL DEFAULT 0;
