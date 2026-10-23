CREATE TABLE s_invoice_templates(id TEXT PRIMARY KEY,template_key TEXT NOT NULL,version INTEGER NOT NULL,name TEXT NOT NULL,settings TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,UNIQUE(template_key,version));
CREATE TABLE s_invoice_template_retirements(template_key TEXT PRIMARY KEY,reason TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE s_invoice_template_assignments(sequence INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL CHECK(scope IN('firm','client','matter')),client TEXT,matter_id TEXT REFERENCES s_matters(id),template_key TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_invoice_templates_no_update BEFORE UPDATE ON s_invoice_templates BEGIN SELECT RAISE(ABORT,'invoice template versions are immutable'); END;
CREATE TRIGGER s_invoice_templates_no_delete BEFORE DELETE ON s_invoice_templates BEGIN SELECT RAISE(ABORT,'invoice template versions are immutable'); END;
CREATE TRIGGER s_invoice_template_assignments_no_update BEFORE UPDATE ON s_invoice_template_assignments BEGIN SELECT RAISE(ABORT,'invoice template assignments are append-only'); END;
CREATE TRIGGER s_invoice_template_assignments_no_delete BEFORE DELETE ON s_invoice_template_assignments BEGIN SELECT RAISE(ABORT,'invoice template assignments are append-only'); END;
CREATE TRIGGER s_invoice_template_retirements_no_update BEFORE UPDATE ON s_invoice_template_retirements BEGIN SELECT RAISE(ABORT,'template retirement is permanent'); END;
CREATE TRIGGER s_invoice_template_retirements_no_delete BEFORE DELETE ON s_invoice_template_retirements BEGIN SELECT RAISE(ABORT,'template retirement is permanent'); END;
