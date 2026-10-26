CREATE TABLE s_invoice_template_defaults (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 scope TEXT NOT NULL CHECK(scope IN('firm','client')), target TEXT NOT NULL,
 template_id TEXT NOT NULL REFERENCES s_invoice_templates(id), previous_id TEXT,
 reason TEXT NOT NULL, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL
);
CREATE INDEX s_invoice_template_defaults_current ON s_invoice_template_defaults(scope,target,sequence DESC);
CREATE TABLE s_invoice_template_retirements (
 template_id TEXT PRIMARY KEY REFERENCES s_invoice_templates(id),
 reason TEXT NOT NULL, retired_by TEXT NOT NULL, retired_at TEXT NOT NULL
);
CREATE TRIGGER s_invoice_template_defaults_no_update BEFORE UPDATE ON s_invoice_template_defaults BEGIN SELECT RAISE(ABORT,'Template defaults are append-only'); END;
CREATE TRIGGER s_invoice_template_defaults_no_delete BEFORE DELETE ON s_invoice_template_defaults BEGIN SELECT RAISE(ABORT,'Template defaults are append-only'); END;
CREATE TRIGGER s_invoice_template_retirements_no_update BEFORE UPDATE ON s_invoice_template_retirements BEGIN SELECT RAISE(ABORT,'Template retirement is permanent'); END;
CREATE TRIGGER s_invoice_template_retirements_no_delete BEFORE DELETE ON s_invoice_template_retirements BEGIN SELECT RAISE(ABORT,'Template retirement is permanent'); END;
