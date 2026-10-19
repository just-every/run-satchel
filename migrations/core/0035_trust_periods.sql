CREATE TABLE s_trust_periods(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES s_trust_accounts(id),
 start_date TEXT NOT NULL,end_date TEXT NOT NULL CHECK(start_date<=end_date),
 closing_balance_cents INTEGER NOT NULL CHECK(typeof(closing_balance_cents)='integer'),
 source_document_id TEXT NOT NULL REFERENCES s_documents(id),source_version INTEGER NOT NULL,
 source_digest TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(account_id,start_date,end_date)
);
CREATE TRIGGER s_trust_periods_no_overlap BEFORE INSERT ON s_trust_periods
 WHEN EXISTS(SELECT 1 FROM s_trust_periods p WHERE p.account_id=NEW.account_id AND p.start_date<=NEW.end_date AND p.end_date>=NEW.start_date)
 BEGIN SELECT RAISE(ABORT,'trust statement periods cannot overlap'); END;
CREATE TABLE s_trust_packets(
 id TEXT PRIMARY KEY,period_id TEXT NOT NULL REFERENCES s_trust_periods(id),version INTEGER NOT NULL CHECK(version>0),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),digest TEXT NOT NULL,report_digest TEXT NOT NULL,
 balanced INTEGER NOT NULL CHECK(balanced IN(0,1)),correction_note TEXT NOT NULL,
 signed_by TEXT NOT NULL,signed_at TEXT NOT NULL,
 source_document_id TEXT NOT NULL REFERENCES s_documents(id),source_version INTEGER NOT NULL,source_digest TEXT NOT NULL,
 UNIQUE(period_id,version),CHECK(balanced=1 OR length(trim(correction_note))>0)
);
CREATE TABLE s_trust_period_events(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,
 period_id TEXT NOT NULL REFERENCES s_trust_periods(id),packet_id TEXT NOT NULL REFERENCES s_trust_packets(id),
 kind TEXT NOT NULL CHECK(kind IN('signed','reopened')),actor TEXT NOT NULL,at TEXT NOT NULL,reason TEXT NOT NULL,
 source_document_id TEXT NOT NULL REFERENCES s_documents(id),source_version INTEGER NOT NULL,source_digest TEXT NOT NULL,
 CHECK(kind<>'reopened' OR length(trim(reason))>0)
);
CREATE UNIQUE INDEX s_trust_packet_signed ON s_trust_period_events(packet_id) WHERE kind='signed';
CREATE UNIQUE INDEX s_trust_packet_reopened ON s_trust_period_events(packet_id) WHERE kind='reopened';
CREATE INDEX s_trust_period_account ON s_trust_periods(account_id,end_date);
CREATE INDEX s_trust_period_event_order ON s_trust_period_events(period_id,sequence);
CREATE TRIGGER s_trust_period_event_transition BEFORE INSERT ON s_trust_period_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM s_trust_packets p WHERE p.id=NEW.packet_id AND p.period_id=NEW.period_id)
 THEN RAISE(ABORT,'packet does not belong to statement period') END;
 SELECT CASE WHEN NEW.kind='signed' AND COALESCE((SELECT kind FROM s_trust_period_events WHERE period_id=NEW.period_id ORDER BY sequence DESC LIMIT 1),'reopened')<>'reopened'
 THEN RAISE(ABORT,'reopen the signed period first') END;
 SELECT CASE WHEN NEW.kind='reopened' AND NOT EXISTS(SELECT 1 FROM s_trust_period_events e WHERE e.sequence=(SELECT MAX(sequence) FROM s_trust_period_events WHERE period_id=NEW.period_id) AND e.kind='signed' AND e.packet_id=NEW.packet_id)
 THEN RAISE(ABORT,'only the current signed packet can be reopened') END;
END;
CREATE TRIGGER s_trust_entries_closed_period BEFORE INSERT ON s_trust_entries
 WHEN EXISTS(SELECT 1 FROM s_trust_periods p WHERE p.account_id=NEW.account_id AND NEW.effective_date<=p.end_date AND (SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1)='signed')
 BEGIN SELECT RAISE(ABORT,'closed trust period requires authorized reopen'); END;
CREATE TRIGGER s_trust_clearings_closed_period BEFORE INSERT ON s_trust_clearings
 WHEN EXISTS(SELECT 1 FROM s_trust_entries e JOIN s_trust_periods p ON p.account_id=e.account_id WHERE e.id=NEW.entry_id AND (e.effective_date<=p.end_date OR NEW.cleared_date<=p.end_date) AND (SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1)='signed')
 BEGIN SELECT RAISE(ABORT,'closed trust period requires authorized reopen'); END;
CREATE TRIGGER s_trust_periods_no_update BEFORE UPDATE ON s_trust_periods BEGIN SELECT RAISE(ABORT,'trust statement originals are immutable'); END;
CREATE TRIGGER s_trust_periods_no_delete BEFORE DELETE ON s_trust_periods BEGIN SELECT RAISE(ABORT,'trust statement originals are immutable'); END;
CREATE TRIGGER s_trust_packets_no_update BEFORE UPDATE ON s_trust_packets BEGIN SELECT RAISE(ABORT,'signed trust packets are immutable'); END;
CREATE TRIGGER s_trust_packets_no_delete BEFORE DELETE ON s_trust_packets BEGIN SELECT RAISE(ABORT,'signed trust packets are immutable'); END;
CREATE TRIGGER s_trust_period_events_no_update BEFORE UPDATE ON s_trust_period_events BEGIN SELECT RAISE(ABORT,'trust period actions are append-only'); END;
CREATE TRIGGER s_trust_period_events_no_delete BEFORE DELETE ON s_trust_period_events BEGIN SELECT RAISE(ABORT,'trust period actions are append-only'); END;

-- A stable provenance door for register drill-down and account-wide access checks.
-- The journal reversal table is added by the following migration.
CREATE VIEW s_trust_entry_sources AS
 SELECT e.id entry_id,'opening' source_kind,o.id source_record_id,o.source_document_id,o.source_version,o.source_digest,o.note reason,NULL original_entry_id,NULL bank_reference
 FROM s_trust_entries e JOIN s_trust_openings o ON o.id=e.source_id
 UNION ALL SELECT e.id,'transaction',t.id,t.source_document_id,t.source_version,t.source_digest,t.purpose,NULL,t.bank_reference
 FROM s_trust_entries e JOIN s_trust_transactions t ON t.id=e.source_id
 UNION ALL SELECT e.id,'earned_fee_transfer',t.id,a.source_document_id,a.source_version,a.source_digest,a.note,NULL,a.bank_reference
 FROM s_trust_entries e JOIN s_trust_transfers t ON e.source_id IN(t.id||':trust',t.id||':operating') JOIN s_trust_transfer_actions a ON a.transfer_id=t.id AND a.kind='cleared'
 UNION ALL SELECT e.id,'earned_fee_reversal',r.id,a.source_document_id,a.source_version,a.source_digest,r.reason,p.trust_entry_id,a.bank_reference
 FROM s_trust_entries e JOIN s_trust_reversals r ON e.source_id IN(r.id||':trust',r.id||':operating') JOIN s_trust_reversal_actions a ON a.reversal_id=r.id AND a.kind='cleared' JOIN s_operating_payments p ON p.transfer_id=r.transfer_id
 UNION ALL SELECT e.id,'journal_reversal',r.id,r.source_document_id,r.source_version,r.source_digest,r.reason,r.original_entry_id,NULL
 FROM s_trust_entries e JOIN s_trust_journal_reversals r ON r.id=e.source_id;
