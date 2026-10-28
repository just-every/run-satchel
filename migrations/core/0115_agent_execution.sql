CREATE TABLE s_agent_agreements (
 id TEXT PRIMARY KEY, key_id TEXT NOT NULL, processor TEXT NOT NULL, model_revision TEXT NOT NULL,
 agreement_reference TEXT NOT NULL, retention_terms TEXT NOT NULL, training_terms TEXT NOT NULL,
 health_reference TEXT, expires_at TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
 withdrawn_at TEXT
);
CREATE TABLE s_agent_delegations (
 id TEXT PRIMARY KEY, key_id TEXT NOT NULL, agreement_id TEXT NOT NULL, sponsor_id TEXT NOT NULL,
 matter_id TEXT NOT NULL, actions TEXT NOT NULL, recipients TEXT NOT NULL,
 max_jobs INTEGER NOT NULL CHECK(max_jobs>0), used_jobs INTEGER NOT NULL DEFAULT 0,
 spend_cents INTEGER NOT NULL CHECK(spend_cents=0), expires_at TEXT NOT NULL,
 stop_rule TEXT NOT NULL, escalation_email TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
 revoked_at TEXT, revoke_reason TEXT
);
CREATE TABLE s_agent_sources (
 delegation_id TEXT NOT NULL, document_id TEXT NOT NULL, version INTEGER NOT NULL, sha256 TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('matter','research','health')), license_reference TEXT,
 license_expires_at TEXT, permitted_use TEXT, PRIMARY KEY(delegation_id,document_id)
);
CREATE TABLE s_agent_jobs (
 id TEXT PRIMARY KEY, delegation_id TEXT NOT NULL, key_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 action TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
 due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', outcome TEXT NOT NULL DEFAULT 'awaiting_execution',
 proposal_id TEXT, created_at TEXT NOT NULL, finished_at TEXT, UNIQUE(key_id,request_key)
);
CREATE INDEX s_agent_jobs_due ON s_agent_jobs(status,due_at);
ALTER TABLE s_proposals ADD COLUMN delegation_id TEXT;
ALTER TABLE s_proposals ADD COLUMN agreement_id TEXT;
