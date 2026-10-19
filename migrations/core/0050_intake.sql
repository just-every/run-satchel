-- INTAKE-001. Published revisions and original submissions remain immutable.
CREATE TABLE s_intake_forms (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 published INTEGER NOT NULL CHECK(published IN(0,1)), assigned_email TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE s_intake_form_versions (
 form_id TEXT NOT NULL REFERENCES s_intake_forms(id), version INTEGER NOT NULL,
 revision TEXT NOT NULL UNIQUE, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(form_id,version)
);
CREATE TABLE s_intake_submissions (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES s_leads(id), form_id TEXT NOT NULL,
 form_version INTEGER NOT NULL, receipt TEXT NOT NULL UNIQUE, submitted_at TEXT NOT NULL,
 original_data TEXT NOT NULL CHECK(json_valid(original_data)),
 FOREIGN KEY(form_id,form_version) REFERENCES s_intake_form_versions(form_id,version)
);
CREATE INDEX s_intake_submissions_lead ON s_intake_submissions(lead_id,submitted_at);
CREATE TABLE s_intake_files (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES s_intake_submissions(id),
 name TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime IN('application/pdf','image/png','image/jpeg')),
 size INTEGER NOT NULL CHECK(size>0 AND size<=10485760), sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, scan_status TEXT NOT NULL DEFAULT 'not malware-scanned' CHECK(scan_status='not malware-scanned')
);
-- Ephemeral security data: explicitly excluded from portability archives.
CREATE TABLE s_intake_tokens (
 token_hash TEXT PRIMARY KEY, form_id TEXT NOT NULL REFERENCES s_intake_forms(id),
 revision TEXT NOT NULL, expires_at TEXT NOT NULL, submission_id TEXT REFERENCES s_intake_submissions(id)
);
CREATE INDEX s_intake_tokens_expiry ON s_intake_tokens(expires_at);
CREATE TABLE s_intake_rate_limits (
 form_id TEXT NOT NULL REFERENCES s_intake_forms(id), hour TEXT NOT NULL, ip_digest TEXT NOT NULL,
 accepted INTEGER NOT NULL CHECK(accepted BETWEEN 0 AND 10), expires_at TEXT NOT NULL,
 PRIMARY KEY(form_id,hour,ip_digest)
);
CREATE INDEX s_intake_rate_expiry ON s_intake_rate_limits(expires_at);
CREATE TRIGGER s_intake_version_update BEFORE UPDATE ON s_intake_form_versions BEGIN SELECT RAISE(ABORT,'constraint: intake versions are immutable'); END;
CREATE TRIGGER s_intake_version_delete BEFORE DELETE ON s_intake_form_versions BEGIN SELECT RAISE(ABORT,'constraint: intake versions are immutable'); END;
CREATE TRIGGER s_intake_submission_update BEFORE UPDATE ON s_intake_submissions BEGIN SELECT RAISE(ABORT,'constraint: original intake is immutable'); END;
CREATE TRIGGER s_intake_submission_delete BEFORE DELETE ON s_intake_submissions BEGIN SELECT RAISE(ABORT,'constraint: original intake is immutable'); END;
CREATE TRIGGER s_intake_file_update BEFORE UPDATE ON s_intake_files BEGIN SELECT RAISE(ABORT,'constraint: original intake files are immutable'); END;
CREATE TRIGGER s_intake_file_delete BEFORE DELETE ON s_intake_files BEGIN SELECT RAISE(ABORT,'constraint: original intake files are immutable'); END;
-- A durable staging reservation permits cleanup after a Worker dies during an R2 put.
CREATE TABLE s_intake_uploads (
 object_key TEXT PRIMARY KEY, expires_at TEXT NOT NULL
);
