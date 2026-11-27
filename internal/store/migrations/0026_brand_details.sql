-- Who a brand is: the company or person behind it, kept apart from the brand's look so that it is never drawn on a
-- card, shown on a public page or sent to the assistant. One row for a brand that has any of it.
CREATE TABLE brand_details (
  profile_id  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT '' CHECK (kind IN ('', 'company', 'individual')),
  legal_name  TEXT NOT NULL DEFAULT '',
  line1       TEXT NOT NULL DEFAULT '',
  line2       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  region      TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
