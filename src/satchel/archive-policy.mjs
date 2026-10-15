// Complete native data, small-file originals, import provenance and review history.
// Identity, sessions, outboxes and private configuration stay in Base's exclusions.
export default {
 product: 'legal/satchel',
 excludeTables: ['s_agent_keys','s_guard'],
 replaceableTables: ['s_meta'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};
