-- Counsel-reviewed, immutable internal production packets.
CREATE TABLE s_document_productions (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 snapshot TEXT, artifact_base64 TEXT, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','approved','recalled','erased')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, review_note TEXT,
 exported_at TEXT, recalled_by TEXT, recalled_at TEXT, recall_reason TEXT
);
CREATE TABLE s_production_sources (
 production_id TEXT NOT NULL REFERENCES s_document_productions(id),
 document_id TEXT NOT NULL, version INTEGER NOT NULL,
 PRIMARY KEY(production_id,document_id),
 FOREIGN KEY(document_id,version) REFERENCES s_document_versions(document_id,version)
);
CREATE INDEX s_production_matter ON s_document_productions(matter_id);

-- Never reuse an issued Bates label within a matter, including recalled packets.
CREATE TABLE s_production_bates (
 matter_id TEXT NOT NULL REFERENCES s_matters(id), label TEXT NOT NULL,
 production_id TEXT NOT NULL REFERENCES s_document_productions(id),
 PRIMARY KEY(matter_id,label)
);
