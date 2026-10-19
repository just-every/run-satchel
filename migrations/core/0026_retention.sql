-- FIRM-006: legal holds, retention schedules and the disposal journal. Rows are append-only
-- history: a hold is released once, and a schedule is superseded by a newer one.
CREATE TABLE s_holds(id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), document_id TEXT REFERENCES s_documents(id), reason TEXT NOT NULL, placed_by TEXT NOT NULL, placed_at TEXT NOT NULL, released_by TEXT, released_at TEXT, release_reason TEXT);
CREATE INDEX s_holds_matter ON s_holds(matter_id,released_at);
CREATE TRIGGER s_hold_release_once BEFORE UPDATE ON s_holds WHEN OLD.released_at IS NOT NULL OR NEW.matter_id IS NOT OLD.matter_id OR NEW.document_id IS NOT OLD.document_id OR NEW.reason IS NOT OLD.reason OR NEW.placed_by IS NOT OLD.placed_by OR NEW.placed_at IS NOT OLD.placed_at BEGIN SELECT RAISE(ABORT,'constraint: released holds are history'); END;
CREATE TRIGGER s_hold_delete BEFORE DELETE ON s_holds BEGIN SELECT RAISE(ABORT,'constraint: holds are history'); END;
CREATE TABLE s_retention(id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), document_id TEXT REFERENCES s_documents(id), dispose_after TEXT NOT NULL, basis TEXT NOT NULL, set_by TEXT NOT NULL, set_at TEXT NOT NULL, superseded_at TEXT);
CREATE INDEX s_retention_matter ON s_retention(matter_id,superseded_at);
CREATE TABLE s_disposals(id TEXT PRIMARY KEY, document_id TEXT NOT NULL UNIQUE REFERENCES s_documents(id), matter_id TEXT NOT NULL REFERENCES s_matters(id), retention_id TEXT NOT NULL REFERENCES s_retention(id), reason TEXT NOT NULL, journal TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL);
CREATE TRIGGER s_disposal_immutable BEFORE UPDATE ON s_disposals BEGIN SELECT RAISE(ABORT,'constraint: disposal journal is append-only'); END;
