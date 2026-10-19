-- MATTER-002: firm-defined evidence gates and deliberate, attributed transitions.
-- No stages or matter assignments are seeded. Existing matters remain unassigned.
CREATE TABLE s_matter_stages (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 required_types TEXT NOT NULL CHECK(json_valid(required_types) AND json_type(required_types)='array'),
 position INTEGER NOT NULL CHECK(position>=0), revision TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_matter_stage_name ON s_matter_stages(lower(name));
CREATE TABLE s_matter_stage_profiles (
 matter_id TEXT PRIMARY KEY REFERENCES s_matters(id),
 stage_id TEXT REFERENCES s_matter_stages(id), lawyer_email TEXT,
 risk TEXT CHECK(risk IN ('low','medium','high','urgent')),
 milestone TEXT, milestone_date TEXT, revision TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX s_matter_stage_board ON s_matter_stage_profiles(stage_id,lawyer_email,risk);
-- Each event retains its reviewed stage requirements, profile and immutable
-- original version/digest snapshot, even after configuration or originals change.
CREATE TABLE s_matter_stage_events (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 kind TEXT NOT NULL CHECK(kind IN ('profile','transition','blocked')),
 detail TEXT NOT NULL CHECK(json_valid(detail)), actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX s_matter_stage_history ON s_matter_stage_events(matter_id,at,id);
CREATE TRIGGER s_matter_stage_event_immutable_update BEFORE UPDATE ON s_matter_stage_events
 BEGIN SELECT RAISE(ABORT,'immutable matter stage event'); END;
CREATE TRIGGER s_matter_stage_event_immutable_delete BEFORE DELETE ON s_matter_stage_events
 BEGIN SELECT RAISE(ABORT,'immutable matter stage event'); END;
