-- TIME-001: per-person timers, weekly timesheet drafts and idempotent posting.
-- Existing entries stay billable; posted drafts carry their activity class and UTBMS codes.
ALTER TABLE s_entries ADD COLUMN billable INTEGER NOT NULL DEFAULT 1 CHECK(billable IN (0,1));
ALTER TABLE s_entries ADD COLUMN utbms_task TEXT;
ALTER TABLE s_entries ADD COLUMN utbms_activity TEXT;
CREATE TABLE s_timers (
 id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 description TEXT NOT NULL, billable INTEGER NOT NULL CHECK(billable IN (0,1)),
 status TEXT NOT NULL CHECK(status IN ('running','paused','stopped')),
 revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX s_timers_owner ON s_timers(owner_email,status);
-- At most one running timer per person: a second one can never overlap unnoticed.
CREATE UNIQUE INDEX s_timers_one_running ON s_timers(owner_email) WHERE status='running';
CREATE TABLE s_timer_intervals (
 id TEXT PRIMARY KEY, timer_id TEXT NOT NULL REFERENCES s_timers(id), owner_email TEXT NOT NULL,
 started_at TEXT NOT NULL, ended_at TEXT, started_channel TEXT NOT NULL, ended_reason TEXT
);
CREATE UNIQUE INDEX s_timer_open_interval ON s_timer_intervals(owner_email) WHERE ended_at IS NULL;
CREATE TABLE s_time_drafts (
 id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 date TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 rate_cents INTEGER NOT NULL CHECK(rate_cents BETWEEN 0 AND 100000000),
 description TEXT NOT NULL, billable INTEGER NOT NULL CHECK(billable IN (0,1)),
 utbms_task TEXT, utbms_activity TEXT,
 source TEXT NOT NULL CHECK(source IN ('timer','timesheet')), interval_id TEXT UNIQUE REFERENCES s_timer_intervals(id),
 status TEXT NOT NULL CHECK(status IN ('draft','rejected','posted')), entry_id TEXT UNIQUE REFERENCES s_entries(id),
 revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX s_time_drafts_day ON s_time_drafts(owner_email,date,status);
