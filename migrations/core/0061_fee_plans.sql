-- TIME-004: reviewed terms, durable occurrence identity, explicit earning reviews.
CREATE TABLE s_fee_plans (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 terms TEXT NOT NULL CHECK(json_valid(terms)), created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_fee_occurrences (
 plan_id TEXT NOT NULL REFERENCES s_fee_plans(id), period TEXT NOT NULL,
 bill_id TEXT NOT NULL REFERENCES s_bills(id), PRIMARY KEY(plan_id,period)
);
CREATE TABLE s_fee_earning_reviews (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), earned_cents INTEGER NOT NULL,
 trust_eligible INTEGER NOT NULL CHECK(trust_eligible IN(0,1)),
 evidence TEXT NOT NULL, reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TRIGGER s_fee_plans_update BEFORE UPDATE ON s_fee_plans BEGIN SELECT RAISE(ABORT,'reviewed fee terms are immutable'); END;
CREATE TRIGGER s_fee_plans_delete BEFORE DELETE ON s_fee_plans BEGIN SELECT RAISE(ABORT,'reviewed fee terms are immutable'); END;
CREATE TRIGGER s_fee_occurrences_update BEFORE UPDATE ON s_fee_occurrences BEGIN SELECT RAISE(ABORT,'fee occurrences are immutable'); END;
CREATE TRIGGER s_fee_occurrences_delete BEFORE DELETE ON s_fee_occurrences BEGIN SELECT RAISE(ABORT,'fee occurrences are immutable'); END;
CREATE TRIGGER s_fee_earning_reviews_update BEFORE UPDATE ON s_fee_earning_reviews BEGIN SELECT RAISE(ABORT,'earning reviews are immutable'); END;
CREATE TRIGGER s_fee_earning_reviews_delete BEFORE DELETE ON s_fee_earning_reviews BEGIN SELECT RAISE(ABORT,'earning reviews are immutable'); END;
CREATE TABLE s_fee_schedule_errors (id TEXT PRIMARY KEY,matter_id TEXT NOT NULL REFERENCES s_matters(id),at TEXT NOT NULL,reason TEXT NOT NULL);
