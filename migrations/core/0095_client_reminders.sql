CREATE TABLE s_client_reminder_templates (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('invoice','appointment')),
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 approved_by TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 reason TEXT NOT NULL
);
CREATE TABLE s_client_reminder_authorizations (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 counsel_id TEXT NOT NULL,
 counsel_email TEXT NOT NULL,
 invoice_template TEXT REFERENCES s_client_reminder_templates(id),
 appointment_template TEXT REFERENCES s_client_reminder_templates(id),
 max_contacts INTEGER NOT NULL CHECK(max_contacts BETWEEN 1 AND 7),
 decided_at TEXT NOT NULL,
 reason TEXT NOT NULL
);
CREATE TABLE s_client_reminder_jobs (
 id TEXT PRIMARY KEY,
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 authorization_id TEXT NOT NULL REFERENCES s_client_reminder_authorizations(id),
 template_id TEXT NOT NULL REFERENCES s_client_reminder_templates(id),
 recipient TEXT NOT NULL,
 bill_id TEXT REFERENCES s_bills(id),
 appointment_id TEXT REFERENCES s_appointments(id),
 source_revision TEXT NOT NULL,
 due_at TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','prepared','stopped')),
 detail TEXT NOT NULL DEFAULT '',
 correspondence_id TEXT REFERENCES s_correspondence(id),
 attempt_id TEXT REFERENCES s_correspondence_attempts(id),
 CHECK((bill_id IS NOT NULL)+(appointment_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX s_client_reminder_source_once ON s_client_reminder_jobs(authorization_id,recipient,template_id,COALESCE(bill_id,appointment_id),due_at);
CREATE TRIGGER s_client_reminder_templates_no_update BEFORE UPDATE ON s_client_reminder_templates BEGIN SELECT RAISE(ABORT,'Approved template versions are immutable'); END;
CREATE TRIGGER s_client_reminder_templates_no_delete BEFORE DELETE ON s_client_reminder_templates BEGIN SELECT RAISE(ABORT,'Approved template history is retained'); END;
CREATE TRIGGER s_client_reminder_authorizations_no_update BEFORE UPDATE ON s_client_reminder_authorizations BEGIN SELECT RAISE(ABORT,'Reminder decisions are immutable'); END;
CREATE TRIGGER s_client_reminder_authorizations_no_delete BEFORE DELETE ON s_client_reminder_authorizations BEGIN SELECT RAISE(ABORT,'Reminder decisions are retained'); END;
CREATE TRIGGER s_client_reminder_jobs_no_delete BEFORE DELETE ON s_client_reminder_jobs BEGIN SELECT RAISE(ABORT,'Reminder jobs are retained'); END;
CREATE TRIGGER s_client_reminder_jobs_source_no_update BEFORE UPDATE OF id,matter_id,authorization_id,template_id,recipient,bill_id,appointment_id,source_revision,due_at,created_by,created_at ON s_client_reminder_jobs BEGIN SELECT RAISE(ABORT,'Scheduled reminder instructions are immutable'); END;
