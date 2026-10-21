CREATE TABLE s_conflict_waiver_matters(waiver_id TEXT NOT NULL REFERENCES s_conflict_waivers(id),matter_id TEXT NOT NULL REFERENCES s_matters(id),PRIMARY KEY(waiver_id,matter_id));
CREATE TABLE s_conflict_disposals(id TEXT PRIMARY KEY,waiver_id TEXT NOT NULL UNIQUE REFERENCES s_conflict_waivers(id),reason TEXT NOT NULL,journal TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL);
-- Like document originals, only approved erasure may clear bytes; metadata stays.
DROP TRIGGER s_conflict_waiver_chunks_immutable_update;
CREATE TRIGGER s_conflict_waiver_chunks_immutable_update BEFORE UPDATE ON s_conflict_waiver_chunks WHEN NEW.waiver_id IS NOT OLD.waiver_id OR NEW.position IS NOT OLD.position OR NEW.content_base64<>'' OR NOT EXISTS(SELECT 1 FROM s_conflict_disposals d WHERE d.waiver_id=OLD.waiver_id) BEGIN SELECT RAISE(ABORT,'Original conflict waivers are immutable'); END;
DROP TRIGGER s_conflict_waiver_details_update;
CREATE TRIGGER s_conflict_waiver_details_update BEFORE UPDATE ON s_conflict_waiver_details WHEN NEW.waiver_id IS NOT OLD.waiver_id OR NEW.parties IS NOT OLD.parties OR NEW.waiver_date IS NOT OLD.waiver_date OR NEW.scope IS NOT OLD.scope OR NEW.match_id IS NOT OLD.match_id OR NEW.label IS NOT OLD.label OR NEW.confirmation<>'' OR NOT EXISTS(SELECT 1 FROM s_conflict_disposals d WHERE d.waiver_id=OLD.waiver_id) BEGIN SELECT RAISE(ABORT,'Waiver evidence is immutable'); END;
CREATE TRIGGER s_conflict_disposals_update BEFORE UPDATE ON s_conflict_disposals BEGIN SELECT RAISE(ABORT,'Conflict disposal is immutable'); END;
CREATE TRIGGER s_conflict_disposals_delete BEFORE DELETE ON s_conflict_disposals BEGIN SELECT RAISE(ABORT,'Conflict disposal is immutable'); END;
