-- BILL-004: native calculation reviews, not issued invoice tax.
CREATE TABLE s_tax_rules (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 terms TEXT NOT NULL CHECK(json_valid(terms)), reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE s_tax_calculations (
 id TEXT PRIMARY KEY, bill_id TEXT NOT NULL REFERENCES s_bills(id),
 matter_id TEXT NOT NULL REFERENCES s_matters(id), bill_revision TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX s_tax_rules_matter ON s_tax_rules(matter_id);
CREATE INDEX s_tax_calculations_bill ON s_tax_calculations(bill_id);
CREATE TRIGGER s_tax_rules_update BEFORE UPDATE ON s_tax_rules BEGIN SELECT RAISE(ABORT,'reviewed tax rules are immutable'); END;
CREATE TRIGGER s_tax_rules_delete BEFORE DELETE ON s_tax_rules BEGIN SELECT RAISE(ABORT,'reviewed tax rules are immutable'); END;
CREATE TRIGGER s_tax_calculations_update BEFORE UPDATE ON s_tax_calculations BEGIN SELECT RAISE(ABORT,'tax calculations are immutable'); END;
CREATE TRIGGER s_tax_calculations_delete BEFORE DELETE ON s_tax_calculations BEGIN SELECT RAISE(ABORT,'tax calculations are immutable'); END;
