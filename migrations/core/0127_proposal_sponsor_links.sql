-- Destination-local admission links for explicitly restored proposals. Historical
-- source rows and their sponsor/preparer attribution remain byte-identical.
CREATE TABLE s_proposal_sponsor_links (
 proposal_id TEXT PRIMARY KEY,
 operator_id TEXT NOT NULL
);
