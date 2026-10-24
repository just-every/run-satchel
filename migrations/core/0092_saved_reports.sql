-- Standalone report definitions travel with the native firm archive.
CREATE TABLE s_saved_reports(id TEXT PRIMARY KEY,name TEXT NOT NULL,dashboard TEXT NOT NULL,filters TEXT NOT NULL CHECK(json_valid(filters)),revision TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
