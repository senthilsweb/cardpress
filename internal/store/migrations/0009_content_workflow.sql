-- A draft now carries its own card design and goes through approval before it can be sent.
--   title           shown in lists; empty means the first line of the text is used
--   design          the card design as typed JSON (see service.CardDesign); '{}' until one is saved
--   design_version  the shape of `design`; 0 = none saved yet
--   approved_at     when it was approved; empty while it is a draft
--   scheduled_at    an article's planned date (UTC); empty if none. A post's time lives on its publish job.
--   timezone        the zone the planned date was chosen in
-- status: draft -> approved -> scheduled -> published (any edit returns an approved or published draft to draft).
ALTER TABLE drafts ADD COLUMN title          TEXT    NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN design         TEXT    NOT NULL DEFAULT '{}';
ALTER TABLE drafts ADD COLUMN design_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drafts ADD COLUMN approved_at    TEXT    NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN scheduled_at   TEXT    NOT NULL DEFAULT '';
ALTER TABLE drafts ADD COLUMN timezone       TEXT    NOT NULL DEFAULT '';

CREATE INDEX drafts_status ON drafts (profile_id, status, updated_at DESC);
