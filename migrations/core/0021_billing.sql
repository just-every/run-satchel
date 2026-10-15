CREATE TABLE s_entries (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), revision TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('time','disbursement')), date TEXT NOT NULL, description TEXT NOT NULL,
 minutes INTEGER, rate_cents INTEGER, amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'), created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK((kind='time' AND minutes BETWEEN 1 AND 1440 AND rate_cents BETWEEN 0 AND 100000000)
    OR (kind='disbursement' AND minutes IS NULL AND rate_cents IS NULL))
);
CREATE INDEX s_entries_matter ON s_entries(matter_id,date);
CREATE TRIGGER s_entries_immutable_update BEFORE UPDATE ON s_entries BEGIN SELECT RAISE(ABORT,'billing entries are immutable'); END;
CREATE TRIGGER s_entries_immutable_delete BEFORE DELETE ON s_entries BEGIN SELECT RAISE(ABORT,'billing entries are immutable'); END;
CREATE TABLE s_bills (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), revision TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','approved','exported','void')),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), corrects_bill_id TEXT REFERENCES s_bills(id),
 artifact TEXT, artifact_digest TEXT, approved_by TEXT, approved_at TEXT, review_note TEXT,
 exported_at TEXT, void_reason TEXT, voided_by TEXT, voided_at TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(status NOT IN ('approved','exported') OR (artifact IS NOT NULL AND artifact_digest IS NOT NULL AND approved_by IS NOT NULL AND review_note IS NOT NULL)),
 CHECK(status<>'exported' OR exported_at IS NOT NULL)
);
CREATE INDEX s_bills_matter ON s_bills(matter_id,created_at);
CREATE UNIQUE INDEX s_bills_correction_branch ON s_bills(corrects_bill_id) WHERE status<>'void';
CREATE TABLE s_billing_sources (
 entry_id TEXT PRIMARY KEY REFERENCES s_entries(id), bill_id TEXT NOT NULL REFERENCES s_bills(id), source_revision TEXT NOT NULL
);
CREATE TRIGGER s_bills_snapshot_immutable BEFORE UPDATE ON s_bills
 WHEN NEW.snapshot<>OLD.snapshot OR NEW.matter_id<>OLD.matter_id OR NEW.corrects_bill_id IS NOT OLD.corrects_bill_id
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR (OLD.artifact IS NOT NULL AND (NEW.artifact IS NOT OLD.artifact OR NEW.artifact_digest IS NOT OLD.artifact_digest
 OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.review_note IS NOT OLD.review_note))
 BEGIN SELECT RAISE(ABORT,'reviewed billing snapshot is immutable'); END;
CREATE TRIGGER s_bills_status_transition BEFORE UPDATE ON s_bills
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('approved','void'))
 OR (OLD.status='approved' AND NEW.status IN ('exported','void')))
 BEGIN SELECT RAISE(ABORT,'invalid bill transition'); END;
CREATE TRIGGER s_bills_immutable_delete BEFORE DELETE ON s_bills BEGIN SELECT RAISE(ABORT,'billing history is immutable'); END;
CREATE TRIGGER s_billing_sources_release BEFORE DELETE ON s_billing_sources
 WHEN NOT EXISTS(SELECT 1 FROM s_bills WHERE id=OLD.bill_id AND status='void')
 BEGIN SELECT RAISE(ABORT,'only void bills release sources'); END;
