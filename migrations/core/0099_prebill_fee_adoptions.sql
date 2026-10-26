CREATE TABLE s_prebill_fee_adoptions (
 id TEXT PRIMARY KEY, bill_id TEXT NOT NULL UNIQUE REFERENCES s_bills(id), run_id TEXT NOT NULL REFERENCES s_prebill_runs(id),
 before_revision TEXT NOT NULL, after_revision TEXT NOT NULL UNIQUE,
 before_snapshot TEXT NOT NULL CHECK(json_valid(before_snapshot)), after_snapshot TEXT NOT NULL CHECK(json_valid(after_snapshot)),
 prepared_by TEXT NOT NULL, prepared_at TEXT NOT NULL,
 CHECK(before_revision<>after_revision),
 CHECK(json_type(before_snapshot,'$.prebill') IS NULL AND json_type(after_snapshot,'$.prebill')='object'),
 CHECK(json_remove(before_snapshot,'$.prebill')=json_remove(after_snapshot,'$.prebill')),
 CHECK(json_extract(after_snapshot,'$.prebill.runId')=run_id)
);
CREATE TRIGGER s_prebill_fee_adoptions_update_retained BEFORE UPDATE ON s_prebill_fee_adoptions BEGIN SELECT RAISE(ABORT,'constraint: prebill adoption history is immutable'); END;
CREATE TRIGGER s_prebill_fee_adoptions_delete_retained BEFORE DELETE ON s_prebill_fee_adoptions BEGIN SELECT RAISE(ABORT,'constraint: prebill adoption history is immutable'); END;
DROP TRIGGER s_bills_snapshot_immutable;
CREATE TRIGGER s_bills_snapshot_immutable BEFORE UPDATE ON s_bills
 WHEN (NEW.snapshot<>OLD.snapshot AND NOT (OLD.status='draft' AND NEW.status='draft' AND OLD.artifact IS NULL
 AND (EXISTS(SELECT 1 FROM s_prebill_reviews r WHERE r.bill_id=OLD.id AND r.before_revision=OLD.revision AND r.after_revision=NEW.revision AND r.before_snapshot=OLD.snapshot AND r.after_snapshot=NEW.snapshot) OR EXISTS(SELECT 1 FROM s_prebill_fee_adoptions a WHERE a.bill_id=OLD.id AND a.before_revision=OLD.revision AND a.after_revision=NEW.revision AND a.before_snapshot=OLD.snapshot AND a.after_snapshot=NEW.snapshot))))
 OR NEW.matter_id<>OLD.matter_id OR NEW.corrects_bill_id IS NOT OLD.corrects_bill_id
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR (OLD.artifact IS NOT NULL AND (NEW.artifact IS NOT OLD.artifact OR NEW.artifact_digest IS NOT OLD.artifact_digest
 OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.review_note IS NOT OLD.review_note))
 BEGIN SELECT RAISE(ABORT,'reviewed billing snapshot is immutable'); END;
DROP TRIGGER s_bills_status_transition;
CREATE TRIGGER s_bills_status_transition BEFORE UPDATE ON s_bills
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('approved','void'))
 OR (OLD.status='approved' AND NEW.status IN ('exported','void'))
 OR (OLD.status='exported' AND NEW.status='void' AND EXISTS(SELECT 1 FROM s_invoice_voids v WHERE v.bill_id=OLD.id AND v.reviewed_revision=OLD.revision AND v.reason=NEW.void_reason AND v.actor=NEW.voided_by AND v.at=NEW.voided_at))
 OR (OLD.status='draft' AND NEW.status='draft' AND OLD.artifact IS NULL
 AND (EXISTS(SELECT 1 FROM s_prebill_reviews r WHERE r.bill_id=OLD.id AND r.before_revision=OLD.revision AND r.after_revision=NEW.revision AND r.before_snapshot=OLD.snapshot AND r.after_snapshot=NEW.snapshot) OR EXISTS(SELECT 1 FROM s_prebill_fee_adoptions a WHERE a.bill_id=OLD.id AND a.before_revision=OLD.revision AND a.after_revision=NEW.revision AND a.before_snapshot=OLD.snapshot AND a.after_snapshot=NEW.snapshot))))
 BEGIN SELECT RAISE(ABORT,'invalid bill transition'); END;
