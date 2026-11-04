-- Cost snapshots in reviewed work share the approved cost's disposal fence.
CREATE TABLE s_economics_bulk_redactions (
 row_id TEXT NOT NULL REFERENCES s_bulk_work_rows(id),
 revision_id TEXT NOT NULL REFERENCES s_staff_cost_disposals(revision_id),
 payload_sha256 TEXT NOT NULL,
 PRIMARY KEY(row_id,revision_id)
);
CREATE TRIGGER s_economics_bulk_redactions_no_update BEFORE UPDATE ON s_economics_bulk_redactions BEGIN SELECT RAISE(ABORT,'Cost derivative disposal is immutable'); END;
CREATE TRIGGER s_economics_bulk_redactions_no_delete BEFORE DELETE ON s_economics_bulk_redactions BEGIN SELECT RAISE(ABORT,'Cost derivative disposal is retained'); END;
DROP TRIGGER s_bulk_work_original;
CREATE TRIGGER s_bulk_work_original BEFORE UPDATE ON s_bulk_work_rows
 WHEN NEW.original_json<>OLD.original_json OR NEW.id<>OLD.id OR NEW.batch_id<>OLD.batch_id OR NEW.ordinal<>OLD.ordinal
 OR (OLD.entry_id IS NOT NULL AND NOT (
  NEW.entry_id IS OLD.entry_id AND NEW.matter_id IS OLD.matter_id AND NEW.input_json IS OLD.input_json
  AND NEW.review_json=json_set(OLD.review_json,'$.value.costBasis',NULL)
  AND EXISTS(SELECT 1 FROM s_economics_bulk_redactions r
   WHERE r.row_id=OLD.id AND r.revision_id=json_extract(OLD.review_json,'$.value.costBasis.approvalId'))
 ))
 BEGIN SELECT RAISE(ABORT,'original and posted bulk work are immutable outside approved cost payload disposal'); END;
