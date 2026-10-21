-- Released invoice work keeps its stable source ID and an append-only edit chain.
CREATE TABLE s_entry_edits (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES s_entries(id),
 previous_revision TEXT NOT NULL, revision TEXT NOT NULL UNIQUE,
 before_json TEXT NOT NULL CHECK(json_valid(before_json)), after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 changes TEXT NOT NULL CHECK(json_valid(changes)), reason TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
 UNIQUE(entry_id,previous_revision)
);
CREATE TRIGGER s_entry_edits_immutable_update BEFORE UPDATE ON s_entry_edits BEGIN SELECT RAISE(ABORT,'entry edit history is immutable'); END;
CREATE TRIGGER s_entry_edits_immutable_delete BEFORE DELETE ON s_entry_edits BEGIN SELECT RAISE(ABORT,'entry edit history is immutable'); END;
DROP TRIGGER s_entries_immutable_update;
CREATE TRIGGER s_entries_reviewed_update BEFORE UPDATE ON s_entries
 WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.date IS NOT OLD.date
 OR NEW.minutes IS NOT OLD.minutes OR NEW.currency IS NOT OLD.currency
 OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.billable IS NOT OLD.billable
 OR EXISTS(SELECT 1 FROM s_billing_sources WHERE entry_id=OLD.id)
 OR NOT EXISTS(SELECT 1 FROM s_invoice_voids v JOIN s_bills b ON b.id=v.bill_id JOIN json_each(b.snapshot,'$.lines') l WHERE json_extract(l.value,'$.sourceId')=OLD.id)
 OR NOT EXISTS(SELECT 1 FROM s_entry_edits e WHERE e.entry_id=OLD.id AND e.previous_revision=OLD.revision AND e.revision=NEW.revision AND e.before_json=json_object('matter_id',OLD.matter_id,'description',OLD.description,'rate_cents',OLD.rate_cents,'amount_cents',OLD.amount_cents,'utbms_task',OLD.utbms_task,'utbms_activity',OLD.utbms_activity,'utbms_expense',OLD.utbms_expense,'billed_minutes',OLD.billed_minutes,'discount_bps',OLD.discount_bps,'rate_rule_id',OLD.rate_rule_id,'rate_source',OLD.rate_source) AND e.after_json=json_object('matter_id',NEW.matter_id,'description',NEW.description,'rate_cents',NEW.rate_cents,'amount_cents',NEW.amount_cents,'utbms_task',NEW.utbms_task,'utbms_activity',NEW.utbms_activity,'utbms_expense',NEW.utbms_expense,'billed_minutes',NEW.billed_minutes,'discount_bps',NEW.discount_bps,'rate_rule_id',NEW.rate_rule_id,'rate_source',NEW.rate_source))
 BEGIN SELECT RAISE(ABORT,'only reviewed released entry edits are permitted'); END;
CREATE TRIGGER s_integration_entry_edited AFTER UPDATE ON s_entries BEGIN
 INSERT INTO s_integration_events(id,kind,matter_id,object_id,at) VALUES(lower(hex(randomblob(16))),'finance.changed',NEW.matter_id,NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
