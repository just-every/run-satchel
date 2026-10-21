-- BILL-016: additive void facts preserve original invoice files and numbers.
CREATE TABLE s_invoice_voids (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), reviewed_revision TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0), actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TRIGGER s_invoice_voids_keep_update BEFORE UPDATE ON s_invoice_voids
 BEGIN SELECT RAISE(ABORT,'constraint: invoice void history is immutable'); END;
CREATE TRIGGER s_invoice_voids_keep_delete BEFORE DELETE ON s_invoice_voids
 BEGIN SELECT RAISE(ABORT,'constraint: invoice void history is immutable'); END;
CREATE TRIGGER s_invoice_voids_reviewed_insert BEFORE INSERT ON s_invoice_voids
 WHEN NOT EXISTS(SELECT 1 FROM s_bills b WHERE b.id=NEW.bill_id
 AND ((b.revision=NEW.reviewed_revision AND b.status IN('approved','exported'))
 OR (b.status='void' AND b.void_reason=NEW.reason AND b.voided_by=NEW.actor AND b.voided_at=NEW.at)))
 BEGIN SELECT RAISE(ABORT,'constraint: invoice void requires its exact reviewed revision'); END;

DROP TRIGGER s_bills_status_transition;
CREATE TRIGGER s_bills_status_transition BEFORE UPDATE ON s_bills
 WHEN NOT ((OLD.status='draft' AND NEW.status IN('approved','void'))
 OR (OLD.status='approved' AND NEW.status IN('exported','void'))
 OR (OLD.status='exported' AND NEW.status='void' AND EXISTS(
 SELECT 1 FROM s_invoice_voids v WHERE v.bill_id=OLD.id AND v.reviewed_revision=OLD.revision
 AND v.reason=NEW.void_reason AND v.actor=NEW.voided_by AND v.at=NEW.voided_at)))
 BEGIN SELECT RAISE(ABORT,'invalid bill transition'); END;
CREATE TRIGGER s_invoice_voids_projection BEFORE UPDATE ON s_bills
 WHEN EXISTS(SELECT 1 FROM s_invoice_voids WHERE bill_id=OLD.id)
 AND NOT (NEW.status='void' AND NEW.revision<>OLD.revision AND EXISTS(
 SELECT 1 FROM s_invoice_voids v WHERE v.bill_id=OLD.id AND v.reviewed_revision=OLD.revision
 AND v.reason=NEW.void_reason AND v.actor=NEW.voided_by AND v.at=NEW.voided_at))
 BEGIN SELECT RAISE(ABORT,'constraint: invoice void projection must match its journal'); END;
