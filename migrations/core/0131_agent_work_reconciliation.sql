-- Native billing identities only; no copied document or provider context.
CREATE TABLE s_agent_work_reconciliations (
 id TEXT PRIMARY KEY, delegation_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 inputs TEXT NOT NULL CHECK(json_valid(inputs)), created_at TEXT NOT NULL
);
CREATE TABLE s_agent_work_proposals (
 proposal_id TEXT PRIMARY KEY REFERENCES s_proposals(id),
 reconciliation_id TEXT NOT NULL REFERENCES s_agent_work_reconciliations(id),
 selected_sources TEXT NOT NULL CHECK(json_valid(selected_sources))
);
CREATE TRIGGER s_agent_work_reconciliations_immutable_update BEFORE UPDATE ON s_agent_work_reconciliations BEGIN SELECT RAISE(ABORT,'recommendation provenance is immutable'); END;
CREATE TRIGGER s_agent_work_reconciliations_immutable_delete BEFORE DELETE ON s_agent_work_reconciliations BEGIN SELECT RAISE(ABORT,'recommendation provenance is immutable'); END;
CREATE TRIGGER s_agent_work_proposals_immutable_update BEFORE UPDATE ON s_agent_work_proposals BEGIN SELECT RAISE(ABORT,'recommendation sources are immutable'); END;
CREATE TRIGGER s_agent_work_proposals_immutable_delete BEFORE DELETE ON s_agent_work_proposals BEGIN SELECT RAISE(ABORT,'recommendation sources are immutable'); END;
