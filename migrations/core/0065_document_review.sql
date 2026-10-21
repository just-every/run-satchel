-- DOC-002: separate version-bound notes and exact attempted conflict originals.
CREATE TABLE s_document_annotations (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version INTEGER NOT NULL,
 page INTEGER NOT NULL CHECK(page>0), note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(document_id,version) REFERENCES s_document_versions(document_id,version)
);
CREATE TABLE s_document_conflicts (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES s_documents(id), base_revision TEXT NOT NULL,
 name TEXT NOT NULL, mime TEXT NOT NULL, declared_mime TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, content_base64 TEXT,
 created_by TEXT NOT NULL, created_channel TEXT NOT NULL, created_at TEXT NOT NULL,
 resolved_version INTEGER, resolved_by TEXT, resolved_at TEXT,
 FOREIGN KEY(document_id,resolved_version) REFERENCES s_document_versions(document_id,version)
);
