-- REPORT-001: legacy closures stay unrecorded; never derive a legal result from a reason.
CREATE TABLE s_matter_outcomes (
 id TEXT PRIMARY KEY,
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 event_id TEXT NOT NULL UNIQUE REFERENCES s_matter_lifecycle_events(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('won','settled','lost','dismissed','withdrawn','transactional_complete','other')),
 note TEXT,
 recorded_by TEXT NOT NULL,
 at TEXT NOT NULL,
 CHECK(note IS NULL OR (length(trim(note))>0 AND length(note)<=2000)),
 CHECK(outcome<>'other' OR (note IS NOT NULL AND length(trim(note))>0))
);
CREATE INDEX s_matter_outcomes_matter ON s_matter_outcomes(matter_id,at,id);
CREATE TRIGGER s_matter_outcome_closed_event BEFORE INSERT ON s_matter_outcomes
 WHEN NOT EXISTS(SELECT 1 FROM s_matter_lifecycle_events e WHERE e.id=NEW.event_id AND e.matter_id=NEW.matter_id AND e.kind='closed' AND e.actor=NEW.recorded_by AND e.at=NEW.at)
 BEGIN SELECT RAISE(ABORT,'constraint: outcome must belong to its attributed closure'); END;
CREATE TRIGGER s_matter_outcome_no_update BEFORE UPDATE ON s_matter_outcomes
 BEGIN SELECT RAISE(ABORT,'constraint: legal outcomes are immutable'); END;
CREATE TRIGGER s_matter_outcome_no_delete BEFORE DELETE ON s_matter_outcomes
 BEGIN SELECT RAISE(ABORT,'constraint: legal outcomes are history'); END;
