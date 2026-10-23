-- CLIENT-002: retained two-way portal threads. A thread belongs to one matter; its participants are the matter's portal
-- readers (client, co-client, delegate) and the staff assigned to it. Messages and attachments are append-only. Read
-- state is per reader; a notification email carries no message content and its provider outcome is recorded.
CREATE TABLE s_portal_threads(id TEXT PRIMARY KEY,matter_id TEXT NOT NULL REFERENCES s_matters(id),subject TEXT NOT NULL,assigned_to TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX s_portal_threads_matter ON s_portal_threads(matter_id,created_at);
CREATE TABLE s_portal_messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES s_portal_threads(id),sender_email TEXT NOT NULL,sender_side TEXT NOT NULL CHECK(sender_side IN('staff','client')),body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX s_portal_messages_thread ON s_portal_messages(thread_id,created_at);
CREATE TABLE s_portal_attachments(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES s_portal_messages(id),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,content_base64 TEXT NOT NULL);
CREATE TABLE s_portal_reads(message_id TEXT NOT NULL REFERENCES s_portal_messages(id),reader_email TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(message_id,reader_email));
CREATE TABLE s_portal_notifications(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES s_portal_messages(id),recipient TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('accepted','failed','uncertain','not_sent')),provider TEXT,provider_id TEXT,detail TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_portal_message_update BEFORE UPDATE ON s_portal_messages BEGIN SELECT RAISE(ABORT,'constraint: portal messages are append-only'); END;
CREATE TRIGGER s_portal_message_delete BEFORE DELETE ON s_portal_messages BEGIN SELECT RAISE(ABORT,'constraint: portal messages are append-only'); END;
CREATE TRIGGER s_portal_attachment_update BEFORE UPDATE ON s_portal_attachments BEGIN SELECT RAISE(ABORT,'constraint: portal attachments are append-only'); END;
CREATE TRIGGER s_portal_attachment_delete BEFORE DELETE ON s_portal_attachments BEGIN SELECT RAISE(ABORT,'constraint: portal attachments are append-only'); END;
