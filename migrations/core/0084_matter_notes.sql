-- MATTER-005: matter notes, calls and client commitments. A private note is visible to its author alone; a team note
-- to everyone who sees the matter; a client-visible entry (always a team entry) appears in that matter's client timeline.
-- Entries are append-only: a correction is a new entry that cites the old one.
CREATE TABLE s_matter_notes(id TEXT PRIMARY KEY,matter_id TEXT NOT NULL REFERENCES s_matters(id),kind TEXT NOT NULL CHECK(kind IN('note','call','commitment')),title TEXT NOT NULL,body TEXT NOT NULL,visibility TEXT NOT NULL CHECK(visibility IN('private','team')),client_visible INTEGER NOT NULL CHECK(client_visible IN(0,1)),occurred_at TEXT NOT NULL,mentions TEXT NOT NULL CHECK(json_valid(mentions)),corrects TEXT REFERENCES s_matter_notes(id),author_email TEXT NOT NULL,created_at TEXT NOT NULL,CHECK(visibility='team' OR client_visible=0),CHECK(visibility='team' OR mentions='[]'));
CREATE INDEX s_matter_notes_matter ON s_matter_notes(matter_id,occurred_at);
CREATE TRIGGER s_matter_note_update BEFORE UPDATE ON s_matter_notes BEGIN SELECT RAISE(ABORT,'constraint: matter notes are append-only'); END;
CREATE TRIGGER s_matter_note_delete BEFORE DELETE ON s_matter_notes BEGIN SELECT RAISE(ABORT,'constraint: matter notes are append-only'); END;
