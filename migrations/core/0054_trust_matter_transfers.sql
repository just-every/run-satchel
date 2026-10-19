CREATE TABLE s_trust_matter_transfers (
 id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,
 original_transfer_id TEXT UNIQUE REFERENCES s_trust_matter_transfers(id),
 from_ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id),to_ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id),
 client_id TEXT NOT NULL REFERENCES s_parties(id),cents INTEGER NOT NULL CHECK(typeof(cents)='integer' AND cents>0),
 revision TEXT NOT NULL,required_approvals INTEGER NOT NULL CHECK(required_approvals IN(1,2)),
 effective_date TEXT NOT NULL,reason TEXT NOT NULL,
 source_document_id TEXT NOT NULL REFERENCES s_documents(id),source_version INTEGER NOT NULL,source_digest TEXT NOT NULL,
 policy_revision TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 CHECK(from_ledger_id<>to_ledger_id)
);
CREATE TABLE s_trust_matter_transfer_actions (
 id TEXT PRIMARY KEY,transfer_id TEXT NOT NULL REFERENCES s_trust_matter_transfers(id),
 kind TEXT NOT NULL CHECK(kind IN('approved','declined','posted','submitted','cleared','not_executed')),
 actor TEXT NOT NULL,note TEXT NOT NULL,bank_reference TEXT,destination_bank_reference TEXT,bank_date TEXT,destination_bank_date TEXT,debit_cents INTEGER,credit_cents INTEGER,
 source_document_id TEXT REFERENCES s_documents(id),source_version INTEGER,source_digest TEXT,
 destination_document_id TEXT REFERENCES s_documents(id),destination_version INTEGER,destination_digest TEXT,at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_matter_transfer_approval ON s_trust_matter_transfer_actions(transfer_id,actor) WHERE kind='approved';
CREATE UNIQUE INDEX s_matter_transfer_outcome ON s_trust_matter_transfer_actions(transfer_id,kind) WHERE kind<>'approved';
CREATE TRIGGER s_matter_transfers_no_update BEFORE UPDATE ON s_trust_matter_transfers BEGIN SELECT RAISE(ABORT,'matter transfers are immutable'); END;
CREATE TRIGGER s_matter_transfers_no_delete BEFORE DELETE ON s_trust_matter_transfers BEGIN SELECT RAISE(ABORT,'matter transfers are immutable'); END;
CREATE TRIGGER s_matter_transfer_actions_no_update BEFORE UPDATE ON s_trust_matter_transfer_actions BEGIN SELECT RAISE(ABORT,'matter transfer evidence is immutable'); END;
CREATE TRIGGER s_matter_transfer_actions_no_delete BEFORE DELETE ON s_trust_matter_transfer_actions BEGIN SELECT RAISE(ABORT,'matter transfer evidence is immutable'); END;
DROP VIEW s_trust_entry_sources;
CREATE VIEW s_trust_entry_sources AS
 SELECT * FROM (
 SELECT e.id entry_id,'opening' source_kind,o.id source_record_id,o.source_document_id,o.source_version,o.source_digest,o.note reason,NULL original_entry_id,NULL bank_reference
 FROM s_trust_entries e JOIN s_trust_openings o ON o.id=e.source_id
 UNION ALL SELECT e.id,'transaction',t.id,t.source_document_id,t.source_version,t.source_digest,t.purpose,NULL,t.bank_reference
 FROM s_trust_entries e JOIN s_trust_transactions t ON t.id=e.source_id
 UNION ALL SELECT e.id,'earned_fee_transfer',t.id,a.source_document_id,a.source_version,a.source_digest,a.note,NULL,a.bank_reference
 FROM s_trust_entries e JOIN s_trust_transfers t ON e.source_id IN(t.id||':trust',t.id||':operating') JOIN s_trust_transfer_actions a ON a.transfer_id=t.id AND a.kind='cleared'
 UNION ALL SELECT e.id,'earned_fee_reversal',r.id,a.source_document_id,a.source_version,a.source_digest,r.reason,p.trust_entry_id,a.bank_reference
 FROM s_trust_entries e JOIN s_trust_reversals r ON e.source_id IN(r.id||':trust',r.id||':operating') JOIN s_trust_reversal_actions a ON a.reversal_id=r.id AND a.kind='cleared' JOIN s_operating_payments p ON p.transfer_id=r.transfer_id
 UNION ALL SELECT e.id,'journal_reversal',r.id,r.source_document_id,r.source_version,r.source_digest,r.reason,r.original_entry_id,NULL
 FROM s_trust_entries e JOIN s_trust_journal_reversals r ON r.id=e.source_id
 )
 UNION ALL SELECT e.id,'matter_authorization',t.id,t.source_document_id,t.source_version,t.source_digest,t.reason,
 CASE WHEN t.original_transfer_id IS NULL THEN NULL WHEN e.ledger_id=t.from_ledger_id THEN t.original_transfer_id||':to' ELSE t.original_transfer_id||':from' END,NULL
 FROM s_trust_entries e JOIN s_trust_matter_transfers t ON e.source_id IN(t.id||':from',t.id||':to')
 UNION ALL SELECT e.id,'matter_bank_result',t.id,
 CASE WHEN e.ledger_id=t.from_ledger_id THEN a.source_document_id ELSE a.destination_document_id END,
 CASE WHEN e.ledger_id=t.from_ledger_id THEN a.source_version ELSE a.destination_version END,
 CASE WHEN e.ledger_id=t.from_ledger_id THEN a.source_digest ELSE a.destination_digest END,a.note,NULL,
 CASE WHEN e.ledger_id=t.from_ledger_id THEN a.bank_reference ELSE a.destination_bank_reference END
 FROM s_trust_entries e JOIN s_trust_matter_transfers t ON e.source_id IN(t.id||':from',t.id||':to') JOIN s_trust_matter_transfer_actions a ON a.transfer_id=t.id AND a.kind='cleared';
