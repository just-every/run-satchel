-- Retained incumbent facts never authorize a new payment or trust movement.
CREATE TABLE s_move_fee_lines (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 invoice_id TEXT, date TEXT NOT NULL, description TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 native_plan_id TEXT REFERENCES s_fee_plans(id)
);
CREATE TABLE s_move_financial_activity (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 client_id TEXT NOT NULL REFERENCES s_parties(id),
 ledger TEXT NOT NULL CHECK(ledger IN('ar','trust')),
 kind TEXT NOT NULL, date TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0), invoice_id TEXT,
 document_id TEXT NOT NULL REFERENCES s_documents(id), source_reference TEXT NOT NULL
);
CREATE TRIGGER s_move_fee_lines_update BEFORE UPDATE ON s_move_fee_lines BEGIN SELECT RAISE(ABORT,'constraint: source fee history is immutable'); END;
CREATE TRIGGER s_move_fee_lines_delete BEFORE DELETE ON s_move_fee_lines BEGIN SELECT RAISE(ABORT,'constraint: source fee history is retained'); END;
CREATE TRIGGER s_move_financial_update BEFORE UPDATE ON s_move_financial_activity BEGIN SELECT RAISE(ABORT,'constraint: source financial history is immutable'); END;
CREATE TRIGGER s_move_financial_delete BEFORE DELETE ON s_move_financial_activity BEGIN SELECT RAISE(ABORT,'constraint: source financial history is retained'); END;

-- Erasing a member also destroys the retained compressed copy containing it.
CREATE TRIGGER s_move_binary_archive_erasure AFTER UPDATE OF erased_at ON s_documents
 WHEN OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL BEGIN
 UPDATE s_move_originals SET content_base64=NULL
 WHERE json_extract(metadata_json,'$.sourceArchive')=1
 AND EXISTS(SELECT 1 FROM json_each(json_extract(metadata_json,'$.members')) member
  WHERE json_extract(member.value,'$.sha256') IN(SELECT sha256 FROM s_document_versions WHERE document_id=NEW.id))
 AND job_id IN(SELECT j.id FROM s_move_jobs j WHERE j.account IN(SELECT account FROM s_move_sources WHERE target_table='s_documents' AND target_id=NEW.id));
 END;
