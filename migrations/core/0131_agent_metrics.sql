-- Preparation provenance contains identities and revisions, never source bytes.
CREATE TABLE s_agent_provenance (
 origin_kind TEXT NOT NULL CHECK(origin_kind IN ('proposal','job','refusal')),
 origin_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at TEXT NOT NULL,
 PRIMARY KEY(origin_kind,origin_id)
);
CREATE TRIGGER s_agent_provenance_update BEFORE UPDATE ON s_agent_provenance BEGIN SELECT RAISE(ABORT,'preparation provenance is immutable'); END;
CREATE TRIGGER s_agent_provenance_delete BEFORE DELETE ON s_agent_provenance BEGIN SELECT RAISE(ABORT,'preparation provenance is immutable'); END;
CREATE TABLE s_agent_metric_reviews (
 id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, verdict TEXT NOT NULL CHECK(verdict IN ('accurate','inaccurate')),
 reason TEXT NOT NULL, supersedes_id TEXT UNIQUE, reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_agent_metric_first_review ON s_agent_metric_reviews(proposal_id) WHERE supersedes_id IS NULL;
CREATE TRIGGER s_agent_metric_reviews_update BEFORE UPDATE ON s_agent_metric_reviews BEGIN SELECT RAISE(ABORT,'source reviews are append only'); END;
CREATE TRIGGER s_agent_metric_reviews_delete BEFORE DELETE ON s_agent_metric_reviews BEGIN SELECT RAISE(ABORT,'source reviews are append only'); END;
CREATE TABLE s_agent_recoveries (
 entry_id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, entry_revision TEXT NOT NULL,
 reason TEXT NOT NULL, reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TRIGGER s_agent_recoveries_update BEFORE UPDATE ON s_agent_recoveries BEGIN SELECT RAISE(ABORT,'recovery attribution is immutable'); END;
CREATE TRIGGER s_agent_recoveries_delete BEFORE DELETE ON s_agent_recoveries BEGIN SELECT RAISE(ABORT,'recovery attribution is immutable'); END;
CREATE TABLE s_agent_metric_studies (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
 label TEXT NOT NULL, basis TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TRIGGER s_agent_metric_studies_update BEFORE UPDATE ON s_agent_metric_studies BEGIN SELECT RAISE(ABORT,'measured cohorts are immutable'); END;
CREATE TRIGGER s_agent_metric_studies_delete BEFORE DELETE ON s_agent_metric_studies BEGIN SELECT RAISE(ABORT,'measured cohorts are immutable'); END;
