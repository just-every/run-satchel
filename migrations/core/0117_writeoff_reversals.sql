CREATE TABLE s_invoice_writeoff_reversals (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 writeoff_id TEXT NOT NULL REFERENCES s_invoice_writeoffs(id),
 bill_id TEXT NOT NULL REFERENCES s_bills(id), bill_revision TEXT NOT NULL,
 cents INTEGER NOT NULL CHECK(cents>0), reason TEXT NOT NULL,
 approved_by TEXT NOT NULL, approved_operator_id TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX s_invoice_writeoff_reversals_original ON s_invoice_writeoff_reversals(writeoff_id);
CREATE TRIGGER s_invoice_writeoff_reversals_keep_update BEFORE UPDATE ON s_invoice_writeoff_reversals BEGIN SELECT RAISE(ABORT,'constraint: write-off reversals are immutable'); END;
CREATE TRIGGER s_invoice_writeoff_reversals_keep_delete BEFORE DELETE ON s_invoice_writeoff_reversals BEGIN SELECT RAISE(ABORT,'constraint: write-off reversals are immutable'); END;
