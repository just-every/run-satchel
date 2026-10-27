CREATE TABLE s_mfa (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 secret_sealed TEXT NOT NULL,
 passphrase_salt TEXT NOT NULL,
 passphrase_hash TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 last_counter INTEGER NOT NULL DEFAULT -1,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 blocked_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TABLE s_mfa_sessions (
 session_id TEXT PRIMARY KEY REFERENCES oa_sessions(id),
 operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 verified_at INTEGER NOT NULL
);
