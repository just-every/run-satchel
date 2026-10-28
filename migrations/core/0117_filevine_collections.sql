-- Repeated source rows keep independent identities and their pinned typed values.
ALTER TABLE s_matter_fields ADD COLUMN collections_json TEXT NOT NULL DEFAULT '[]';
