CREATE TABLE s_collection_sequences (
 id TEXT PRIMARY KEY,
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 bill_id TEXT REFERENCES s_bills(id),
 ledger_id TEXT REFERENCES s_trust_ledgers(id),
 replenishment_id TEXT,
 recipient TEXT NOT NULL,
 authorization_id TEXT NOT NULL REFERENCES s_client_reminder_authorizations(id),
 owner_id TEXT NOT NULL,
 owner_email TEXT NOT NULL,
 first_due_at TEXT NOT NULL,
 steps TEXT NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 reason TEXT NOT NULL,
 CHECK((bill_id IS NOT NULL)+(ledger_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX s_collection_invoice_once ON s_collection_sequences(bill_id) WHERE bill_id IS NOT NULL;
CREATE UNIQUE INDEX s_collection_retainer_once ON s_collection_sequences(replenishment_id) WHERE replenishment_id IS NOT NULL;
CREATE TABLE s_collection_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 collection_id TEXT NOT NULL REFERENCES s_collection_sequences(id),
 kind TEXT NOT NULL CHECK(kind IN('dispute','promise','hardship','representation','clear','stop','decision')),
 note TEXT NOT NULL,
 next_due_at TEXT,
 decision_attempt_id TEXT,
 actor TEXT NOT NULL,
 at TEXT NOT NULL
);
CREATE TABLE s_collection_attempts (
 id TEXT PRIMARY KEY,
 collection_id TEXT NOT NULL REFERENCES s_collection_sequences(id),
 collection_step INTEGER NOT NULL,
 correspondence_id TEXT NOT NULL REFERENCES s_correspondence(id),
 attempt_id TEXT NOT NULL UNIQUE REFERENCES s_correspondence_attempts(id),
 due_at TEXT NOT NULL,
 due_cents INTEGER NOT NULL CHECK(due_cents>0),
 UNIQUE(collection_id,collection_step)
);
CREATE TRIGGER s_collection_sequences_immutable BEFORE UPDATE ON s_collection_sequences BEGIN SELECT RAISE(ABORT,'Approved collection sequences are immutable'); END;
CREATE TRIGGER s_collection_sequences_retained BEFORE DELETE ON s_collection_sequences BEGIN SELECT RAISE(ABORT,'Collection history is retained'); END;
CREATE TRIGGER s_collection_events_immutable BEFORE UPDATE ON s_collection_events BEGIN SELECT RAISE(ABORT,'Collection replies and decisions are append only'); END;
CREATE TRIGGER s_collection_events_retained BEFORE DELETE ON s_collection_events BEGIN SELECT RAISE(ABORT,'Collection replies and decisions are retained'); END;
CREATE TRIGGER s_collection_attempts_immutable BEFORE UPDATE ON s_collection_attempts BEGIN SELECT RAISE(ABORT,'Collection steps are immutable'); END;
CREATE TRIGGER s_collection_attempts_retained BEFORE DELETE ON s_collection_attempts BEGIN SELECT RAISE(ABORT,'Collection steps are retained'); END;
