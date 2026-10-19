-- Matter originals and source identities travel with ordinary native backups.
-- A row is written in the same transaction as its reviewed native matter.
CREATE TABLE s_matter_import_files (
 fingerprint TEXT PRIMARY KEY,
 mapping_version TEXT NOT NULL,
 filename TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 original_base64 TEXT NOT NULL,
 total INTEGER NOT NULL CHECK(total>0),
 imported_by TEXT NOT NULL,
 imported_at TEXT NOT NULL
);
CREATE TABLE s_matter_import_rows (
 source_id TEXT PRIMARY KEY,
 source_digest TEXT NOT NULL,
 source_number TEXT NOT NULL UNIQUE,
 matter_id TEXT NOT NULL UNIQUE REFERENCES s_matters(id),
 fingerprint TEXT NOT NULL REFERENCES s_matter_import_files(fingerprint),
 source_line INTEGER NOT NULL,
 source_json TEXT NOT NULL,
 conflict_id TEXT NOT NULL UNIQUE REFERENCES s_conflicts(id),
 review_note TEXT NOT NULL,
 reviewed_by TEXT NOT NULL,
 imported_at TEXT NOT NULL
);
