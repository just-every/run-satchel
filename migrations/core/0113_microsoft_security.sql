-- Installation-local authority and cached credentials never travel in a firm archive.
CREATE TABLE s_microsoft_connector (
 id TEXT PRIMARY KEY CHECK(id='installation'),
 generation INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN('connecting','connected','refused','uncertain','revoked','expired')),
 sponsor_id TEXT NOT NULL,
 sponsor_version INTEGER NOT NULL,
 session_id TEXT NOT NULL,
 configuration_digest TEXT NOT NULL,
 capability TEXT NOT NULL CHECK(capability='directory:read'),
 token_sealed TEXT,
 token_expires_at INTEGER,
 updated_at TEXT NOT NULL,
 outcome TEXT NOT NULL,
 CHECK(status='connected' OR token_sealed IS NULL)
);
CREATE TABLE s_microsoft_jobs (
 id TEXT PRIMARY KEY,
 generation INTEGER NOT NULL,
 sponsor_id TEXT NOT NULL,
 sponsor_version INTEGER NOT NULL,
 session_id TEXT NOT NULL,
 capability TEXT NOT NULL CHECK(capability='directory:read'),
 status TEXT NOT NULL CHECK(status IN('queued','sending','succeeded','refused','uncertain')),
 outcome TEXT NOT NULL,
 created_at TEXT NOT NULL,
 started_at TEXT,
 finished_at TEXT,
 user_count INTEGER,
 has_more INTEGER CHECK(has_more IN(0,1)),
 provider_status INTEGER
);
CREATE INDEX s_microsoft_jobs_status ON s_microsoft_jobs(status,created_at);
