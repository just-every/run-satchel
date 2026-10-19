CREATE TABLE s_reminder_rules (
 id TEXT PRIMARY KEY, deadline_id TEXT NOT NULL REFERENCES s_deadlines(id), recipient TEXT NOT NULL, backup TEXT NOT NULL,
 advance_days INTEGER NOT NULL, send_time TEXT NOT NULL, quiet_start TEXT NOT NULL, quiet_end TEXT NOT NULL, channels TEXT NOT NULL,
 escalate_hours INTEGER NOT NULL, due_at INTEGER NOT NULL, revision TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('active','superseded','cancelled')),
 created_by TEXT NOT NULL, created_email TEXT NOT NULL, created_role TEXT NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX s_reminder_active ON s_reminder_rules(deadline_id) WHERE status='active';
CREATE TABLE s_reminder_deliveries (
 id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES s_reminder_rules(id), stage TEXT NOT NULL CHECK(stage IN('reminder','escalation')),
 channel TEXT NOT NULL CHECK(channel IN('email','workspace')), recipient TEXT NOT NULL, status TEXT NOT NULL,
 scheduled_for INTEGER NOT NULL, claim TEXT, claimed_at INTEGER, attempted_at TEXT, provider TEXT, provider_id TEXT, detail TEXT NOT NULL DEFAULT '',
 acknowledged_at TEXT, acknowledged_by TEXT, resolved_at TEXT, resolved_by TEXT, resolution TEXT, evidence TEXT,
 UNIQUE(rule_id,stage,channel)
);
CREATE INDEX s_reminder_due ON s_reminder_deliveries(status,scheduled_for);
