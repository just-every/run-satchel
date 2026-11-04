-- Confidential retained reports carry data, never access authority.
CREATE TABLE s_economics_exports (
 id TEXT PRIMARY KEY,
 artifact TEXT,
 artifact_sha256 TEXT NOT NULL,
 matter_ids TEXT NOT NULL CHECK(json_valid(matter_ids)),
 cost_revision_ids TEXT NOT NULL CHECK(json_valid(cost_revision_ids)),
 generated_by TEXT NOT NULL,
 generated_at TEXT NOT NULL,
 filters TEXT NOT NULL CHECK(json_valid(filters))
);
CREATE TRIGGER s_economics_exports_immutable_update BEFORE UPDATE ON s_economics_exports
 BEGIN SELECT RAISE(ABORT,'Economics artifacts are immutable'); END;
CREATE TRIGGER s_economics_exports_immutable_delete BEFORE DELETE ON s_economics_exports
 BEGIN SELECT RAISE(ABORT,'Economics custody records are retained'); END;
