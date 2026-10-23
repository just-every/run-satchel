-- CLIENT-004: a lawyer expressly shares one task, event or confirmed deadline with a client who holds a portal grant.
-- The client may acknowledge any of them and mark a shared client task done; neither changes the firm's own record.
CREATE TABLE s_client_shares(id TEXT PRIMARY KEY,matter_id TEXT NOT NULL REFERENCES s_matters(id),kind TEXT NOT NULL CHECK(kind IN('task','event','deadline')),record_id TEXT NOT NULL,instructions TEXT NOT NULL,shared_by TEXT NOT NULL,shared_at TEXT NOT NULL,revoked_by TEXT,revoked_at TEXT);
CREATE UNIQUE INDEX s_client_share_open ON s_client_shares(kind,record_id) WHERE revoked_at IS NULL;
CREATE TABLE s_client_acks(id TEXT PRIMARY KEY,share_id TEXT NOT NULL REFERENCES s_client_shares(id),kind TEXT NOT NULL CHECK(kind IN('acknowledged','completed')),client_email TEXT NOT NULL,note TEXT NOT NULL,at TEXT NOT NULL);
CREATE UNIQUE INDEX s_client_ack_once ON s_client_acks(share_id,client_email,kind);
CREATE TRIGGER s_client_ack_update BEFORE UPDATE ON s_client_acks BEGIN SELECT RAISE(ABORT,'constraint: client acknowledgments are append-only'); END;
CREATE TRIGGER s_client_ack_delete BEFORE DELETE ON s_client_acks BEGIN SELECT RAISE(ABORT,'constraint: client acknowledgments are append-only'); END;
