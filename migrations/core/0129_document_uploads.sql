-- Transfer credentials and reservations stay installation-local, outside archives.
CREATE TABLE s_document_upload_batches (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(actor_id,request_key)
);
CREATE TABLE s_document_uploads (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES s_document_upload_batches(id),
 matter_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_by TEXT NOT NULL,
 document_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, relative_path TEXT NOT NULL,
 declared_mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 524288000),
 sha256 TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('matter','private')),
 object_key TEXT NOT NULL UNIQUE, multipart_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('active','completing','complete','cancelled','expired','invalid')),
 lease TEXT, lease_until TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(batch_id,relative_path)
);
CREATE INDEX s_document_upload_expiry ON s_document_uploads(state,expires_at);
CREATE TABLE s_document_upload_parts (
 upload_id TEXT NOT NULL REFERENCES s_document_uploads(id), part_number INTEGER NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, etag TEXT,
 PRIMARY KEY(upload_id,part_number)
);
-- R2 originals have their own immutable provenance; legacy D1 versions retain
-- their original size constraint and schema for existing callers and archives.
CREATE TABLE s_document_r2_versions (
 document_id TEXT NOT NULL REFERENCES s_documents(id), version INTEGER NOT NULL CHECK(version>0),
 name TEXT NOT NULL, relative_path TEXT NOT NULL, mime TEXT NOT NULL, declared_mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 524288000), sha256 TEXT NOT NULL,
 object_key TEXT UNIQUE, scan_status TEXT NOT NULL DEFAULT 'quarantined' CHECK(scan_status='quarantined'),
 created_by TEXT NOT NULL, created_channel TEXT NOT NULL CHECK(created_channel IN ('person','agent')), created_at TEXT NOT NULL,
 PRIMARY KEY(document_id,version), UNIQUE(document_id,sha256)
);
CREATE TRIGGER s_document_r2_immutable_update BEFORE UPDATE ON s_document_r2_versions
 WHEN NEW.document_id IS NOT OLD.document_id OR NEW.version IS NOT OLD.version
 OR NEW.name IS NOT OLD.name OR NEW.relative_path IS NOT OLD.relative_path
 OR NEW.mime IS NOT OLD.mime OR NEW.declared_mime IS NOT OLD.declared_mime
 OR NEW.size IS NOT OLD.size OR NEW.sha256 IS NOT OLD.sha256
 OR NEW.scan_status IS NOT OLD.scan_status OR NEW.created_by IS NOT OLD.created_by
 OR NEW.created_channel IS NOT OLD.created_channel OR NEW.created_at IS NOT OLD.created_at
 OR NEW.object_key IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'immutable R2 original'); END;
CREATE TRIGGER s_document_r2_immutable_delete BEFORE DELETE ON s_document_r2_versions
 BEGIN SELECT RAISE(ABORT,'immutable R2 original'); END;

CREATE TABLE s_document_upload_gc (object_key TEXT PRIMARY KEY);
