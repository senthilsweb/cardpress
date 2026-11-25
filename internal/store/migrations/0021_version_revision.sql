-- Which state of the draft a version holds, so the version that is the current text can be told apart, and the same
-- state is not kept twice.
ALTER TABLE draft_versions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
