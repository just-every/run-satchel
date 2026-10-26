-- Recorded preferences do not grant consent, recipient authority or translation.
CREATE TABLE s_contact_preferences (
 id TEXT PRIMARY KEY,
 sequence INTEGER NOT NULL UNIQUE,
 party_id TEXT NOT NULL REFERENCES s_parties(id),
 language TEXT NOT NULL,
 accessibility TEXT NOT NULL,
 source TEXT NOT NULL,
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL
);
CREATE TRIGGER s_contact_preference_insert AFTER INSERT ON s_contact_preferences BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_preference_no_update BEFORE UPDATE ON s_contact_preferences BEGIN SELECT RAISE(ABORT,'contact preference history is immutable'); END;
CREATE TRIGGER s_contact_preference_no_delete BEFORE DELETE ON s_contact_preferences BEGIN SELECT RAISE(ABORT,'contact preference history is immutable'); END;
