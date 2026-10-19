// Complete native data, small-file originals, import provenance and review history.
// Identity, sessions, outboxes and private configuration stay in Base's exclusions.
export default {
 product: 'legal/satchel',
 excludeTables: ['s_agent_keys','s_guard','s_intake_tokens','s_intake_rate_limits','s_intake_uploads'],
 buckets: { originals: { prefix: 'intake/', objectReferences: { table: 's_intake_files', keyColumn: 'object_key' } } },
 replaceableTables: ['s_meta','s_number_settings','s_trust_transfer_policy'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};
