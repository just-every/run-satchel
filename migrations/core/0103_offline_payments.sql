CREATE TABLE s_offline_receipts (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 payer TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN('cash','check','wire','ach')),
 reference TEXT NOT NULL, received_date TEXT NOT NULL, deposit_date TEXT NOT NULL,
 operating_account_id TEXT NOT NULL REFERENCES s_trust_accounts(id), cents INTEGER NOT NULL CHECK(cents>0),
 actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE s_offline_actions (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES s_offline_receipts(id),
 kind TEXT NOT NULL CHECK(kind IN('allocate','credit','bounce')), reason TEXT NOT NULL,
 actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_offline_one_bounce ON s_offline_actions(receipt_id) WHERE kind='bounce';
CREATE TABLE s_offline_allocations (
 id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL REFERENCES s_offline_receipts(id),
 action_id TEXT NOT NULL REFERENCES s_offline_actions(id), bill_id TEXT NOT NULL REFERENCES s_bills(id),
 cents INTEGER NOT NULL CHECK(cents>0)
);
CREATE TABLE s_offline_releases (
 allocation_id TEXT PRIMARY KEY REFERENCES s_offline_allocations(id),
 action_id TEXT NOT NULL REFERENCES s_offline_actions(id)
);
CREATE TABLE s_invoice_writeoffs (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 bill_id TEXT NOT NULL REFERENCES s_bills(id), cents INTEGER NOT NULL CHECK(cents>0),
 reason TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TRIGGER s_offline_receipts_keep_update BEFORE UPDATE ON s_offline_receipts BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_receipts_keep_delete BEFORE DELETE ON s_offline_receipts BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_actions_keep_update BEFORE UPDATE ON s_offline_actions BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_actions_keep_delete BEFORE DELETE ON s_offline_actions BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_allocations_keep_update BEFORE UPDATE ON s_offline_allocations BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_allocations_keep_delete BEFORE DELETE ON s_offline_allocations BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_releases_keep_update BEFORE UPDATE ON s_offline_releases BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_offline_releases_keep_delete BEFORE DELETE ON s_offline_releases BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_invoice_writeoffs_keep_update BEFORE UPDATE ON s_invoice_writeoffs BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
CREATE TRIGGER s_invoice_writeoffs_keep_delete BEFORE DELETE ON s_invoice_writeoffs BEGIN SELECT RAISE(ABORT,'constraint: offline money history is immutable'); END;
