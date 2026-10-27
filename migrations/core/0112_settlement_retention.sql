-- Retain financial identities and attributed approvals while allowing only the
-- principal's journalled, irreversible disposal of restricted settlement text.
CREATE TABLE s_settlement_erasures (
 matter_id TEXT PRIMARY KEY REFERENCES s_matters(id),
 retention_id TEXT NOT NULL REFERENCES s_retention(id),
 reason TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TRIGGER s_settlement_erasure_immutable BEFORE UPDATE ON s_settlement_erasures BEGIN SELECT RAISE(ABORT,'Settlement erasure journals are immutable'); END;
CREATE TRIGGER s_settlement_erasure_retained BEFORE DELETE ON s_settlement_erasures BEGIN SELECT RAISE(ABORT,'Settlement erasure journals are retained'); END;

DROP TRIGGER s_contingency_terms_immutable;
CREATE TRIGGER s_contingency_terms_immutable BEFORE UPDATE ON s_contingency_terms
WHEN NOT (NEW.id IS OLD.id AND NEW.matter_id IS OLD.matter_id AND NEW.version IS OLD.version
 AND NEW.created_by IS OLD.created_by AND NEW.created_at IS OLD.created_at
 AND OLD.terms <> '{}' AND NEW.terms = '{}'
 AND EXISTS(SELECT 1 FROM s_settlement_erasures WHERE matter_id=OLD.matter_id))
BEGIN SELECT RAISE(ABORT,'Reviewed terms are immutable except journalled erasure'); END;

DROP TRIGGER s_settlement_statements_immutable;
CREATE TRIGGER s_settlement_statements_immutable BEFORE UPDATE ON s_settlement_statements
WHEN NOT (NEW.id IS OLD.id AND NEW.matter_id IS OLD.matter_id AND NEW.version IS OLD.version
 AND NEW.terms_id IS OLD.terms_id AND NEW.created_by IS OLD.created_by AND NEW.created_at IS OLD.created_at
 AND OLD.snapshot <> '{}' AND NEW.snapshot = '{}'
 AND EXISTS(SELECT 1 FROM s_settlement_erasures WHERE matter_id=OLD.matter_id))
BEGIN SELECT RAISE(ABORT,'Settlement statements are immutable except journalled erasure'); END;

DROP TRIGGER s_settlement_approvals_immutable;
CREATE TRIGGER s_settlement_approvals_immutable BEFORE UPDATE ON s_settlement_approvals
WHEN NOT (NEW.statement_id IS OLD.statement_id AND NEW.capacity IS OLD.capacity AND NEW.actor IS OLD.actor
 AND NEW.at IS OLD.at AND NEW.authority_epoch IS OLD.authority_epoch AND NEW.policy_version IS OLD.policy_version
 AND OLD.note <> '' AND NEW.note = ''
 AND EXISTS(SELECT 1 FROM s_settlement_statements s JOIN s_settlement_erasures e ON e.matter_id=s.matter_id WHERE s.id=OLD.statement_id))
BEGIN SELECT RAISE(ABORT,'Settlement approvals are immutable except journalled erasure'); END;

CREATE TRIGGER s_contingency_terms_retained BEFORE DELETE ON s_contingency_terms BEGIN SELECT RAISE(ABORT,'Reviewed terms identities are retained'); END;
CREATE TRIGGER s_settlement_statements_retained BEFORE DELETE ON s_settlement_statements BEGIN SELECT RAISE(ABORT,'Settlement statement identities are retained'); END;
CREATE TRIGGER s_settlement_approvals_retained BEFORE DELETE ON s_settlement_approvals BEGIN SELECT RAISE(ABORT,'Settlement approval identities are retained'); END;
