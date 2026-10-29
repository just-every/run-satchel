-- Attribution remains bound to the preparing agent ID across display-name edits.
ALTER TABLE s_proposals ADD COLUMN prepared_agent_id TEXT;
