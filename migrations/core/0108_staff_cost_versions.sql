-- Saved cost revisions and their exact approvals remain independent append-only records.
CREATE TABLE s_staff_cost_revisions (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, effective_from TEXT NOT NULL,
 hourly_cents INTEGER NOT NULL CHECK(hourly_cents BETWEEN 0 AND 100000000),
 reason TEXT NOT NULL, supersedes_id TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_staff_cost_approvals (
 revision_id TEXT PRIMARY KEY REFERENCES s_staff_cost_revisions(id),
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TRIGGER s_staff_cost_revisions_immutable_update BEFORE UPDATE ON s_staff_cost_revisions BEGIN SELECT RAISE(ABORT,'Saved cost revisions are immutable'); END;
CREATE TRIGGER s_staff_cost_revisions_immutable_delete BEFORE DELETE ON s_staff_cost_revisions BEGIN SELECT RAISE(ABORT,'Saved cost revisions are retained'); END;
CREATE TRIGGER s_staff_cost_approvals_immutable_update BEFORE UPDATE ON s_staff_cost_approvals BEGIN SELECT RAISE(ABORT,'Cost approvals are immutable'); END;
CREATE TRIGGER s_staff_cost_approvals_immutable_delete BEFORE DELETE ON s_staff_cost_approvals BEGIN SELECT RAISE(ABORT,'Cost approvals are retained'); END;
CREATE VIEW s_approved_staff_cost_rates AS
 SELECT c.*,c.approved_by created_by,c.approved_at created_at FROM s_staff_cost_rates c
 WHERE NOT EXISTS(SELECT 1 FROM s_staff_cost_revisions r JOIN s_staff_cost_approvals a ON a.revision_id=r.id WHERE r.supersedes_id=c.id)
 UNION ALL
 SELECT r.id,r.email,r.effective_from,r.hourly_cents,r.reason,a.approved_by,a.approved_at,r.created_by,r.created_at
 FROM s_staff_cost_revisions r JOIN s_staff_cost_approvals a ON a.revision_id=r.id
 WHERE NOT EXISTS(SELECT 1 FROM s_staff_cost_revisions next JOIN s_staff_cost_approvals approved ON approved.revision_id=next.id WHERE next.supersedes_id=r.id);
