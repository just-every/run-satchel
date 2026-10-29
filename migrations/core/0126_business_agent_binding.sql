-- A principal explicitly links an existing native preparation credential to a
-- Business agent. The link neither creates people nor grants matter access.
ALTER TABLE s_agent_keys ADD COLUMN business_agent_id TEXT;
CREATE UNIQUE INDEX s_agent_keys_business_agent ON s_agent_keys(owner_id,business_agent_id) WHERE business_agent_id IS NOT NULL AND revoked=0;
ALTER TABLE s_proposals ADD COLUMN sponsor_id TEXT;
