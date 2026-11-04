-- Keep the current-evidence predicate shared and shallow in composed access guards.
-- A retained source identity cannot keep earlier matter authority after replacement.
CREATE VIEW s_current_contact_representatives AS
SELECT r.id FROM s_contact_representatives r
WHERE r.withdrawn=0
 AND r.sequence=(SELECT MAX(latest.sequence) FROM s_contact_representatives latest
  WHERE latest.party_id IN(SELECT value FROM json_each(r.identity_ids)) AND latest.matter_id=r.matter_id)
 AND NOT EXISTS(SELECT 1 FROM s_representative_invalidations invalid WHERE invalid.evidence_id=r.id);
