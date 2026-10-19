-- Profiles augment stable source party IDs; merges never remove source parties.
CREATE TABLE s_contact_profiles (
 party_id TEXT PRIMARY KEY REFERENCES s_parties(id),
 kind TEXT NOT NULL CHECK(kind IN ('person','organization')),
 display_name TEXT NOT NULL,
 aliases TEXT NOT NULL,
 former_names TEXT NOT NULL,
 emails TEXT NOT NULL,
 phones TEXT NOT NULL,
 addresses TEXT NOT NULL,
 revision TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE s_contact_relationships (
 id TEXT PRIMARY KEY,
 from_id TEXT NOT NULL REFERENCES s_parties(id),
 to_id TEXT NOT NULL REFERENCES s_parties(id),
 relationship TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CHECK(from_id<>to_id),
 UNIQUE(from_id,to_id,relationship)
);
CREATE TABLE s_contact_matter_roles (
 id TEXT PRIMARY KEY,
 party_id TEXT NOT NULL REFERENCES s_parties(id),
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 role TEXT NOT NULL CHECK(role IN ('client','adverse','insurer','witness','expert','counsel')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(party_id,matter_id,role)
);
CREATE TABLE s_contact_consents (
 id TEXT PRIMARY KEY,
 sequence INTEGER NOT NULL UNIQUE,
 party_id TEXT NOT NULL REFERENCES s_parties(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','phone','sms','post')),
 decision TEXT NOT NULL CHECK(decision IN ('allowed','denied','unknown')),
 effective_date TEXT NOT NULL,
 source TEXT NOT NULL,
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL
);
CREATE TABLE s_contact_merges (
 losing_id TEXT PRIMARY KEY REFERENCES s_parties(id),
 survivor_id TEXT NOT NULL REFERENCES s_parties(id),
 reason TEXT NOT NULL,
 reviewed_revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL,
 merged_by TEXT NOT NULL,
 merged_at TEXT NOT NULL,
 CHECK(losing_id<>survivor_id)
);
CREATE TRIGGER s_contact_profile_insert AFTER INSERT ON s_contact_profiles BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_profile_update AFTER UPDATE ON s_contact_profiles BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_relationship_insert AFTER INSERT ON s_contact_relationships BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_role_insert AFTER INSERT ON s_contact_matter_roles BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_consent_insert AFTER INSERT ON s_contact_consents BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_merge_insert AFTER INSERT ON s_contact_merges BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_merge_no_update BEFORE UPDATE ON s_contact_merges BEGIN SELECT RAISE(ABORT,'contact merge history is immutable'); END;
CREATE TRIGGER s_contact_merge_no_delete BEFORE DELETE ON s_contact_merges BEGIN SELECT RAISE(ABORT,'contact merge history is immutable'); END;
CREATE TRIGGER s_contact_consent_no_update BEFORE UPDATE ON s_contact_consents BEGIN SELECT RAISE(ABORT,'contact consent history is immutable'); END;
CREATE TRIGGER s_contact_consent_no_delete BEFORE DELETE ON s_contact_consents BEGIN SELECT RAISE(ABORT,'contact consent history is immutable'); END;
CREATE TABLE s_contact_merge_previews (
 id TEXT PRIMARY KEY,
 for_email TEXT NOT NULL,
 role TEXT NOT NULL,
 graph_revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL,
 applied_at TEXT
);
