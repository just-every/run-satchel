-- Native health-data setup and counsel-reviewed source-page chronologies.
CREATE TABLE s_health_setup (
 matter_id TEXT PRIMARY KEY REFERENCES s_matters(id), authorization_reference TEXT NOT NULL,
 agreement_reference TEXT NOT NULL, reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE s_document_chronologies (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 snapshot TEXT, sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','erased')),
 review TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, published_by TEXT, published_at TEXT
);
CREATE TABLE s_chronology_sources (
 chronology_id TEXT NOT NULL REFERENCES s_document_chronologies(id),
 document_id TEXT NOT NULL, version INTEGER NOT NULL,
 PRIMARY KEY(chronology_id,document_id,version),
 FOREIGN KEY(document_id,version) REFERENCES s_document_versions(document_id,version)
);
