-- How a reply ended ('done', 'failed' or 'stopped') and what happened while it was written: the steps, the versions it
-- saved, the check results and why it failed. Empty for the person's messages and for replies from before this.
ALTER TABLE chat_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE chat_messages ADD COLUMN detail TEXT NOT NULL DEFAULT '';
