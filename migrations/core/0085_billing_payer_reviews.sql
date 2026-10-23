CREATE TABLE s_billing_payer_reviews(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,bill_id TEXT NOT NULL REFERENCES s_bills(id),matter_id TEXT NOT NULL REFERENCES s_matters(id),snapshot TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_billing_payer_reviews_no_update BEFORE UPDATE ON s_billing_payer_reviews BEGIN SELECT RAISE(ABORT,'payer and FX reviews are immutable'); END;
CREATE TRIGGER s_billing_payer_reviews_no_delete BEFORE DELETE ON s_billing_payer_reviews BEGIN SELECT RAISE(ABORT,'payer and FX reviews are immutable'); END;
