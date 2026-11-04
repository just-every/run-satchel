-- Recover retained successful observations on installations predating diagnostics.
-- Later uncertain reads do not erase a known success, and a recorded observation wins.
UPDATE s_microsoft_connector
SET last_success_at=(SELECT MAX(finished_at) FROM s_microsoft_jobs WHERE status='succeeded')
WHERE last_success_at IS NULL;
