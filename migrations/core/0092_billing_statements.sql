CREATE TABLE s_billing_statements(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,payer TEXT NOT NULL,snapshot TEXT NOT NULL,pdf_base64 TEXT NOT NULL,pdf_digest TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE s_billing_statement_members(statement_id TEXT NOT NULL REFERENCES s_billing_statements(id),bill_id TEXT NOT NULL REFERENCES s_bills(id),matter_id TEXT NOT NULL REFERENCES s_matters(id),PRIMARY KEY(statement_id,bill_id));
CREATE TRIGGER s_billing_statements_no_update BEFORE UPDATE ON s_billing_statements BEGIN SELECT RAISE(ABORT,'consolidated statements are immutable'); END;
CREATE TRIGGER s_billing_statements_no_delete BEFORE DELETE ON s_billing_statements BEGIN SELECT RAISE(ABORT,'consolidated statements are immutable'); END;
CREATE TRIGGER s_billing_statement_members_no_update BEFORE UPDATE ON s_billing_statement_members BEGIN SELECT RAISE(ABORT,'statement members are immutable'); END;
CREATE TRIGGER s_billing_statement_members_no_delete BEFORE DELETE ON s_billing_statement_members BEGIN SELECT RAISE(ABORT,'statement members are immutable'); END;
