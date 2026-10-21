-- BILL-015: a permanent firm-wide register, including every legacy reservation.
CREATE TABLE s_invoice_schemes (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, terms TEXT NOT NULL CHECK(json_valid(terms)),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_invoice_counter (
 id INTEGER PRIMARY KEY CHECK(id=1), scheme_id TEXT NOT NULL REFERENCES s_invoice_schemes(id),
 next_number INTEGER NOT NULL CHECK(next_number>0), revision TEXT NOT NULL
);
CREATE TABLE s_invoice_numbers (
 number TEXT PRIMARY KEY, bill_id TEXT UNIQUE REFERENCES s_bills(id),
 kind TEXT NOT NULL CHECK(kind IN('legacy','imported','issued','correction')),
 ordinal INTEGER, scheme_id TEXT REFERENCES s_invoice_schemes(id), source TEXT NOT NULL,
 created_at TEXT NOT NULL
);
INSERT INTO s_invoice_numbers(number,bill_id,kind,source,created_at)
 SELECT invoice_number,bill_id,'legacy','Satchel pre-cutover reservation',created_at FROM s_bill_ledes;
CREATE TRIGGER s_invoice_legacy_register AFTER INSERT ON s_bill_ledes
 WHEN NOT EXISTS(SELECT 1 FROM s_invoice_numbers WHERE bill_id=NEW.bill_id AND number=NEW.invoice_number)
 BEGIN INSERT INTO s_invoice_numbers(number,bill_id,kind,source,created_at)
 VALUES(NEW.invoice_number,NEW.bill_id,'legacy','Satchel legacy reservation',NEW.created_at); END;
CREATE TABLE s_invoice_issues (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), number TEXT NOT NULL UNIQUE REFERENCES s_invoice_numbers(number),
 approved_revision TEXT NOT NULL, approved_digest TEXT NOT NULL, snapshot_digest TEXT NOT NULL,
 pdf_base64 TEXT NOT NULL, pdf_digest TEXT NOT NULL, issued_by TEXT NOT NULL, issued_at TEXT NOT NULL,
 scheme_id TEXT REFERENCES s_invoice_schemes(id)
);
CREATE TRIGGER s_invoice_schemes_keep_update BEFORE UPDATE ON s_invoice_schemes BEGIN SELECT RAISE(ABORT,'constraint: invoice schemes are history'); END;
CREATE TRIGGER s_invoice_schemes_keep_delete BEFORE DELETE ON s_invoice_schemes BEGIN SELECT RAISE(ABORT,'constraint: invoice schemes are history'); END;
CREATE TRIGGER s_invoice_numbers_keep_update BEFORE UPDATE ON s_invoice_numbers BEGIN SELECT RAISE(ABORT,'constraint: invoice numbers are permanent'); END;
CREATE TRIGGER s_invoice_numbers_keep_delete BEFORE DELETE ON s_invoice_numbers BEGIN SELECT RAISE(ABORT,'constraint: invoice numbers are permanent'); END;
CREATE TRIGGER s_invoice_issues_keep_update BEFORE UPDATE ON s_invoice_issues BEGIN SELECT RAISE(ABORT,'constraint: issued files are immutable'); END;
CREATE TRIGGER s_invoice_issues_keep_delete BEFORE DELETE ON s_invoice_issues BEGIN SELECT RAISE(ABORT,'constraint: issued files are immutable'); END;
