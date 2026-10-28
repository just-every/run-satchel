-- ct split: retained originals remain immutable; new records carry typed policy.
ALTER TABLE s_conflict_reviews ADD COLUMN disposition TEXT CHECK(disposition IN('no_conflict','waiver_recorded','restrictions','decline'));
ALTER TABLE s_conflict_reviews ADD COLUMN excluded_staff TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(excluded_staff));
ALTER TABLE s_conflict_reviews ADD COLUMN screen_custodian TEXT;
CREATE TABLE s_conflict_routes(id TEXT PRIMARY KEY,search_id TEXT NOT NULL REFERENCES s_conflicts(id),route_id TEXT NOT NULL,requester_email TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(search_id,route_id));
CREATE TABLE s_conflict_route_decisions(id TEXT PRIMARY KEY,referral_id TEXT NOT NULL REFERENCES s_conflict_routes(id),revision TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN('no_conflict','waiver_recorded','restrictions','decline')),note TEXT NOT NULL,restrictions TEXT NOT NULL CHECK(json_valid(restrictions)),excluded_staff TEXT NOT NULL CHECK(json_valid(excluded_staff)),screen_custodian TEXT,waiver_id TEXT REFERENCES s_conflict_waivers(id),actor TEXT NOT NULL,created_at TEXT NOT NULL,sequence INTEGER NOT NULL,UNIQUE(referral_id,sequence));
CREATE TABLE s_conflict_waiver_details(waiver_id TEXT PRIMARY KEY REFERENCES s_conflict_waivers(id),parties TEXT NOT NULL CHECK(json_valid(parties)),waiver_date TEXT NOT NULL,scope TEXT NOT NULL,match_id TEXT NOT NULL,confirmation TEXT NOT NULL,label TEXT NOT NULL CHECK(label='practitioner-recorded, not signed through Satchel'));
CREATE TABLE s_staff_relationships(id TEXT PRIMARY KEY,party_id TEXT NOT NULL REFERENCES s_parties(id),staff_email TEXT NOT NULL,kind TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT,source TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_staff_relationship_added AFTER INSERT ON s_staff_relationships BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TABLE s_matter_exclusions(matter_id TEXT NOT NULL REFERENCES s_matters(id),email TEXT NOT NULL,restriction TEXT NOT NULL,recorded_by TEXT NOT NULL,at TEXT NOT NULL,released_by TEXT,released_at TEXT,release_reason TEXT,PRIMARY KEY(matter_id,email));
CREATE TRIGGER s_excluded_grant BEFORE INSERT ON s_matter_access WHEN EXISTS(SELECT 1 FROM s_matter_exclusions e WHERE e.matter_id=NEW.matter_id AND e.email=NEW.email AND e.released_at IS NULL) BEGIN SELECT RAISE(ABORT,'constraint: engagement restriction excludes staff'); END;
-- INTAKE-005's party-revision trigger is the atomic staleness fence. The application
-- also fences the latest counsel and every latest route decision in its batch.
DROP TRIGGER s_matter_conflict_disposition;
CREATE TRIGGER s_matter_conflict_disposition BEFORE INSERT ON s_matters WHEN (SELECT COALESCE(disposition,CASE decision WHEN 'declined' THEN 'decline' ELSE 'no_conflict' END) FROM s_conflict_reviews WHERE search_id=NEW.conflict_id ORDER BY sequence DESC LIMIT 1)='decline' BEGIN SELECT RAISE(ABORT,'stale conflict disposition'); END;
CREATE TRIGGER s_conflict_routes_update BEFORE UPDATE ON s_conflict_routes BEGIN SELECT RAISE(ABORT,'Conflict routes are immutable'); END;
CREATE TRIGGER s_conflict_routes_delete BEFORE DELETE ON s_conflict_routes BEGIN SELECT RAISE(ABORT,'Conflict routes are immutable'); END;
CREATE TRIGGER s_conflict_route_decisions_update BEFORE UPDATE ON s_conflict_route_decisions BEGIN SELECT RAISE(ABORT,'Conflict decisions are immutable'); END;
CREATE TRIGGER s_conflict_route_decisions_delete BEFORE DELETE ON s_conflict_route_decisions BEGIN SELECT RAISE(ABORT,'Conflict decisions are immutable'); END;
CREATE TRIGGER s_conflict_waiver_details_update BEFORE UPDATE ON s_conflict_waiver_details BEGIN SELECT RAISE(ABORT,'Waiver evidence is immutable'); END;
CREATE TRIGGER s_conflict_waiver_details_delete BEFORE DELETE ON s_conflict_waiver_details BEGIN SELECT RAISE(ABORT,'Waiver evidence is immutable'); END;
CREATE TRIGGER s_staff_relationships_update BEFORE UPDATE ON s_staff_relationships BEGIN SELECT RAISE(ABORT,'Staff relationships are immutable'); END;
CREATE TRIGGER s_staff_relationships_delete BEFORE DELETE ON s_staff_relationships BEGIN SELECT RAISE(ABORT,'Staff relationships are immutable'); END;

CREATE TRIGGER s_conflict_lead_insert AFTER INSERT ON s_leads BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_conflict_lead_update AFTER UPDATE ON s_leads BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
-- Counsel records the contact association; a public inquiry never claims an
-- existing identity or communication consent merely by supplying its name.
CREATE TABLE s_lead_contacts(lead_id TEXT NOT NULL REFERENCES s_leads(id),party_id TEXT NOT NULL REFERENCES s_parties(id),actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(lead_id,party_id));
CREATE TRIGGER s_lead_contact_added AFTER INSERT ON s_lead_contacts BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
