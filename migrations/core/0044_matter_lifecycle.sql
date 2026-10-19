-- MATTER-007: closing records a decision, never cancels work or changes access.
ALTER TABLE s_matters ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'open' CHECK(lifecycle_status IN ('open','closed'));
ALTER TABLE s_matters ADD COLUMN lifecycle_revision TEXT NOT NULL DEFAULT 'initial';
CREATE TABLE s_matter_closure_previews(
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), for_email TEXT NOT NULL,
 revision TEXT NOT NULL, digest TEXT NOT NULL, source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 checks_json TEXT NOT NULL CHECK(json_valid(checks_json)), declarations_json TEXT NOT NULL CHECK(json_valid(declarations_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX s_matter_closure_previews_person ON s_matter_closure_previews(matter_id,for_email,created_at);
CREATE TABLE s_matter_lifecycle_events(
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 kind TEXT NOT NULL CHECK(kind IN ('closed','reopened')), previous_revision TEXT NOT NULL, revision TEXT NOT NULL UNIQUE,
 reason TEXT NOT NULL, actor TEXT NOT NULL, actor_id TEXT NOT NULL, at TEXT NOT NULL,
 preview_id TEXT UNIQUE REFERENCES s_matter_closure_previews(id),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), exceptions TEXT NOT NULL CHECK(json_valid(exceptions)),
 restoration TEXT NOT NULL CHECK(json_valid(restoration)),
 CHECK((kind='closed' AND preview_id IS NOT NULL) OR (kind='reopened' AND preview_id IS NULL))
);
CREATE INDEX s_matter_lifecycle_events_matter ON s_matter_lifecycle_events(matter_id,at,id);
CREATE TRIGGER s_matter_closure_preview_no_update BEFORE UPDATE ON s_matter_closure_previews BEGIN SELECT RAISE(ABORT,'constraint: closure previews are immutable'); END;
CREATE TRIGGER s_matter_closure_preview_no_delete BEFORE DELETE ON s_matter_closure_previews BEGIN SELECT RAISE(ABORT,'constraint: closure previews are history'); END;
CREATE TRIGGER s_matter_lifecycle_event_no_update BEFORE UPDATE ON s_matter_lifecycle_events BEGIN SELECT RAISE(ABORT,'constraint: lifecycle decisions are immutable'); END;
CREATE TRIGGER s_matter_lifecycle_event_no_delete BEFORE DELETE ON s_matter_lifecycle_events BEGIN SELECT RAISE(ABORT,'constraint: lifecycle decisions are history'); END;
