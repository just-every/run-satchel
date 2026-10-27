-- Explicit sequence values travel with archives; SQLite row order does not.
CREATE TABLE s_trust_posting_order(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE REFERENCES s_trust_entries(id)
);
INSERT INTO s_trust_posting_order(entry_id) SELECT id FROM s_trust_entries ORDER BY rowid;
CREATE TRIGGER s_trust_posting_order_capture AFTER INSERT ON s_trust_entries
 BEGIN INSERT INTO s_trust_posting_order(entry_id) VALUES(NEW.id); END;
CREATE TRIGGER s_trust_posting_order_no_update BEFORE UPDATE ON s_trust_posting_order
 BEGIN SELECT RAISE(ABORT,'trust posting order is immutable'); END;
CREATE TRIGGER s_trust_posting_order_no_delete BEFORE DELETE ON s_trust_posting_order
 BEGIN SELECT RAISE(ABORT,'trust posting order is immutable'); END;

CREATE TABLE s_retainer_policy_order(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 policy_id TEXT NOT NULL UNIQUE REFERENCES s_retainer_policies(id)
);
INSERT INTO s_retainer_policy_order(policy_id) SELECT id FROM s_retainer_policies ORDER BY rowid;
CREATE TRIGGER s_retainer_policy_order_capture AFTER INSERT ON s_retainer_policies
 BEGIN INSERT INTO s_retainer_policy_order(policy_id) VALUES(NEW.id); END;
CREATE TRIGGER s_retainer_policy_order_no_update BEFORE UPDATE ON s_retainer_policy_order
 BEGIN SELECT RAISE(ABORT,'retainer policy order is immutable'); END;
CREATE TRIGGER s_retainer_policy_order_no_delete BEFORE DELETE ON s_retainer_policy_order
 BEGIN SELECT RAISE(ABORT,'retainer policy order is immutable'); END;
