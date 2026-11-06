-- Resumable versions keep their reserved identity and original base revision.
ALTER TABLE s_document_uploads ADD COLUMN target_document_id TEXT REFERENCES s_documents(id);
ALTER TABLE s_document_uploads ADD COLUMN base_revision TEXT;
CREATE INDEX s_document_upload_target ON s_document_uploads(target_document_id);
