-- CAL-001: matter appointments with recurrence, attendees and append-only occurrence changes.
CREATE TABLE s_appointments(id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL, start_date TEXT NOT NULL, start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 1440), frequency TEXT NOT NULL CHECK(frequency IN ('once','daily','weekly')), repeat_interval INTEGER NOT NULL CHECK(repeat_interval BETWEEN 1 AND 12), occurrences INTEGER NOT NULL CHECK(occurrences BETWEEN 1 AND 104), created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX s_appointments_matter ON s_appointments(matter_id);
CREATE TRIGGER s_appointment_immutable BEFORE UPDATE ON s_appointments BEGIN SELECT RAISE(ABORT,'constraint: appointment series are append-only'); END;
CREATE TRIGGER s_appointment_delete BEFORE DELETE ON s_appointments BEGIN SELECT RAISE(ABORT,'constraint: appointment history is kept'); END;
CREATE TABLE s_appointment_attendees(appointment_id TEXT NOT NULL REFERENCES s_appointments(id), email TEXT NOT NULL, PRIMARY KEY(appointment_id,email));
CREATE INDEX s_appointment_attendee_email ON s_appointment_attendees(email);
CREATE TRIGGER s_appointment_attendee_immutable BEFORE UPDATE ON s_appointment_attendees BEGIN SELECT RAISE(ABORT,'constraint: attendees are history'); END;
CREATE TRIGGER s_appointment_attendee_delete BEFORE DELETE ON s_appointment_attendees BEGIN SELECT RAISE(ABORT,'constraint: attendees are history'); END;
CREATE TABLE s_appointment_changes(id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL REFERENCES s_appointments(id), occurrence INTEGER NOT NULL CHECK(occurrence>=0), kind TEXT NOT NULL CHECK(kind IN ('cancelled','moved')), new_date TEXT, new_time TEXT, reason TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TEXT NOT NULL, CHECK((kind='moved')=(new_date IS NOT NULL AND new_time IS NOT NULL)));
CREATE UNIQUE INDEX s_appointment_cancel_once ON s_appointment_changes(appointment_id,occurrence) WHERE kind='cancelled';
CREATE TRIGGER s_appointment_change_after_cancel BEFORE INSERT ON s_appointment_changes WHEN EXISTS(SELECT 1 FROM s_appointment_changes c WHERE c.appointment_id=NEW.appointment_id AND c.occurrence=NEW.occurrence AND c.kind='cancelled') BEGIN SELECT RAISE(ABORT,'constraint: a cancelled occurrence stays cancelled'); END;
CREATE TRIGGER s_appointment_change_immutable BEFORE UPDATE ON s_appointment_changes BEGIN SELECT RAISE(ABORT,'constraint: appointment changes are history'); END;
CREATE TRIGGER s_appointment_change_delete BEFORE DELETE ON s_appointment_changes BEGIN SELECT RAISE(ABORT,'constraint: appointment changes are history'); END;
