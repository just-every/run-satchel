-- TIME-003: append-only fee-agreement rate rules, versioned matter budgets and
-- once-per-level budget alerts. Recorded entries keep the price resolved when recorded.
CREATE TABLE s_rate_rules (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('firm','client','matter')), scope_key TEXT NOT NULL,
 timekeeper_email TEXT, utbms_task TEXT, effective_from TEXT NOT NULL,
 rate_cents INTEGER NOT NULL CHECK(rate_cents BETWEEN 0 AND 100000000),
 increment_minutes INTEGER NOT NULL CHECK(increment_minutes BETWEEN 1 AND 60),
 discount_bps INTEGER NOT NULL CHECK(discount_bps BETWEEN 0 AND 10000), billable INTEGER NOT NULL CHECK(billable IN (0,1)),
 note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_rate_rule_key ON s_rate_rules(scope,scope_key,COALESCE(timekeeper_email,''),COALESCE(utbms_task,''),effective_from);
CREATE TRIGGER s_rate_rules_immutable_update BEFORE UPDATE ON s_rate_rules BEGIN SELECT RAISE(ABORT,'constraint: rate rules are versioned history'); END;
CREATE TRIGGER s_rate_rules_immutable_delete BEFORE DELETE ON s_rate_rules BEGIN SELECT RAISE(ABORT,'constraint: rate rules are versioned history'); END;
CREATE TABLE s_matter_budgets (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), version INTEGER NOT NULL CHECK(version>0),
 cents INTEGER NOT NULL CHECK(cents BETWEEN 1 AND 1000000000000), alert_percent INTEGER NOT NULL CHECK(alert_percent BETWEEN 1 AND 100),
 note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(matter_id,version)
);
CREATE TRIGGER s_matter_budgets_immutable_update BEFORE UPDATE ON s_matter_budgets BEGIN SELECT RAISE(ABORT,'constraint: budgets are versioned history'); END;
CREATE TRIGGER s_matter_budgets_immutable_delete BEFORE DELETE ON s_matter_budgets BEGIN SELECT RAISE(ABORT,'constraint: budgets are versioned history'); END;
CREATE TABLE s_budget_alerts (
 id TEXT PRIMARY KEY, budget_id TEXT NOT NULL REFERENCES s_matter_budgets(id), matter_id TEXT NOT NULL REFERENCES s_matters(id),
 level TEXT NOT NULL CHECK(level IN ('threshold','exceeded')), used_cents INTEGER NOT NULL, budget_cents INTEGER NOT NULL,
 entry_id TEXT REFERENCES s_entries(id), at TEXT NOT NULL, UNIQUE(budget_id,level)
);
CREATE TRIGGER s_budget_alerts_immutable_update BEFORE UPDATE ON s_budget_alerts BEGIN SELECT RAISE(ABORT,'constraint: budget alerts are history'); END;
CREATE TRIGGER s_budget_alerts_immutable_delete BEFORE DELETE ON s_budget_alerts BEGIN SELECT RAISE(ABORT,'constraint: budget alerts are history'); END;
-- Entries record how their charge was priced; earlier entries keep NULL (exact as entered).
ALTER TABLE s_entries ADD COLUMN billed_minutes INTEGER;
ALTER TABLE s_entries ADD COLUMN discount_bps INTEGER;
ALTER TABLE s_entries ADD COLUMN rate_rule_id TEXT;
ALTER TABLE s_entries ADD COLUMN rate_source TEXT CHECK(rate_source IS NULL OR rate_source IN ('entry','rule','firm-default'));
-- A draft with an explicit rate keeps it; other drafts are priced by the fee agreement.
ALTER TABLE s_time_drafts ADD COLUMN rate_source TEXT NOT NULL DEFAULT 'schedule' CHECK(rate_source IN ('entry','schedule'));
