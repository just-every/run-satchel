CREATE TABLE s_contingency_terms (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 version INTEGER NOT NULL, terms TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(matter_id,version)
);
CREATE TABLE s_settlement_statements (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 version INTEGER NOT NULL, terms_id TEXT NOT NULL REFERENCES s_contingency_terms(id),
 snapshot TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(matter_id,version)
);
CREATE TABLE s_settlement_approvals (
 statement_id TEXT NOT NULL REFERENCES s_settlement_statements(id),
 capacity TEXT NOT NULL CHECK(capacity IN('counsel','finance')),
 actor TEXT NOT NULL, note TEXT NOT NULL, at TEXT NOT NULL,
 PRIMARY KEY(statement_id,capacity)
);
CREATE TRIGGER s_contingency_terms_immutable BEFORE UPDATE ON s_contingency_terms BEGIN SELECT RAISE(ABORT,'Reviewed terms are immutable'); END;
CREATE TRIGGER s_settlement_statements_immutable BEFORE UPDATE ON s_settlement_statements BEGIN SELECT RAISE(ABORT,'Settlement statements are immutable'); END;
CREATE TRIGGER s_settlement_approvals_immutable BEFORE UPDATE ON s_settlement_approvals BEGIN SELECT RAISE(ABORT,'Settlement approvals are immutable'); END;
