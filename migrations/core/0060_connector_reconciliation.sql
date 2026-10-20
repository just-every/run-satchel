-- Safe native evidence: credential material and delivery queues remain local.
-- References are identifiers rather than foreign keys so archived evidence survives.
CREATE TABLE s_connector_reconciliations(
 integration_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 attempt_sequence INTEGER NOT NULL CHECK(attempt_sequence>0),
 decision TEXT NOT NULL CHECK(decision IN('received','not_received')),
 external_reference TEXT NOT NULL CHECK(length(trim(external_reference))>0),
 evidence TEXT NOT NULL CHECK(length(trim(evidence))>0),
 evidence_source TEXT NOT NULL DEFAULT 'principal-recorded' CHECK(evidence_source='principal-recorded'),
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL,
 PRIMARY KEY(integration_id,event_id,attempt_sequence)
);
CREATE TRIGGER s_connector_reconciliations_no_update BEFORE UPDATE ON s_connector_reconciliations BEGIN SELECT RAISE(ABORT,'constraint: connector reconciliation history is append-only'); END;
CREATE TRIGGER s_connector_reconciliations_no_delete BEFORE DELETE ON s_connector_reconciliations BEGIN SELECT RAISE(ABORT,'constraint: connector reconciliation history is append-only'); END;
