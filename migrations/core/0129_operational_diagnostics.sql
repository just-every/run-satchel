-- Installation observations and restore authority never travel in archives.
ALTER TABLE s_microsoft_connector ADD COLUMN last_success_at TEXT;
ALTER TABLE s_microsoft_connector ADD COLUMN observed_token_expires_at INTEGER;
UPDATE s_microsoft_connector SET observed_token_expires_at=token_expires_at;
CREATE TABLE s_recovery_receipts(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('backup','restore')),
 sha256 TEXT NOT NULL, archive_hash TEXT, content_hash TEXT,
 bytes INTEGER NOT NULL CHECK(bytes>=0), verified_at TEXT NOT NULL
);
CREATE TABLE s_recovery_authority(
 channel TEXT PRIMARY KEY CHECK(channel IN('sending','charging')),
 restore_id TEXT NOT NULL, restored_at TEXT NOT NULL,
 authorized_by TEXT, authorized_at TEXT, reason TEXT
);
CREATE TABLE s_scheduler_observation(
 id INTEGER PRIMARY KEY CHECK(id=1), scheduled_at TEXT NOT NULL,
 started_at TEXT NOT NULL, completed_at TEXT, outcome TEXT NOT NULL CHECK(outcome IN('running','succeeded','failed'))
);
