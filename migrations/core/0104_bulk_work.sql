-- TIME-008: reviewable imports retain authorship separately from work attribution.
ALTER TABLE s_entries ADD COLUMN timekeeper_email TEXT;
CREATE TABLE s_bulk_work_batches (
 id TEXT PRIMARY KEY, created_by TEXT NOT NULL, source_system TEXT NOT NULL,
 request_id TEXT NOT NULL, request_digest TEXT NOT NULL, revision TEXT NOT NULL,
 review_digest TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('review','posted')),
 created_at TEXT NOT NULL, posted_at TEXT, post_request_id TEXT,
 UNIQUE(created_by,request_id), CHECK((status='posted')=(posted_at IS NOT NULL))
);
CREATE TABLE s_bulk_work_rows (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES s_bulk_work_batches(id),
 ordinal INTEGER NOT NULL, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 original_json TEXT NOT NULL CHECK(json_valid(original_json)),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 review_json TEXT NOT NULL CHECK(json_valid(review_json)),
 entry_id TEXT UNIQUE REFERENCES s_entries(id), UNIQUE(batch_id,ordinal)
);
CREATE TABLE s_bulk_work_sources (
 source_system TEXT NOT NULL, source_id TEXT NOT NULL,
 row_id TEXT UNIQUE NOT NULL REFERENCES s_bulk_work_rows(id),
 entry_id TEXT UNIQUE NOT NULL REFERENCES s_entries(id),
 PRIMARY KEY(source_system,source_id)
);
CREATE TRIGGER s_bulk_work_original BEFORE UPDATE ON s_bulk_work_rows
 WHEN NEW.original_json<>OLD.original_json OR NEW.id<>OLD.id OR NEW.batch_id<>OLD.batch_id OR NEW.ordinal<>OLD.ordinal
 OR OLD.entry_id IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'original and posted bulk work are immutable'); END;
CREATE TRIGGER s_bulk_work_batch_original BEFORE UPDATE ON s_bulk_work_batches
 WHEN NEW.created_by<>OLD.created_by OR NEW.source_system<>OLD.source_system
 OR NEW.request_id<>OLD.request_id OR NEW.request_digest<>OLD.request_digest OR NEW.created_at<>OLD.created_at OR OLD.status='posted'
 BEGIN SELECT RAISE(ABORT,'original and posted bulk batches are immutable'); END;
CREATE TRIGGER s_bulk_work_sources_update BEFORE UPDATE ON s_bulk_work_sources BEGIN SELECT RAISE(ABORT,'import sources are immutable'); END;
CREATE TRIGGER s_bulk_work_sources_delete BEFORE DELETE ON s_bulk_work_sources BEGIN SELECT RAISE(ABORT,'import sources are retained'); END;
CREATE TRIGGER s_bulk_work_rows_delete BEFORE DELETE ON s_bulk_work_rows BEGIN SELECT RAISE(ABORT,'import originals are retained'); END;
CREATE TRIGGER s_bulk_work_batches_delete BEFORE DELETE ON s_bulk_work_batches BEGIN SELECT RAISE(ABORT,'import batches are retained'); END;
