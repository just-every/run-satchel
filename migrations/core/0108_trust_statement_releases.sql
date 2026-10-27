-- Installation-local release authority is excluded from portable archives.
CREATE TABLE s_trust_statement_releases(
 id TEXT PRIMARY KEY,
 ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id),
 packet_id TEXT NOT NULL REFERENCES s_trust_packets(id),
 grant_id TEXT NOT NULL REFERENCES s_portal_grants(id),
 recipient TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,reason TEXT NOT NULL,
 revoked_by TEXT,revoked_at TEXT,revoke_reason TEXT,
 UNIQUE(ledger_id,packet_id,grant_id),
 CHECK((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL))
);
CREATE TRIGGER s_trust_statement_release_immutable BEFORE UPDATE ON s_trust_statement_releases
 WHEN NEW.id<>OLD.id OR NEW.ledger_id<>OLD.ledger_id OR NEW.packet_id<>OLD.packet_id OR NEW.grant_id<>OLD.grant_id OR NEW.recipient<>OLD.recipient OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.reason<>OLD.reason OR OLD.revoked_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'statement release is immutable except for one withdrawal'); END;
CREATE TABLE s_retainer_policies(
 id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id),
 threshold_cents INTEGER NOT NULL CHECK(threshold_cents>0),target_cents INTEGER NOT NULL CHECK(target_cents>=threshold_cents),
 approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,reason TEXT NOT NULL
);
CREATE TRIGGER s_retainer_policy_no_update BEFORE UPDATE ON s_retainer_policies BEGIN SELECT RAISE(ABORT,'retainer policy versions are immutable'); END;
CREATE TRIGGER s_retainer_policy_no_delete BEFORE DELETE ON s_retainer_policies BEGIN SELECT RAISE(ABORT,'retainer policy versions are immutable'); END;
CREATE TABLE s_retainer_requests(
 id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id),policy_id TEXT NOT NULL REFERENCES s_retainer_policies(id),
 crossing_entry_id TEXT NOT NULL REFERENCES s_trust_entries(id),grant_id TEXT NOT NULL REFERENCES s_portal_grants(id),
 recipient TEXT NOT NULL,snapshot TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,reason TEXT NOT NULL,
 UNIQUE(policy_id,crossing_entry_id,grant_id)
);
CREATE TRIGGER s_retainer_request_no_update BEFORE UPDATE ON s_retainer_requests BEGIN SELECT RAISE(ABORT,'retainer requests are immutable'); END;
CREATE TRIGGER s_retainer_request_no_delete BEFORE DELETE ON s_retainer_requests BEGIN SELECT RAISE(ABORT,'retainer requests are immutable'); END;
