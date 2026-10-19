-- TIME-007: firm UTBMS code sets, LEDES timekeeper IDs, append-only client billing
-- guidelines, frozen LEDES 1998B invoices and imported e-billing outcomes.
CREATE TABLE s_utbms_codes (
 kind TEXT NOT NULL CHECK(kind IN('task','activity','expense')), code TEXT NOT NULL, label TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(kind,code)
);
CREATE TRIGGER s_utbms_codes_keep BEFORE DELETE ON s_utbms_codes BEGIN SELECT RAISE(ABORT,'constraint: retire codes instead of deleting them'); END;
CREATE TABLE s_ledes_timekeepers (
 email TEXT PRIMARY KEY, timekeeper_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN('PT','AS','OC','PL','LA','OT')), updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE s_ledes_guidelines (
 id TEXT PRIMARY KEY, client TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 client_ledes_id TEXT NOT NULL, law_firm_id TEXT NOT NULL,
 require_task INTEGER NOT NULL CHECK(require_task IN(0,1)), require_activity INTEGER NOT NULL CHECK(require_activity IN(0,1)), require_expense INTEGER NOT NULL CHECK(require_expense IN(0,1)),
 narrative_min INTEGER NOT NULL CHECK(narrative_min BETWEEN 0 AND 500), banned_phrases TEXT NOT NULL CHECK(json_valid(banned_phrases)),
 max_rates TEXT NOT NULL CHECK(json_valid(max_rates)), increment_minutes INTEGER NOT NULL CHECK(increment_minutes BETWEEN 0 AND 60),
 note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(client,version)
);
CREATE TRIGGER s_ledes_guidelines_immutable_update BEFORE UPDATE ON s_ledes_guidelines BEGIN SELECT RAISE(ABORT,'constraint: guidelines are versioned history'); END;
CREATE TRIGGER s_ledes_guidelines_immutable_delete BEFORE DELETE ON s_ledes_guidelines BEGIN SELECT RAISE(ABORT,'constraint: guidelines are versioned history'); END;
ALTER TABLE s_entries ADD COLUMN utbms_expense TEXT;
-- One LEDES invoice per bill: the number is reserved at preparation, the file frozen at approval.
CREATE TABLE s_bill_ledes (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), invoice_number TEXT NOT NULL UNIQUE,
 artifact TEXT, artifact_digest TEXT, created_at TEXT NOT NULL, CHECK((artifact IS NULL)=(artifact_digest IS NULL))
);
CREATE TRIGGER s_bill_ledes_frozen BEFORE UPDATE ON s_bill_ledes
 WHEN OLD.artifact IS NOT NULL OR NEW.bill_id<>OLD.bill_id OR NEW.invoice_number<>OLD.invoice_number OR NEW.created_at<>OLD.created_at
 BEGIN SELECT RAISE(ABORT,'reviewed LEDES invoice is immutable'); END;
CREATE TRIGGER s_bill_ledes_keep BEFORE DELETE ON s_bill_ledes BEGIN SELECT RAISE(ABORT,'billing history is immutable'); END;
CREATE TABLE s_ledes_outcomes (
 id TEXT PRIMARY KEY, bill_id TEXT NOT NULL REFERENCES s_bills(id), import_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('accepted','rejected')), line_number INTEGER, reason TEXT NOT NULL,
 source_name TEXT NOT NULL, source_digest TEXT NOT NULL, imported_by TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX s_ledes_outcomes_bill ON s_ledes_outcomes(bill_id,at);
CREATE UNIQUE INDEX s_ledes_outcome_once ON s_ledes_outcomes(bill_id,source_digest,COALESCE(line_number,0),status);
CREATE TRIGGER s_ledes_outcomes_immutable_update BEFORE UPDATE ON s_ledes_outcomes BEGIN SELECT RAISE(ABORT,'constraint: imported outcomes are history'); END;
CREATE TRIGGER s_ledes_outcomes_immutable_delete BEFORE DELETE ON s_ledes_outcomes BEGIN SELECT RAISE(ABORT,'constraint: imported outcomes are history'); END;
