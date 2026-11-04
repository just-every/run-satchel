-- Names are captured when prepared, never reconstructed from a current roster.
-- Existing labels and absent identity components stay exactly as recorded.
ALTER TABLE s_proposals ADD COLUMN prepared_identity TEXT;

CREATE TRIGGER s_proposal_attribution_immutable
BEFORE UPDATE OF prepared_identity, prepared_agent_id, sponsor_id, agent_label, for_email ON s_proposals
WHEN NEW.prepared_identity IS NOT OLD.prepared_identity
 OR NEW.prepared_agent_id IS NOT OLD.prepared_agent_id
 OR NEW.sponsor_id IS NOT OLD.sponsor_id
 OR NEW.agent_label IS NOT OLD.agent_label
 OR NEW.for_email IS NOT OLD.for_email
BEGIN
 SELECT RAISE(ABORT, 'preparation attribution is immutable');
END;
