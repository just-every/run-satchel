ALTER TABLE s_audit ADD COLUMN actor_id TEXT;
ALTER TABLE s_audit ADD COLUMN role TEXT;
ALTER TABLE s_audit ADD COLUMN channel TEXT;
ALTER TABLE s_audit ADD COLUMN matter_id TEXT;
ALTER TABLE s_audit ADD COLUMN revision TEXT;
ALTER TABLE s_audit ADD COLUMN evidence TEXT;
-- Only stable record associations are recovered; past roles/revisions are never guessed.
UPDATE s_audit SET matter_id=COALESCE(CASE WHEN json_valid(detail) THEN json_extract(detail,'$.matterId') END,(SELECT id FROM s_matters WHERE id=object_id),(SELECT matter_id FROM s_bills WHERE id=object_id),(SELECT matter_id FROM s_entries WHERE id=object_id),(SELECT matter_id FROM s_documents WHERE id=object_id),(SELECT matter_id FROM s_deadlines WHERE id=object_id),(SELECT l.matter_id FROM s_trust_transfers t JOIN s_trust_ledgers l ON l.id=t.ledger_id WHERE t.id=object_id),(SELECT l.matter_id FROM s_trust_reversals r JOIN s_trust_transfers t ON t.id=r.transfer_id JOIN s_trust_ledgers l ON l.id=t.ledger_id WHERE r.id=object_id));
CREATE INDEX s_audit_matter_date ON s_audit(matter_id,at,id);
CREATE TRIGGER s_audit_no_update BEFORE UPDATE ON s_audit BEGIN SELECT RAISE(ABORT,'action audit is append-only'); END;
CREATE TRIGGER s_audit_no_delete BEFORE DELETE ON s_audit BEGIN SELECT RAISE(ABORT,'action audit is append-only'); END;
CREATE TRIGGER s_delivery_state_audit AFTER UPDATE OF status ON s_reminder_deliveries WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO s_audit(id,actor,action,object_id,detail,at,actor_id,role,channel,matter_id,revision,evidence)
 SELECT lower(hex(randomblob(16))),'reminder-state','deadline.delivery_state',NEW.id,json_object('previousStatus',OLD.status,'status',NEW.status,'provider',NEW.provider,'providerId',NEW.provider_id,'detail',NEW.detail),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'scheduled-reminders','system','automation',t.matter_id,r.revision,json_object('record',json_object('kind','s_reminder_deliveries','id',NEW.id,'matterId',t.matter_id,'revision',r.revision,'status',NEW.status,'provider',NEW.provider,'providerId',NEW.provider_id,'policy',json_object('ruleId',r.id,'revision',r.revision,'recipient',r.recipient,'backup',r.backup,'advanceDays',r.advance_days,'sendTime',r.send_time,'quietStart',r.quiet_start,'quietEnd',r.quiet_end,'channels',r.channels,'escalateHours',r.escalate_hours)),'context',json_object('source','derived delivery state; human scheduling decision is recorded separately')) FROM s_reminder_rules r JOIN s_deadlines t ON t.id=r.deadline_id WHERE r.id=NEW.rule_id;
END;
CREATE TRIGGER s_deadline_superseded_audit AFTER UPDATE OF status ON s_deadlines WHEN NEW.status='superseded' AND OLD.status<>'superseded' BEGIN
 INSERT INTO s_audit(id,actor,action,object_id,detail,at,actor_id,role,channel,matter_id,revision,evidence)
 SELECT lower(hex(randomblob(16))),d.updated_by,'deadline.source_superseded',NEW.id,json_object('previousStatus',OLD.status,'replacementVersion',d.current_version,'erasedAt',d.erased_at),d.updated_at,o.id,CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END,d.updated_channel,NEW.matter_id,NEW.revision,json_object('record',json_object('recordType','s_deadlines','id',NEW.id,'matterId',NEW.matter_id,'revision',NEW.revision,'source',NEW.source,'documentId',NEW.document_id,'reviewedDocumentVersion',NEW.document_version,'status',NEW.status)) FROM s_documents d JOIN oa_operators o ON o.email=d.updated_by LEFT JOIN s_members m ON m.email=o.email WHERE d.id=NEW.document_id;
END;
CREATE TRIGGER s_import_job_state_audit AFTER UPDATE OF state,checkpoint ON ik_jobs WHEN NEW.state IS NOT OLD.state OR NEW.checkpoint IS NOT OLD.checkpoint BEGIN
 INSERT INTO s_audit(id,actor,action,object_id,detail,at,actor_id,role,channel,matter_id,revision,evidence)
 VALUES(lower(hex(randomblob(16))),'import-state','import.job_state',NEW.id,json_object('previousState',OLD.state,'state',NEW.state,'previousCheckpoint',OLD.checkpoint,'checkpoint',NEW.checkpoint),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'native-import','system','automation',NULL,NEW.mapping_version,json_object('record',json_object('recordType','ik_jobs','id',NEW.id,'namespace',NEW.namespace,'fingerprint',NEW.fingerprint,'mappingVersion',NEW.mapping_version,'state',NEW.state,'checkpoint',NEW.checkpoint,'total',NEW.total,'error',NEW.error),'context',json_object('source','durable import state; human request and target effects are recorded separately')));
END;
