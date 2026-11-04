-- Approved payload disposal keeps attribution and non-payload custody history.
CREATE TABLE s_staff_cost_disposals (
 revision_id TEXT PRIMARY KEY, timekeeper_sha256 TEXT NOT NULL,
 effective_from TEXT NOT NULL, was_approved INTEGER NOT NULL CHECK(was_approved IN(0,1)),
 reason TEXT NOT NULL, journal TEXT NOT NULL CHECK(json_valid(journal)),
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TABLE s_economics_export_disposals (
 export_id TEXT PRIMARY KEY REFERENCES s_economics_exports(id),
 reason TEXT NOT NULL, journal TEXT NOT NULL CHECK(json_valid(journal)),
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TABLE s_economics_audit_redactions (
 audit_id TEXT PRIMARY KEY REFERENCES s_audit(id),
 revision_id TEXT NOT NULL REFERENCES s_staff_cost_disposals(revision_id),
 sha256 TEXT NOT NULL, redacted_detail TEXT NOT NULL, redacted_evidence TEXT NOT NULL
);
CREATE TRIGGER s_staff_cost_disposals_no_update BEFORE UPDATE ON s_staff_cost_disposals BEGIN SELECT RAISE(ABORT,'Cost disposal is immutable'); END;
CREATE TRIGGER s_staff_cost_disposals_no_delete BEFORE DELETE ON s_staff_cost_disposals BEGIN SELECT RAISE(ABORT,'Cost disposal is immutable'); END;
CREATE TRIGGER s_economics_export_disposals_no_update BEFORE UPDATE ON s_economics_export_disposals BEGIN SELECT RAISE(ABORT,'Export disposal is immutable'); END;
CREATE TRIGGER s_economics_export_disposals_no_delete BEFORE DELETE ON s_economics_export_disposals BEGIN SELECT RAISE(ABORT,'Export disposal is immutable'); END;
CREATE TRIGGER s_economics_audit_redactions_no_update BEFORE UPDATE ON s_economics_audit_redactions BEGIN SELECT RAISE(ABORT,'Cost audit disposal is immutable'); END;
CREATE TRIGGER s_economics_audit_redactions_no_delete BEFORE DELETE ON s_economics_audit_redactions BEGIN SELECT RAISE(ABORT,'Cost audit disposal is immutable'); END;
DROP TRIGGER s_economics_exports_immutable_update;
CREATE TRIGGER s_economics_exports_immutable_update BEFORE UPDATE ON s_economics_exports
 WHEN NEW.id IS NOT OLD.id OR NEW.artifact_sha256 IS NOT OLD.artifact_sha256
 OR NEW.matter_ids IS NOT OLD.matter_ids OR NEW.cost_revision_ids IS NOT OLD.cost_revision_ids
 OR NEW.generated_by IS NOT OLD.generated_by OR NEW.generated_at IS NOT OLD.generated_at
 OR NEW.filters IS NOT OLD.filters OR NEW.artifact IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM s_economics_export_disposals d WHERE d.export_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Economics artifacts are immutable outside approved payload disposal'); END;
DROP TRIGGER s_staff_cost_revisions_immutable_update;
CREATE TRIGGER s_staff_cost_revisions_immutable_update BEFORE UPDATE ON s_staff_cost_revisions
 WHEN NEW.id IS NOT OLD.id OR NEW.supersedes_id IS NOT OLD.supersedes_id
 OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
 OR NEW.email<>'' OR NEW.effective_from<>'' OR NEW.hourly_cents<>0 OR NEW.reason<>''
 OR NOT EXISTS(SELECT 1 FROM s_staff_cost_disposals d WHERE d.revision_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Cost revisions are immutable outside approved payload disposal'); END;
DROP TRIGGER s_staff_cost_rates_immutable_update;
CREATE TRIGGER s_staff_cost_rates_immutable_update BEFORE UPDATE ON s_staff_cost_rates
 WHEN NEW.id IS NOT OLD.id OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at
 OR NEW.email<>'' OR NEW.effective_from<>'' OR NEW.hourly_cents<>0 OR NEW.reason<>''
 OR NOT EXISTS(SELECT 1 FROM s_staff_cost_disposals d WHERE d.revision_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Cost approvals are immutable outside approved payload disposal'); END;
DROP VIEW s_approved_staff_cost_rates;
CREATE VIEW s_approved_staff_cost_rates AS
 SELECT c.*,c.approved_by created_by,c.approved_at created_at FROM s_staff_cost_rates c
 WHERE NOT EXISTS(SELECT 1 FROM s_staff_cost_disposals d WHERE d.revision_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM s_staff_cost_revisions r JOIN s_staff_cost_approvals a ON a.revision_id=r.id WHERE r.supersedes_id=c.id)
 UNION ALL
 SELECT r.id,r.email,r.effective_from,r.hourly_cents,r.reason,a.approved_by,a.approved_at,r.created_by,r.created_at
 FROM s_staff_cost_revisions r JOIN s_staff_cost_approvals a ON a.revision_id=r.id
 WHERE NOT EXISTS(SELECT 1 FROM s_staff_cost_disposals d WHERE d.revision_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM s_staff_cost_revisions next JOIN s_staff_cost_approvals approved ON approved.revision_id=next.id WHERE next.supersedes_id=r.id);
DROP TRIGGER s_audit_no_update;
CREATE TRIGGER s_audit_no_update BEFORE UPDATE ON s_audit
 WHEN NEW.id IS NOT OLD.id OR NEW.actor IS NOT OLD.actor OR NEW.action IS NOT OLD.action
 OR NEW.object_id IS NOT OLD.object_id OR NEW.at IS NOT OLD.at OR NEW.actor_id IS NOT OLD.actor_id
 OR NEW.role IS NOT OLD.role OR NEW.channel IS NOT OLD.channel OR NEW.matter_id IS NOT OLD.matter_id
 OR NEW.revision IS NOT OLD.revision
 OR NOT (EXISTS(SELECT 1 FROM s_conflict_policy_audit_redactions r WHERE r.audit_id=OLD.id AND NEW.detail=r.redacted_detail AND NEW.evidence=r.redacted_evidence)
 OR EXISTS(SELECT 1 FROM s_economics_audit_redactions r WHERE r.audit_id=OLD.id AND NEW.detail=r.redacted_detail AND NEW.evidence=r.redacted_evidence))
 BEGIN SELECT RAISE(ABORT,'Action audit is append-only outside approved payload disposal'); END;
