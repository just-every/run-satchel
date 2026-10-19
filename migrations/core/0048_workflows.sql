-- MATTER-004: versioned practice workflows, reviewed runs and once-only generated steps.
CREATE TABLE s_workflows (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger TEXT NOT NULL CHECK(trigger IN ('manual','opening','stage')),
 trigger_stage_id TEXT REFERENCES s_matter_stages(id), current_version INTEGER NOT NULL CHECK(current_version>0),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, CHECK((trigger='stage')=(trigger_stage_id IS NOT NULL))
);
CREATE UNIQUE INDEX s_workflow_name ON s_workflows(lower(name));
CREATE TRIGGER s_workflow_fixed BEFORE UPDATE ON s_workflows WHEN NEW.id IS NOT OLD.id OR NEW.name IS NOT OLD.name OR NEW.trigger IS NOT OLD.trigger OR NEW.trigger_stage_id IS NOT OLD.trigger_stage_id OR NEW.current_version<>OLD.current_version+1
 BEGIN SELECT RAISE(ABORT,'constraint: workflows only gain versions'); END;
CREATE TRIGGER s_workflow_delete BEFORE DELETE ON s_workflows BEGIN SELECT RAISE(ABORT,'constraint: workflows are history'); END;
CREATE TABLE s_workflow_versions (
 workflow_id TEXT NOT NULL REFERENCES s_workflows(id), version INTEGER NOT NULL CHECK(version>0),
 steps TEXT NOT NULL CHECK(json_valid(steps) AND json_type(steps)='array'), note TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workflow_id,version)
);
CREATE TRIGGER s_workflow_version_update BEFORE UPDATE ON s_workflow_versions BEGIN SELECT RAISE(ABORT,'constraint: workflow versions are immutable'); END;
CREATE TRIGGER s_workflow_version_delete BEFORE DELETE ON s_workflow_versions BEGIN SELECT RAISE(ABORT,'constraint: workflow versions are immutable'); END;
CREATE TABLE s_workflow_runs (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES s_workflows(id), matter_id TEXT NOT NULL REFERENCES s_matters(id),
 version INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('proposed','active','stopped')),
 source TEXT NOT NULL CHECK(source IN ('manual','opening','stage')), source_id TEXT,
 approved_steps TEXT NOT NULL CHECK(json_valid(approved_steps) AND json_type(approved_steps)='array'),
 revision TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_workflow_live_run ON s_workflow_runs(matter_id,workflow_id) WHERE status IN ('proposed','active');
CREATE TRIGGER s_workflow_run_delete BEFORE DELETE ON s_workflow_runs BEGIN SELECT RAISE(ABORT,'constraint: workflow runs are history'); END;
-- One generated record per run step: a restart or repeated approval creates nothing twice.
CREATE TABLE s_workflow_run_items (
 run_id TEXT NOT NULL REFERENCES s_workflow_runs(id), step_key TEXT NOT NULL, version INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('task','appointment','document_request','draft_document')), item_id TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(run_id,step_key)
);
CREATE TRIGGER s_workflow_item_update BEFORE UPDATE ON s_workflow_run_items BEGIN SELECT RAISE(ABORT,'constraint: generated steps are history'); END;
CREATE TRIGGER s_workflow_item_delete BEFORE DELETE ON s_workflow_run_items BEGIN SELECT RAISE(ABORT,'constraint: generated steps are history'); END;
CREATE TABLE s_workflow_run_events (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES s_workflow_runs(id), kind TEXT NOT NULL,
 detail TEXT NOT NULL CHECK(json_valid(detail)), actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TRIGGER s_workflow_event_update BEFORE UPDATE ON s_workflow_run_events BEGIN SELECT RAISE(ABORT,'constraint: workflow history is append-only'); END;
CREATE TRIGGER s_workflow_event_delete BEFORE DELETE ON s_workflow_run_events BEGIN SELECT RAISE(ABORT,'constraint: workflow history is append-only'); END;
-- A document request is a recorded request for the client's documents; Satchel sends nothing.
CREATE TABLE s_document_requests (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), title TEXT NOT NULL, due_date TEXT,
 status TEXT NOT NULL CHECK(status IN ('open','received')), document_id TEXT REFERENCES s_documents(id),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, received_by TEXT, received_at TEXT,
 CHECK(status='open' OR document_id IS NOT NULL)
);
CREATE TRIGGER s_document_request_once BEFORE UPDATE ON s_document_requests WHEN OLD.status='received' OR NEW.matter_id IS NOT OLD.matter_id OR NEW.title IS NOT OLD.title OR NEW.created_at IS NOT OLD.created_at
 BEGIN SELECT RAISE(ABORT,'constraint: a received request is final'); END;
CREATE TRIGGER s_document_request_delete BEFORE DELETE ON s_document_requests BEGIN SELECT RAISE(ABORT,'constraint: document requests are history'); END;
