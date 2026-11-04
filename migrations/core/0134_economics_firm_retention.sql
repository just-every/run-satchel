-- Firm decisions cover cost settings and reports with no matter custody yet.
CREATE TABLE s_economics_retention (
 id TEXT PRIMARY KEY, dispose_after TEXT NOT NULL, basis TEXT NOT NULL,
 previous_id TEXT UNIQUE REFERENCES s_economics_retention(id),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER s_economics_retention_no_update BEFORE UPDATE ON s_economics_retention BEGIN SELECT RAISE(ABORT,'Economics retention decisions are immutable'); END;
CREATE TRIGGER s_economics_retention_no_delete BEFORE DELETE ON s_economics_retention BEGIN SELECT RAISE(ABORT,'Economics retention decisions are retained'); END;
