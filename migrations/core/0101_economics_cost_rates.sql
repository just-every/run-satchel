-- REPORT-002: principal-reviewed staff costing is append-only and never a billing rate.
CREATE TABLE s_staff_cost_rates (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, effective_from TEXT NOT NULL,
 hourly_cents INTEGER NOT NULL CHECK(hourly_cents BETWEEN 0 AND 100000000),
 reason TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
 UNIQUE(email,effective_from)
);
CREATE TRIGGER s_staff_cost_rates_immutable_update BEFORE UPDATE ON s_staff_cost_rates BEGIN SELECT RAISE(ABORT,'Cost approvals are immutable'); END;
CREATE TRIGGER s_staff_cost_rates_immutable_delete BEFORE DELETE ON s_staff_cost_rates BEGIN SELECT RAISE(ABORT,'Cost approvals are retained'); END;
