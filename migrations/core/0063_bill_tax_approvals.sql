-- BILL-004: applying tax adds a separate immutable approval, never edits the draft.
CREATE TABLE s_bill_tax_approvals (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id),
 calculation_id TEXT NOT NULL REFERENCES s_tax_calculations(id),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TRIGGER s_bill_tax_approvals_update BEFORE UPDATE ON s_bill_tax_approvals
 BEGIN SELECT RAISE(ABORT,'applied invoice tax is immutable'); END;
CREATE TRIGGER s_bill_tax_approvals_delete BEFORE DELETE ON s_bill_tax_approvals
 BEGIN SELECT RAISE(ABORT,'applied invoice tax is immutable'); END;
