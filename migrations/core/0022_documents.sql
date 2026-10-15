-- Chest immutable document versions and Locket human-confirmed obligations,
-- adapted under the MIT License (c) 2026 Run Edit Run; see LICENSE.
CREATE TABLE s_documents (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 title TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('matter','private')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 current_version INTEGER NOT NULL DEFAULT 0 CHECK(current_version>=0), revision TEXT NOT NULL, erased_at TEXT,
 updated_by TEXT NOT NULL, updated_channel TEXT NOT NULL CHECK(updated_channel IN ('person','agent')), updated_at TEXT NOT NULL
);
CREATE INDEX s_documents_matter ON s_documents(matter_id);
-- Base64 expands the 1 MiB original-byte cap to at most 1,398,104 characters.
-- Keeping each small original in D1 makes bytes and publication one transaction.
CREATE TABLE s_document_versions (
 document_id TEXT NOT NULL REFERENCES s_documents(id), version INTEGER NOT NULL CHECK(version>0),
 name TEXT NOT NULL, mime TEXT NOT NULL, declared_mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 1048576), sha256 TEXT NOT NULL,
 content_base64 TEXT CHECK(length(content_base64)<=1398104),
 created_by TEXT NOT NULL, created_channel TEXT NOT NULL CHECK(created_channel IN ('person','agent')), created_at TEXT NOT NULL,
 PRIMARY KEY(document_id,version), UNIQUE(document_id,sha256)
);
-- Erasure may remove bytes, but cannot rewrite an original or its provenance.
CREATE TRIGGER s_document_version_immutable_update BEFORE UPDATE ON s_document_versions
 WHEN NEW.document_id IS NOT OLD.document_id OR NEW.version IS NOT OLD.version
 OR NEW.name IS NOT OLD.name OR NEW.mime IS NOT OLD.mime OR NEW.declared_mime IS NOT OLD.declared_mime
 OR NEW.size IS NOT OLD.size OR NEW.sha256 IS NOT OLD.sha256 OR NEW.created_by IS NOT OLD.created_by
 OR NEW.created_channel IS NOT OLD.created_channel OR NEW.created_at IS NOT OLD.created_at
 OR NEW.content_base64 IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'immutable document version'); END;
CREATE TRIGGER s_document_version_immutable_delete BEFORE DELETE ON s_document_versions BEGIN SELECT RAISE(ABORT,'immutable document version'); END;
CREATE TABLE s_deadlines (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 title TEXT NOT NULL, date TEXT NOT NULL, timezone TEXT NOT NULL, source TEXT NOT NULL,
 document_id TEXT, document_version INTEGER,
 status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','done','superseded')),
 revision TEXT NOT NULL, proposed_by TEXT NOT NULL, proposed_channel TEXT NOT NULL CHECK(proposed_channel IN ('person','agent')), proposed_at TEXT NOT NULL,
 confirmed_by TEXT, confirmed_at TEXT, completed_by TEXT, completed_at TEXT, completion_evidence TEXT,
 FOREIGN KEY(document_id,document_version) REFERENCES s_document_versions(document_id,version),
 CHECK((document_id IS NULL AND document_version IS NULL) OR (document_id IS NOT NULL AND document_version IS NOT NULL))
);
CREATE INDEX s_deadlines_matter ON s_deadlines(matter_id,date);
CREATE TABLE s_deadline_events (
 id TEXT PRIMARY KEY, deadline_id TEXT NOT NULL REFERENCES s_deadlines(id),
 action TEXT NOT NULL, actor TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('person','agent')), at TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX s_deadline_events_deadline ON s_deadline_events(deadline_id,at);
-- New source text requires a new proposal and human review. Keep old decisions
-- and exact source versions as history, including completed work.
CREATE TRIGGER s_document_deadline_source_changed AFTER UPDATE OF current_version,erased_at ON s_documents
 WHEN NEW.current_version>OLD.current_version OR (NEW.erased_at IS NOT NULL AND OLD.erased_at IS NULL)
 BEGIN
 INSERT INTO s_deadline_events(id,deadline_id,action,actor,channel,at,detail)
 SELECT lower(hex(randomblob(16))),id,'supersede',NEW.updated_by,NEW.updated_channel,NEW.updated_at,
 json_object('source',source,'documentId',document_id,'version',document_version,'replacementVersion',NEW.current_version,'erasedAt',NEW.erased_at,'previousStatus',status)
 FROM s_deadlines WHERE document_id=NEW.id AND (document_version<NEW.current_version OR NEW.erased_at IS NOT NULL) AND status IN ('proposed','confirmed');
 UPDATE s_deadlines SET status='superseded',revision=lower(hex(randomblob(16)))
 WHERE document_id=NEW.id AND (document_version<NEW.current_version OR NEW.erased_at IS NOT NULL) AND status IN ('proposed','confirmed');
 END;
