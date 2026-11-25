-- What an assistant that works in the studio has been told about a conversation: which kinds have had their graded first
-- draft, and each linked item as the assistant last saw it, so only what the person changed since is reported.
ALTER TABLE conversations ADD COLUMN graded TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN seen   TEXT NOT NULL DEFAULT '';
