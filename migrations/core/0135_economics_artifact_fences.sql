-- Hash-only fences classify native reports without retaining their payloads.
CREATE TABLE s_economics_artifact_fences (
 artifact_sha256 TEXT PRIMARY KEY,
 payload_sha256 TEXT NOT NULL
);
INSERT OR IGNORE INTO s_economics_artifact_fences
 SELECT json_extract(detail,'$.artifactSha256'),COALESCE(json_extract(detail,'$.payloadSha256'),'')
 FROM s_audit WHERE action IN('report.economics_exported','report.economics_generated') AND json_valid(detail)
 AND length(json_extract(detail,'$.artifactSha256'))=64;
INSERT OR IGNORE INTO s_economics_artifact_fences
 SELECT artifact_sha256,COALESCE(json_extract(artifact,'$.manifest.payloadSha256'),'')
 FROM s_economics_exports;
CREATE INDEX s_economics_artifact_payload ON s_economics_artifact_fences(payload_sha256);
CREATE TRIGGER s_economics_artifact_fences_no_update BEFORE UPDATE ON s_economics_artifact_fences BEGIN SELECT RAISE(ABORT,'Confidential artifact fences are immutable'); END;
CREATE TRIGGER s_economics_artifact_fences_no_delete BEFORE DELETE ON s_economics_artifact_fences BEGIN SELECT RAISE(ABORT,'Confidential artifact fences are retained'); END;
