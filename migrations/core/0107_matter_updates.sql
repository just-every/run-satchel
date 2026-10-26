CREATE TABLE s_matter_updates (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 deadline_id TEXT NOT NULL REFERENCES s_deadlines(id), previous_deadline_id TEXT REFERENCES s_deadlines(id),
 source_document_id TEXT NOT NULL, source_version INTEGER NOT NULL, source_digest TEXT NOT NULL,
 source_revision TEXT NOT NULL, source_citation TEXT NOT NULL, previous_date TEXT, new_date TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, actions_json TEXT NOT NULL CHECK(json_valid(actions_json)),
 responsible_email TEXT NOT NULL, due_at TEXT, max_contacts INTEGER NOT NULL DEFAULT 1 CHECK(max_contacts BETWEEN 1 AND 7),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved')), revision TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, approved_by TEXT, approved_counsel_id TEXT, approved_at TEXT, review_note TEXT,
 FOREIGN KEY(source_document_id,source_version) REFERENCES s_document_versions(document_id,version),
 UNIQUE(deadline_id,source_revision)
);
CREATE TABLE s_matter_update_recipients (
 update_id TEXT NOT NULL REFERENCES s_matter_updates(id), email TEXT NOT NULL, PRIMARY KEY(update_id,email)
);
CREATE TABLE s_matter_update_promises (
 id TEXT PRIMARY KEY, update_id TEXT NOT NULL REFERENCES s_matter_updates(id), text TEXT NOT NULL, responsible_email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','fulfilled')),
 fulfilled_document_id TEXT, fulfilled_version INTEGER, fulfilled_digest TEXT, fulfilled_evidence TEXT, fulfilled_by TEXT, fulfilled_at TEXT,
 FOREIGN KEY(fulfilled_document_id,fulfilled_version) REFERENCES s_document_versions(document_id,version),
 CHECK(status='open' OR (fulfilled_document_id IS NOT NULL AND fulfilled_version IS NOT NULL AND fulfilled_digest IS NOT NULL AND fulfilled_evidence IS NOT NULL AND fulfilled_by IS NOT NULL AND fulfilled_at IS NOT NULL))
);
CREATE TABLE s_matter_update_jobs (
 id TEXT PRIMARY KEY, update_id TEXT NOT NULL REFERENCES s_matter_updates(id), matter_id TEXT NOT NULL REFERENCES s_matters(id),
 recipient TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','prepared','finished','stopped','paused')),
 correspondence_id TEXT UNIQUE REFERENCES s_correspondence(id), attempt_id TEXT REFERENCES s_correspondence_attempts(id),
 portal_published_at TEXT, detail TEXT, created_at TEXT NOT NULL, UNIQUE(update_id,recipient)
);
CREATE INDEX s_matter_update_due ON s_matter_update_jobs(status,due_at);
CREATE TABLE s_matter_update_replies (
 id TEXT PRIMARY KEY, update_id TEXT NOT NULL REFERENCES s_matter_updates(id), recipient TEXT NOT NULL, body TEXT NOT NULL,
 responsible_email TEXT NOT NULL, created_at TEXT NOT NULL, completed_by TEXT, completed_at TEXT, completion_evidence TEXT
);
CREATE TRIGGER s_matter_update_approved_immutable BEFORE UPDATE ON s_matter_updates WHEN OLD.status='approved'
 BEGIN SELECT RAISE(ABORT,'Approved matter updates are immutable'); END;
CREATE TRIGGER s_matter_update_no_delete BEFORE DELETE ON s_matter_updates BEGIN SELECT RAISE(ABORT,'Matter update history is retained'); END;
CREATE TRIGGER s_matter_update_recipient_no_insert BEFORE INSERT ON s_matter_update_recipients WHEN (SELECT status FROM s_matter_updates WHERE id=NEW.update_id)='approved'
 BEGIN SELECT RAISE(ABORT,'Approved recipients are immutable'); END;
CREATE TRIGGER s_matter_update_recipient_no_update BEFORE UPDATE ON s_matter_update_recipients BEGIN SELECT RAISE(ABORT,'Replace draft recipients explicitly'); END;
CREATE TRIGGER s_matter_update_recipient_no_delete BEFORE DELETE ON s_matter_update_recipients WHEN (SELECT status FROM s_matter_updates WHERE id=OLD.update_id)='approved'
 BEGIN SELECT RAISE(ABORT,'Approved recipients are retained'); END;
CREATE TRIGGER s_matter_update_promise_no_insert BEFORE INSERT ON s_matter_update_promises WHEN (SELECT status FROM s_matter_updates WHERE id=NEW.update_id)='approved'
 BEGIN SELECT RAISE(ABORT,'Approved promises are immutable'); END;
CREATE TRIGGER s_matter_update_promise_no_change BEFORE UPDATE OF id,update_id,text,responsible_email ON s_matter_update_promises
 BEGIN SELECT RAISE(ABORT,'Replace draft promises explicitly'); END;
CREATE TRIGGER s_matter_update_promise_fulfilled_immutable BEFORE UPDATE ON s_matter_update_promises WHEN OLD.status='fulfilled'
 BEGIN SELECT RAISE(ABORT,'Fulfillment evidence is retained'); END;
CREATE TRIGGER s_matter_update_promise_no_delete BEFORE DELETE ON s_matter_update_promises WHEN (SELECT status FROM s_matter_updates WHERE id=OLD.update_id)='approved'
 BEGIN SELECT RAISE(ABORT,'Approved promises are retained'); END;
CREATE TRIGGER s_matter_update_job_no_change BEFORE UPDATE OF id,update_id,matter_id,recipient,due_at,created_at ON s_matter_update_jobs
 BEGIN SELECT RAISE(ABORT,'Approved schedule is immutable'); END;
CREATE TRIGGER s_matter_update_job_no_delete BEFORE DELETE ON s_matter_update_jobs BEGIN SELECT RAISE(ABORT,'Delivery history is retained'); END;
CREATE TRIGGER s_matter_update_reply_no_change BEFORE UPDATE OF id,update_id,recipient,body,responsible_email,created_at ON s_matter_update_replies
 BEGIN SELECT RAISE(ABORT,'Client replies are immutable'); END;
CREATE TRIGGER s_matter_update_reply_completed_immutable BEFORE UPDATE ON s_matter_update_replies WHEN OLD.completed_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Followup completion is retained'); END;
CREATE TRIGGER s_matter_update_reply_no_delete BEFORE DELETE ON s_matter_update_replies BEGIN SELECT RAISE(ABORT,'Client replies are retained'); END;
