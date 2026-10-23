// Complete native data, small-file originals, import provenance and review history.
// Identity, sessions, outboxes and private configuration stay in Base's exclusions.
export default {
 product: 'legal/satchel',
 excludeTables: ['s_billing_money_revision','s_agent_keys','s_guard','s_intake_tokens','s_intake_rate_limits','s_intake_uploads','s_integrations','s_integration_requests','s_integration_events','s_webhook_deliveries','s_webhook_attempts','s_consult_rate_limits'],
 buckets: { originals: { prefix: 'intake/', objectReferences: { table: 's_intake_files', keyColumn: 'object_key' } } },
 replaceableTables: ['s_meta','s_number_settings','s_trust_transfer_policy'],
 requiredConfiguration: ['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','MAIL_PROVIDER','MAIL_FROM'],
};
