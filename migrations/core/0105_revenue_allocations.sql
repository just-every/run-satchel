CREATE TABLE s_revenue_rules (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 version INTEGER NOT NULL, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 basis TEXT NOT NULL CHECK(basis='proportional_fee_receipts'), reference TEXT NOT NULL,
 splits TEXT NOT NULL, source_document_id TEXT NOT NULL REFERENCES s_documents(id),
 source_version INTEGER NOT NULL, source_digest TEXT NOT NULL,
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, UNIQUE(matter_id,version)
);
CREATE TABLE s_revenue_allocations (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 source_key TEXT NOT NULL UNIQUE, bill_id TEXT NOT NULL REFERENCES s_bills(id),
 rule_id TEXT NOT NULL REFERENCES s_revenue_rules(id),
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 snapshot TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TRIGGER s_revenue_rules_keep_update BEFORE UPDATE ON s_revenue_rules BEGIN SELECT RAISE(ABORT,'constraint: revenue approval history is immutable'); END;
CREATE TRIGGER s_revenue_rules_keep_delete BEFORE DELETE ON s_revenue_rules BEGIN SELECT RAISE(ABORT,'constraint: revenue approval history is immutable'); END;
CREATE TRIGGER s_revenue_allocations_keep_update BEFORE UPDATE ON s_revenue_allocations BEGIN SELECT RAISE(ABORT,'constraint: revenue allocation history is immutable'); END;
CREATE TRIGGER s_revenue_allocations_keep_delete BEFORE DELETE ON s_revenue_allocations BEGIN SELECT RAISE(ABORT,'constraint: revenue allocation history is immutable'); END;
