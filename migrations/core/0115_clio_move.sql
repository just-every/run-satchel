-- Prepared source packages, durable checkpoints and reviewed cutover custody.
CREATE TABLE s_move_jobs (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
 package_json TEXT NOT NULL CHECK(json_valid(package_json)), phase TEXT NOT NULL,
 previous_fingerprint TEXT, checkpoint INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN('applying','completed','undone')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_move_package_chunks (
 job_id TEXT NOT NULL REFERENCES s_move_jobs(id), ordinal INTEGER NOT NULL,
 body TEXT NOT NULL, PRIMARY KEY(job_id,ordinal)
);
CREATE TABLE s_move_originals (
 job_id TEXT NOT NULL REFERENCES s_move_jobs(id), file_id TEXT NOT NULL,
 sha256 TEXT NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 content_base64 TEXT, PRIMARY KEY(job_id,file_id)
);
CREATE TRIGGER s_move_chunks_update BEFORE UPDATE ON s_move_package_chunks BEGIN SELECT RAISE(ABORT,'constraint: source package chunks are immutable'); END;
CREATE TRIGGER s_move_chunks_delete BEFORE DELETE ON s_move_package_chunks BEGIN SELECT RAISE(ABORT,'constraint: source package chunks are retained'); END;
CREATE TRIGGER s_move_originals_update BEFORE UPDATE ON s_move_originals
 WHEN NEW.job_id IS NOT OLD.job_id OR NEW.file_id IS NOT OLD.file_id OR NEW.sha256 IS NOT OLD.sha256 OR NEW.metadata_json IS NOT OLD.metadata_json OR NEW.content_base64 IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'constraint: source originals are immutable'); END;
CREATE TRIGGER s_move_originals_delete BEFORE DELETE ON s_move_originals BEGIN SELECT RAISE(ABORT,'constraint: source originals are retained'); END;
CREATE TABLE s_move_sources (
 identity TEXT PRIMARY KEY, account TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
 source_hash TEXT NOT NULL, source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 job_id TEXT NOT NULL REFERENCES s_move_jobs(id), target_table TEXT NOT NULL, target_id TEXT NOT NULL,
 native_json TEXT NOT NULL CHECK(json_valid(native_json)),
 disposition TEXT NOT NULL DEFAULT 'imported' CHECK(disposition IN('imported','preserved','removed','erased')),
 UNIQUE(account,kind,source_id)
);
CREATE INDEX s_move_sources_job ON s_move_sources(job_id);
CREATE TABLE s_move_cutovers (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE REFERENCES s_move_jobs(id),
 report_json TEXT NOT NULL CHECK(json_valid(report_json)), report_digest TEXT NOT NULL,
 signed_by TEXT NOT NULL, signed_at TEXT NOT NULL, declaration TEXT NOT NULL
);
CREATE TRIGGER s_move_cutover_update BEFORE UPDATE ON s_move_cutovers BEGIN SELECT RAISE(ABORT,'constraint: signed cutovers are immutable'); END;
CREATE TRIGGER s_move_cutover_delete BEFORE DELETE ON s_move_cutovers BEGIN SELECT RAISE(ABORT,'constraint: signed cutovers are retained'); END;
-- Source balance observations are not bank deposits or permission to move funds.
CREATE TABLE s_move_trust (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 client_id TEXT NOT NULL, balance_cents INTEGER NOT NULL CHECK(balance_cents>=0),
 statement_date TEXT NOT NULL, source_reference TEXT NOT NULL, ledger_id TEXT NOT NULL REFERENCES s_trust_ledgers(id)
);
CREATE TABLE s_move_invoice_balances (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), paid_cents INTEGER NOT NULL CHECK(paid_cents>=0),
 source_reference TEXT NOT NULL
);
CREATE TRIGGER s_move_invoice_balance_update BEFORE UPDATE ON s_move_invoice_balances BEGIN SELECT RAISE(ABORT,'constraint: imported balances are immutable'); END;
CREATE TRIGGER s_move_invoice_balance_delete BEFORE DELETE ON s_move_invoice_balances BEGIN SELECT RAISE(ABORT,'constraint: imported balances are retained'); END;
-- Erasure destroys every retained package copy of an original. Source identities
-- remain fenced, so a replay cannot restore bytes or a removed record.
CREATE TRIGGER s_move_document_erasure AFTER UPDATE OF erased_at ON s_documents
 WHEN OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL BEGIN
 UPDATE s_move_originals SET content_base64=NULL
 WHERE sha256 IN(SELECT sha256 FROM s_document_versions WHERE document_id=NEW.id)
 AND job_id IN(SELECT j.id FROM s_move_jobs j WHERE j.account IN(SELECT account FROM s_move_sources WHERE target_table='s_documents' AND target_id=NEW.id));
 UPDATE s_move_sources SET disposition='erased',native_json='{}'
 WHERE target_table='s_documents' AND target_id=NEW.id;
 END;
