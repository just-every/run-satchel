-- Practitioner evidence is history, never a legal certification or a grant.
CREATE TABLE s_contact_representatives (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 party_id TEXT NOT NULL REFERENCES s_parties(id),
 matter_id TEXT NOT NULL REFERENCES s_matters(id),
 previous_id TEXT REFERENCES s_contact_representatives(id),
 recipient TEXT NOT NULL,
 represented_email TEXT NOT NULL,
 authority_evidence TEXT NOT NULL,
 verification_evidence TEXT NOT NULL,
 withdrawn INTEGER NOT NULL CHECK(withdrawn IN(0,1)),
 graph_revision INTEGER NOT NULL,
 identity_ids TEXT NOT NULL,
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_representative_revision_once ON s_contact_representatives(previous_id) WHERE previous_id IS NOT NULL;
CREATE TABLE s_representative_reviews(id TEXT PRIMARY KEY,evidence_id TEXT NOT NULL REFERENCES s_contact_representatives(id),reviewed_by TEXT NOT NULL,reviewed_at TEXT NOT NULL,reason TEXT NOT NULL);
-- Installation-local activation and grant bindings never travel in an archive.
CREATE TABLE s_representative_local_reviews(review_id TEXT PRIMARY KEY REFERENCES s_representative_reviews(id));
CREATE TABLE s_representative_grants(grant_id TEXT PRIMARY KEY REFERENCES s_portal_grants(id),evidence_id TEXT NOT NULL REFERENCES s_contact_representatives(id),review_id TEXT NOT NULL REFERENCES s_representative_reviews(id),represented_grant_id TEXT NOT NULL REFERENCES s_portal_grants(id));
CREATE TABLE s_correspondence_recipient_grants(correspondence_id TEXT PRIMARY KEY REFERENCES s_correspondence(id),grant_id TEXT NOT NULL REFERENCES s_portal_grants(id));
ALTER TABLE s_client_reminder_jobs ADD COLUMN recipient_grant_id TEXT;
ALTER TABLE s_request_reminders ADD COLUMN recipient_grant_id TEXT;
CREATE TRIGGER s_representatives_no_update BEFORE UPDATE ON s_contact_representatives BEGIN SELECT RAISE(ABORT,'Representative evidence is append-only'); END;
CREATE TRIGGER s_representatives_no_delete BEFORE DELETE ON s_contact_representatives BEGIN SELECT RAISE(ABORT,'Representative evidence is retained'); END;
CREATE TRIGGER s_representative_reviews_no_update BEFORE UPDATE ON s_representative_reviews BEGIN SELECT RAISE(ABORT,'Representative reviews are append-only'); END;
CREATE TRIGGER s_representative_reviews_no_delete BEFORE DELETE ON s_representative_reviews BEGIN SELECT RAISE(ABORT,'Representative reviews are retained'); END;
CREATE TRIGGER s_representative_grants_no_update BEFORE UPDATE ON s_representative_grants BEGIN SELECT RAISE(ABORT,'Representative bindings are immutable'); END;
CREATE TRIGGER s_recipient_grants_no_update BEFORE UPDATE ON s_correspondence_recipient_grants BEGIN SELECT RAISE(ABORT,'Recipient bindings are immutable'); END;
CREATE TRIGGER s_client_reminder_grant_no_update BEFORE UPDATE OF recipient_grant_id ON s_client_reminder_jobs BEGIN SELECT RAISE(ABORT,'Scheduled recipient bindings are immutable'); END;
CREATE TRIGGER s_request_reminder_grant_no_update BEFORE UPDATE OF recipient_grant_id ON s_request_reminders BEGIN SELECT RAISE(ABORT,'Request recipient bindings are immutable'); END;

CREATE TABLE s_representative_invalidations(evidence_id TEXT PRIMARY KEY REFERENCES s_contact_representatives(id),merge_id TEXT NOT NULL REFERENCES s_contact_merges(losing_id));
-- Merge records invalidate every affected identity atomically, including a prior survivor.
CREATE TRIGGER s_representative_merge_fence AFTER INSERT ON s_contact_merges BEGIN
 INSERT OR IGNORE INTO s_representative_invalidations SELECT r.id,NEW.losing_id FROM s_contact_representatives r WHERE EXISTS(SELECT 1 FROM json_each(r.identity_ids) identity WHERE identity.value IN(NEW.losing_id,NEW.survivor_id));
 UPDATE s_portal_grants SET revoked_by=NEW.merged_by,revoked_at=NEW.merged_at,revoke_reason='Identity merged; fresh representative evidence and grant required' WHERE revoked_at IS NULL AND id IN(SELECT binding.grant_id FROM s_representative_grants binding JOIN s_representative_invalidations invalid ON invalid.evidence_id=binding.evidence_id);
END;
