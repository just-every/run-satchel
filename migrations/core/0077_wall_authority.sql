ALTER TABLE s_ethical_walls ADD COLUMN dissolved_at TEXT;
CREATE TABLE s_wall_expiries(request_id TEXT PRIMARY KEY REFERENCES s_wall_requests(id),recorded_at TEXT NOT NULL);
