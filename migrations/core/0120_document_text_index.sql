-- Rebuildable, local derivatives; originals and their provenance stay immutable.
CREATE TABLE s_document_text_indexes (
 document_id TEXT PRIMARY KEY REFERENCES s_documents(id),
 version INTEGER NOT NULL, sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ready','unavailable')),
 detail TEXT NOT NULL, indexed_at TEXT NOT NULL,
 FOREIGN KEY(document_id,version) REFERENCES s_document_versions(document_id,version)
);
CREATE TABLE s_document_text_pages (
 document_id TEXT NOT NULL REFERENCES s_document_text_indexes(document_id) ON DELETE CASCADE,
 page INTEGER NOT NULL CHECK(page>0), body TEXT NOT NULL,
 PRIMARY KEY(document_id,page)
);
-- A new head or erasure immediately invalidates every old page, even when a
-- version is published by an import rather than the ordinary upload handler.
CREATE TRIGGER s_document_text_head_changed AFTER UPDATE OF current_version,erased_at ON s_documents
 WHEN NEW.current_version IS NOT OLD.current_version OR NEW.erased_at IS NOT OLD.erased_at
 BEGIN
 DELETE FROM s_document_text_pages WHERE document_id=NEW.id;
 DELETE FROM s_document_text_indexes WHERE document_id=NEW.id;
 END;
CREATE TRIGGER s_document_text_original_erased AFTER UPDATE OF content_base64 ON s_document_versions
 WHEN NEW.content_base64 IS NULL
 BEGIN
 DELETE FROM s_document_text_pages WHERE document_id=NEW.document_id;
 DELETE FROM s_document_text_indexes WHERE document_id=NEW.document_id;
 END;
