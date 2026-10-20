-- REPORT-001: attribution belongs to the intake lead, including unassigned practice.
-- Keep historical codes when the firm replaces its configured practice areas.
ALTER TABLE s_leads ADD COLUMN practice_code TEXT;
CREATE INDEX s_leads_practice ON s_leads(practice_code,status);
