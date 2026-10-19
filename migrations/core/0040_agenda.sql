-- CAL-008: deadline kind and responsible owner, staff absences and their coverage.
ALTER TABLE s_deadlines ADD COLUMN kind TEXT NOT NULL DEFAULT 'deadline' CHECK(kind IN ('deadline','limitation','hearing','filing'));
ALTER TABLE s_deadlines ADD COLUMN owner_email TEXT;
CREATE TABLE s_deadline_owners(id TEXT PRIMARY KEY, deadline_id TEXT NOT NULL REFERENCES s_deadlines(id), owner_email TEXT NOT NULL, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL);
CREATE TRIGGER s_deadline_owner_history BEFORE UPDATE ON s_deadline_owners BEGIN SELECT RAISE(ABORT,'constraint: owner assignments are history'); END;
CREATE TRIGGER s_deadline_owner_delete BEFORE DELETE ON s_deadline_owners BEGIN SELECT RAISE(ABORT,'constraint: owner assignments are history'); END;
CREATE TABLE s_absences(id TEXT PRIMARY KEY, email TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL, CHECK(start_date<=end_date));
CREATE INDEX s_absences_email ON s_absences(email,start_date);
CREATE TRIGGER s_absence_history BEFORE UPDATE ON s_absences BEGIN SELECT RAISE(ABORT,'constraint: absences are history'); END;
CREATE TRIGGER s_absence_delete BEFORE DELETE ON s_absences BEGIN SELECT RAISE(ABORT,'constraint: absences are history'); END;
CREATE TABLE s_absence_coverage(id TEXT PRIMARY KEY, absence_id TEXT NOT NULL REFERENCES s_absences(id), covering_email TEXT NOT NULL, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL);
CREATE TRIGGER s_absence_coverage_history BEFORE UPDATE ON s_absence_coverage BEGIN SELECT RAISE(ABORT,'constraint: coverage assignments are history'); END;
CREATE TRIGGER s_absence_coverage_delete BEFORE DELETE ON s_absence_coverage BEGIN SELECT RAISE(ABORT,'constraint: coverage assignments are history'); END;
