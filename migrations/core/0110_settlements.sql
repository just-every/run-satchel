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
 authority_epoch TEXT NOT NULL, policy_version INTEGER NOT NULL,
 PRIMARY KEY(statement_id,capacity,authority_epoch,policy_version)
);
CREATE TRIGGER s_contingency_terms_immutable BEFORE UPDATE ON s_contingency_terms BEGIN SELECT RAISE(ABORT,'Reviewed terms are immutable'); END;
CREATE TRIGGER s_settlement_statements_immutable BEFORE UPDATE ON s_settlement_statements BEGIN SELECT RAISE(ABORT,'Settlement statements are immutable'); END;
CREATE TRIGGER s_settlement_approvals_immutable BEFORE UPDATE ON s_settlement_approvals BEGIN SELECT RAISE(ABORT,'Settlement approvals are immutable'); END;
CREATE TABLE s_settlement_authority(id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL);
INSERT INTO s_settlement_authority VALUES(1,lower(hex(randomblob(32))));
CREATE TABLE s_settlement_policy(version INTEGER PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), reason TEXT NOT NULL, scope TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, authority_epoch TEXT NOT NULL);
CREATE TRIGGER s_settlement_policy_immutable BEFORE UPDATE ON s_settlement_policy BEGIN SELECT RAISE(ABORT,'Settlement authority decisions are immutable'); END;
CREATE TABLE s_settlement_disbursements(transaction_id TEXT PRIMARY KEY REFERENCES s_trust_transactions(id), statement_id TEXT NOT NULL REFERENCES s_settlement_statements(id), allocation_index INTEGER NOT NULL);
CREATE TRIGGER s_settlement_disbursements_immutable BEFORE UPDATE ON s_settlement_disbursements BEGIN SELECT RAISE(ABORT,'Settlement allocation bindings are immutable'); END;
