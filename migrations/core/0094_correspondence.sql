CREATE TABLE s_correspondence (
 id TEXT PRIMARY KEY,
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 recipient TEXT NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 bill_id TEXT REFERENCES s_bills(id),
 bill_digest TEXT,
 contact_revision INTEGER NOT NULL,
 reviewed_by TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 review_note TEXT NOT NULL
);
CREATE TABLE s_correspondence_attempts (
 id TEXT PRIMARY KEY,
 correspondence_id TEXT NOT NULL REFERENCES s_correspondence(id),
 decision_by TEXT NOT NULL,
 decision_at TEXT NOT NULL,
 decision_note TEXT NOT NULL,
 contact_revision INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','sending','accepted','uncertain','failed','development')),
 provider TEXT,
 provider_id TEXT,
 detail TEXT NOT NULL DEFAULT '',
 attempted_at TEXT
);
CREATE TABLE s_correspondence_events (
 id TEXT PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES s_correspondence_attempts(id),
 status TEXT NOT NULL,
 observed_by TEXT NOT NULL,
 observed_at TEXT NOT NULL
);
CREATE TRIGGER s_correspondence_no_update BEFORE UPDATE ON s_correspondence BEGIN SELECT RAISE(ABORT,'Reviewed correspondence is immutable'); END;
CREATE TRIGGER s_correspondence_no_delete BEFORE DELETE ON s_correspondence BEGIN SELECT RAISE(ABORT,'Reviewed correspondence is immutable'); END;
CREATE TRIGGER s_correspondence_events_no_update BEFORE UPDATE ON s_correspondence_events BEGIN SELECT RAISE(ABORT,'Mail events are immutable'); END;
CREATE TRIGGER s_correspondence_events_no_delete BEFORE DELETE ON s_correspondence_events BEGIN SELECT RAISE(ABORT,'Mail events are immutable'); END;
CREATE TRIGGER s_correspondence_attempt_decision_no_update BEFORE UPDATE OF id,correspondence_id,decision_by,decision_at,decision_note,contact_revision ON s_correspondence_attempts BEGIN SELECT RAISE(ABORT,'Mail decisions are immutable'); END;
CREATE TRIGGER s_correspondence_attempt_no_delete BEFORE DELETE ON s_correspondence_attempts BEGIN SELECT RAISE(ABORT,'Mail attempts are retained'); END;
