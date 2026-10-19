-- MATTER-001: versioned practice matter types and typed matter fields.
-- A type change writes a new immutable version; matters keep the version they
-- were validated against until counsel explicitly adopts a newer one.
CREATE TABLE s_matter_types (
 id TEXT PRIMARY KEY, practice_code TEXT NOT NULL, name TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0), revision TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_matter_type_name ON s_matter_types(lower(name));
CREATE TABLE s_matter_type_versions (
 type_id TEXT NOT NULL REFERENCES s_matter_types(id), version INTEGER NOT NULL CHECK(version>0),
 practice_code TEXT NOT NULL, name TEXT NOT NULL,
 definition TEXT NOT NULL CHECK(json_valid(definition)),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(type_id,version)
);
CREATE TRIGGER s_matter_type_version_immutable_update BEFORE UPDATE ON s_matter_type_versions
 BEGIN SELECT RAISE(ABORT,'immutable matter type version'); END;
CREATE TRIGGER s_matter_type_version_immutable_delete BEFORE DELETE ON s_matter_type_versions
 BEGIN SELECT RAISE(ABORT,'immutable matter type version'); END;
CREATE TABLE s_matter_fields (
 matter_id TEXT PRIMARY KEY REFERENCES s_matters(id),
 type_id TEXT, type_version INTEGER,
 case_number TEXT, court TEXT, insurance_limit_cents INTEGER CHECK(insurance_limit_cents IS NULL OR insurance_limit_cents>=0),
 fee_arrangement TEXT CHECK(fee_arrangement IS NULL OR fee_arrangement IN ('hourly','flat_fee','contingency','hybrid','pro_bono')),
 fee_terms TEXT, custom TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(custom)),
 revision TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(type_id,type_version) REFERENCES s_matter_type_versions(type_id,version)
);
CREATE INDEX s_matter_case_number ON s_matter_fields(case_number);
CREATE TABLE s_matter_field_events (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 kind TEXT NOT NULL CHECK(kind IN ('saved','adopted','imported')),
 detail TEXT NOT NULL CHECK(json_valid(detail)), actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX s_matter_field_history ON s_matter_field_events(matter_id,at,id);
CREATE TRIGGER s_matter_field_event_immutable_update BEFORE UPDATE ON s_matter_field_events
 BEGIN SELECT RAISE(ABORT,'immutable matter field event'); END;
CREATE TRIGGER s_matter_field_event_immutable_delete BEFORE DELETE ON s_matter_field_events
 BEGIN SELECT RAISE(ABORT,'immutable matter field event'); END;
