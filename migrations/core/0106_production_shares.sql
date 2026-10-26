-- Each release binds one approved packet to one native account. Archive restore
-- must omit these grants; recipients require a fresh principal authorization.
CREATE TABLE s_production_shares (
 id TEXT PRIMARY KEY,
 production_id TEXT NOT NULL REFERENCES s_document_productions(id),
 packet_sha256 TEXT NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES oa_operators(id), recipient_email TEXT NOT NULL,
 authorized_by_id TEXT NOT NULL REFERENCES oa_operators(id), authorized_by TEXT NOT NULL,
 authorizer_version INTEGER NOT NULL,
 authorized_at TEXT NOT NULL, expires_at TEXT NOT NULL, reason TEXT NOT NULL,
 opened_at TEXT, recalled_at TEXT, recalled_by TEXT, recall_reason TEXT,
 CHECK(expires_at>authorized_at),
 CHECK(opened_at IS NULL OR recalled_at IS NULL)
);
CREATE INDEX s_production_shares_packet ON s_production_shares(production_id,authorized_at);
CREATE TABLE s_production_delivery_receipts (
 id TEXT PRIMARY KEY, share_id TEXT NOT NULL REFERENCES s_production_shares(id),
 recipient_id TEXT NOT NULL, session_id TEXT NOT NULL,
 sha256 TEXT NOT NULL, size INTEGER NOT NULL, served_at TEXT NOT NULL
);
CREATE INDEX s_production_receipts_share ON s_production_delivery_receipts(share_id,served_at);
CREATE TRIGGER s_production_share_immutable BEFORE UPDATE ON s_production_shares
 WHEN NEW.id IS NOT OLD.id OR NEW.production_id IS NOT OLD.production_id
 OR NEW.packet_sha256 IS NOT OLD.packet_sha256 OR NEW.recipient_id IS NOT OLD.recipient_id
 OR NEW.recipient_email IS NOT OLD.recipient_email OR NEW.authorized_by_id IS NOT OLD.authorized_by_id
 OR NEW.authorized_by IS NOT OLD.authorized_by OR NEW.authorizer_version IS NOT OLD.authorizer_version
 OR NEW.authorized_at IS NOT OLD.authorized_at OR NEW.expires_at IS NOT OLD.expires_at OR NEW.reason IS NOT OLD.reason
 OR (OLD.opened_at IS NOT NULL AND NEW.opened_at IS NOT OLD.opened_at)
 OR (OLD.recalled_at IS NOT NULL AND (NEW.recalled_at IS NOT OLD.recalled_at OR NEW.recalled_by IS NOT OLD.recalled_by OR NEW.recall_reason IS NOT OLD.recall_reason))
 BEGIN SELECT RAISE(ABORT,'production release is immutable'); END;
CREATE TRIGGER s_production_receipt_no_update BEFORE UPDATE ON s_production_delivery_receipts
 BEGIN SELECT RAISE(ABORT,'production delivery receipt is immutable'); END;
CREATE TRIGGER s_production_receipt_no_delete BEFORE DELETE ON s_production_delivery_receipts
 BEGIN SELECT RAISE(ABORT,'production delivery receipt is immutable'); END;
