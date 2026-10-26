CREATE TABLE s_prebill_runs (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_prebill_run_items (
 run_id TEXT NOT NULL REFERENCES s_prebill_runs(id), bill_id TEXT NOT NULL UNIQUE REFERENCES s_bills(id),
 position INTEGER NOT NULL, PRIMARY KEY(run_id,position)
);
CREATE TABLE s_prebill_reviews (
 id TEXT PRIMARY KEY, bill_id TEXT NOT NULL REFERENCES s_bills(id), before_revision TEXT NOT NULL,
 after_revision TEXT NOT NULL UNIQUE, action TEXT NOT NULL CHECK(action IN('return','revise')),
 note TEXT NOT NULL, before_snapshot TEXT NOT NULL CHECK(json_valid(before_snapshot)),
 after_snapshot TEXT NOT NULL CHECK(json_valid(after_snapshot)), excluded_sources TEXT NOT NULL CHECK(json_valid(excluded_sources)),
 actor TEXT NOT NULL, at TEXT NOT NULL, UNIQUE(bill_id,before_revision)
);
CREATE TABLE s_matter_invoice_templates (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 template_id TEXT NOT NULL REFERENCES s_invoice_templates(id), previous_id TEXT, reason TEXT NOT NULL,
 assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL
);
CREATE INDEX s_matter_invoice_template_current ON s_matter_invoice_templates(matter_id,sequence DESC);
CREATE TABLE s_invoice_issue_details (
 bill_id TEXT PRIMARY KEY REFERENCES s_invoice_issues(bill_id), template_id TEXT REFERENCES s_invoice_templates(id),
 template_version INTEGER, assignment_id TEXT REFERENCES s_matter_invoice_templates(id),
 payer TEXT NOT NULL, payment_snapshot TEXT NOT NULL CHECK(json_valid(payment_snapshot)),
 line_snapshot TEXT NOT NULL CHECK(json_valid(line_snapshot))
);
DROP TRIGGER s_bills_snapshot_immutable;
CREATE TRIGGER s_bills_snapshot_immutable BEFORE UPDATE ON s_bills
 WHEN (NEW.snapshot<>OLD.snapshot AND NOT (OLD.status='draft' AND NEW.status='draft' AND OLD.artifact IS NULL
 AND EXISTS(SELECT 1 FROM s_prebill_reviews r WHERE r.bill_id=OLD.id AND r.before_revision=OLD.revision AND r.after_revision=NEW.revision AND r.before_snapshot=OLD.snapshot AND r.after_snapshot=NEW.snapshot)))
 OR NEW.matter_id<>OLD.matter_id OR NEW.corrects_bill_id IS NOT OLD.corrects_bill_id
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR (OLD.artifact IS NOT NULL AND (NEW.artifact IS NOT OLD.artifact OR NEW.artifact_digest IS NOT OLD.artifact_digest
 OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.review_note IS NOT OLD.review_note))
 BEGIN SELECT RAISE(ABORT,'reviewed billing snapshot is immutable'); END;
DROP TRIGGER s_bills_status_transition;
CREATE TRIGGER s_bills_status_transition BEFORE UPDATE ON s_bills
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('approved','void'))
 OR (OLD.status='approved' AND NEW.status IN ('exported','void'))
 OR (OLD.status='draft' AND NEW.status='draft' AND OLD.artifact IS NULL
 AND EXISTS(SELECT 1 FROM s_prebill_reviews r WHERE r.bill_id=OLD.id AND r.before_revision=OLD.revision AND r.after_revision=NEW.revision AND r.before_snapshot=OLD.snapshot AND r.after_snapshot=NEW.snapshot)))
 BEGIN SELECT RAISE(ABORT,'invalid bill transition'); END;
DROP TRIGGER s_billing_sources_release;
CREATE TRIGGER s_billing_sources_release BEFORE DELETE ON s_billing_sources
 WHEN NOT EXISTS(SELECT 1 FROM s_bills WHERE id=OLD.bill_id AND status='void')
 AND NOT EXISTS(SELECT 1 FROM s_bills b JOIN s_prebill_reviews r ON r.bill_id=b.id AND r.before_revision=b.revision,
 json_each(r.excluded_sources) x WHERE b.id=OLD.bill_id AND b.status='draft' AND r.action='revise' AND x.value=OLD.entry_id)
 BEGIN SELECT RAISE(ABORT,'only void bills or reviewed draft exclusions release sources'); END;
CREATE TRIGGER s_prebill_runs_update_retained BEFORE UPDATE ON s_prebill_runs BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_prebill_runs_delete_retained BEFORE DELETE ON s_prebill_runs BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_prebill_run_items_update_retained BEFORE UPDATE ON s_prebill_run_items BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_prebill_run_items_delete_retained BEFORE DELETE ON s_prebill_run_items BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_prebill_reviews_update_retained BEFORE UPDATE ON s_prebill_reviews BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_prebill_reviews_delete_retained BEFORE DELETE ON s_prebill_reviews BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_matter_invoice_templates_update_retained BEFORE UPDATE ON s_matter_invoice_templates BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_matter_invoice_templates_delete_retained BEFORE DELETE ON s_matter_invoice_templates BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_invoice_issue_details_update_retained BEFORE UPDATE ON s_invoice_issue_details BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
CREATE TRIGGER s_invoice_issue_details_delete_retained BEFORE DELETE ON s_invoice_issue_details BEGIN SELECT RAISE(ABORT,'constraint: prebill and issue history is immutable'); END;
