-- FIRM-002: finance/billing, accountant and client member roles; explicit client portal grants.
DROP TRIGGER s_deadline_superseded_audit;
CREATE TABLE s_members_new(email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('lawyer','assistant','trust_officer','billing','accountant','client')), active INTEGER NOT NULL DEFAULT 1);
INSERT INTO s_members_new SELECT email,name,role,active FROM s_members;
DROP TABLE s_members;
ALTER TABLE s_members_new RENAME TO s_members;
CREATE TRIGGER s_deadline_superseded_audit AFTER UPDATE OF status ON s_deadlines WHEN NEW.status='superseded' AND OLD.status<>'superseded' BEGIN
 INSERT INTO s_audit(id,actor,action,object_id,detail,at,actor_id,role,channel,matter_id,revision,evidence)
 SELECT lower(hex(randomblob(16))),d.updated_by,'deadline.source_superseded',NEW.id,json_object('previousStatus',OLD.status,'replacementVersion',d.current_version,'erasedAt',d.erased_at),d.updated_at,o.id,CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END,d.updated_channel,NEW.matter_id,NEW.revision,json_object('record',json_object('recordType','s_deadlines','id',NEW.id,'matterId',NEW.matter_id,'revision',NEW.revision,'source',NEW.source,'documentId',NEW.document_id,'reviewedDocumentVersion',NEW.document_version,'status',NEW.status)) FROM s_documents d JOIN oa_operators o ON o.email=d.updated_by LEFT JOIN s_members m ON m.email=o.email WHERE d.id=NEW.document_id;
END;
CREATE TABLE s_portal_grants(id TEXT PRIMARY KEY,email TEXT NOT NULL,matter_id TEXT NOT NULL REFERENCES s_matters(id),granted_by TEXT NOT NULL,granted_at TEXT NOT NULL,reason TEXT NOT NULL,revoked_by TEXT,revoked_at TEXT,revoke_reason TEXT);
CREATE UNIQUE INDEX s_portal_grants_active ON s_portal_grants(email,matter_id) WHERE revoked_at IS NULL;
CREATE TRIGGER s_portal_grants_no_delete BEFORE DELETE ON s_portal_grants BEGIN SELECT RAISE(ABORT,'portal grants are history'); END;
CREATE TRIGGER s_portal_grants_revoke_only BEFORE UPDATE ON s_portal_grants WHEN NEW.id IS NOT OLD.id OR NEW.email IS NOT OLD.email OR NEW.matter_id IS NOT OLD.matter_id OR NEW.granted_by IS NOT OLD.granted_by OR NEW.granted_at IS NOT OLD.granted_at OR NEW.reason IS NOT OLD.reason OR OLD.revoked_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'portal grants are history'); END;
