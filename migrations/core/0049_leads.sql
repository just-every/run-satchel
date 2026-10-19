-- INTAKE-002: prospective-client leads through firm-edited stages, with assignment,
-- qualification, referral source, consultation outcome, next action and append-only history.
CREATE TABLE s_lead_stages (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0),
 revision TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX s_lead_stage_name ON s_lead_stages(lower(name));
CREATE TABLE s_leads (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL,
 referral_source TEXT NOT NULL, stage_id TEXT REFERENCES s_lead_stages(id), assigned_email TEXT,
 qualification TEXT NOT NULL DEFAULT 'pending' CHECK(qualification IN ('pending','qualified','not_qualified')),
 consultation_outcome TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '', next_action_date TEXT,
 status TEXT NOT NULL CHECK(status IN ('open','lost','converted','merged')), lost_reason TEXT, matter_id TEXT REFERENCES s_matters(id), merged_into TEXT REFERENCES s_leads(id),
 revision TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, last_activity_at TEXT NOT NULL,
 CHECK(status<>'lost' OR lost_reason IS NOT NULL), CHECK(status<>'converted' OR matter_id IS NOT NULL), CHECK(status<>'merged' OR merged_into IS NOT NULL)
);
CREATE UNIQUE INDEX s_leads_converted_matter ON s_leads(matter_id) WHERE status='converted';
CREATE INDEX s_leads_queue ON s_leads(assigned_email,status,next_action_date);
CREATE TRIGGER s_lead_delete BEFORE DELETE ON s_leads BEGIN SELECT RAISE(ABORT,'constraint: leads are history'); END;
CREATE TRIGGER s_lead_final BEFORE UPDATE ON s_leads WHEN OLD.status='merged' OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by OR NEW.referral_source IS NOT OLD.referral_source
 BEGIN SELECT RAISE(ABORT,'constraint: a merged lead and lead provenance are final'); END;
CREATE TABLE s_lead_events (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES s_leads(id), kind TEXT NOT NULL,
 detail TEXT NOT NULL CHECK(json_valid(detail)), actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX s_lead_history ON s_lead_events(lead_id,at,id);
CREATE TRIGGER s_lead_event_update BEFORE UPDATE ON s_lead_events BEGIN SELECT RAISE(ABORT,'constraint: lead history is append-only'); END;
CREATE TRIGGER s_lead_event_delete BEFORE DELETE ON s_lead_events BEGIN SELECT RAISE(ABORT,'constraint: lead history is append-only'); END;
