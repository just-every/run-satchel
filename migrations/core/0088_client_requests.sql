-- CLIENT-003: a document request can carry the firm's instructions, owner and acceptance criteria, be shared with the
-- matter's portal readers, receive uploads, and be closed only by counsel accepting one upload as the retained original.
ALTER TABLE s_document_requests ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE s_document_requests ADD COLUMN owner_email TEXT;
ALTER TABLE s_document_requests ADD COLUMN criteria TEXT NOT NULL DEFAULT '';
ALTER TABLE s_document_requests ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0 CHECK(client_visible IN(0,1));
CREATE TABLE s_request_uploads(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES s_document_requests(id),uploader_email TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,content_base64 TEXT NOT NULL,uploaded_at TEXT NOT NULL,review TEXT NOT NULL DEFAULT 'submitted' CHECK(review IN('submitted','accepted','deficient')),reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,document_id TEXT REFERENCES s_documents(id));
CREATE INDEX s_request_uploads_request ON s_request_uploads(request_id,uploaded_at);
CREATE TRIGGER s_request_upload_once BEFORE UPDATE ON s_request_uploads WHEN OLD.review<>'submitted' OR NEW.request_id IS NOT OLD.request_id OR NEW.uploader_email IS NOT OLD.uploader_email OR NEW.name IS NOT OLD.name OR NEW.sha256 IS NOT OLD.sha256 OR NEW.content_base64 IS NOT OLD.content_base64 OR NEW.uploaded_at IS NOT OLD.uploaded_at BEGIN SELECT RAISE(ABORT,'constraint: an uploaded original is final and reviewed once'); END;
CREATE TRIGGER s_request_upload_delete BEFORE DELETE ON s_request_uploads BEGIN SELECT RAISE(ABORT,'constraint: uploads are history'); END;
CREATE TABLE s_request_notes(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES s_document_requests(id),upload_id TEXT REFERENCES s_request_uploads(id),side TEXT NOT NULL CHECK(side IN('staff','client')),author_email TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_request_note_update BEFORE UPDATE ON s_request_notes BEGIN SELECT RAISE(ABORT,'constraint: request notes are append-only'); END;
CREATE TRIGGER s_request_note_delete BEFORE DELETE ON s_request_notes BEGIN SELECT RAISE(ABORT,'constraint: request notes are append-only'); END;
