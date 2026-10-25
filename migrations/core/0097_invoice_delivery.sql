CREATE TABLE s_invoice_templates (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, config TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_invoice_notification_templates (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL,
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE s_invoice_deliveries (
 id TEXT PRIMARY KEY, bill_id TEXT NOT NULL REFERENCES s_bills(id),
 template_id TEXT NOT NULL REFERENCES s_invoice_templates(id), recipient TEXT NOT NULL,
 payer_name TEXT NOT NULL, due_date TEXT NOT NULL, snapshot TEXT NOT NULL,
 issue_digest TEXT NOT NULL, pdf_base64 TEXT NOT NULL, pdf_digest TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX s_invoice_deliveries_bill ON s_invoice_deliveries(bill_id,created_at);
CREATE TABLE s_invoice_delivery_attempts (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES s_invoice_deliveries(id),
 notification_template_id TEXT NOT NULL REFERENCES s_invoice_notification_templates(id),
 authorized_by TEXT NOT NULL, authorized_at TEXT NOT NULL, reason TEXT NOT NULL,
 contact_revision INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN('ready','sending','accepted','uncertain','failed','development','sandbox_validated','withdrawn')),
 provider TEXT, provider_id TEXT, attempted_at TEXT, detail TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX s_invoice_delivery_ready ON s_invoice_delivery_attempts(delivery_id) WHERE status='ready';
CREATE TABLE s_invoice_delivery_events (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES s_invoice_delivery_attempts(id),
 status TEXT NOT NULL CHECK(status IN('processed','delivered','bounced','deferred','dropped','complained','unsubscribed')),
 occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, payload_digest TEXT NOT NULL
);
CREATE TABLE s_payer_statements (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), recipient TEXT NOT NULL,
 snapshot TEXT NOT NULL, pdf_base64 TEXT NOT NULL, pdf_digest TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE s_invoice_replacements (
 bill_id TEXT PRIMARY KEY REFERENCES s_bills(id), replacement_bill_id TEXT NOT NULL REFERENCES s_bills(id),
 reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(bill_id<>replacement_bill_id)
);
CREATE TRIGGER s_invoice_templates_immutable BEFORE UPDATE ON s_invoice_templates BEGIN SELECT RAISE(ABORT,'Invoice template versions are immutable'); END;
CREATE TRIGGER s_invoice_templates_retained BEFORE DELETE ON s_invoice_templates BEGIN SELECT RAISE(ABORT,'Invoice templates are retained'); END;
CREATE TRIGGER s_invoice_notification_templates_immutable BEFORE UPDATE ON s_invoice_notification_templates BEGIN SELECT RAISE(ABORT,'Counsel notification approval is immutable'); END;
CREATE TRIGGER s_invoice_notification_templates_retained BEFORE DELETE ON s_invoice_notification_templates BEGIN SELECT RAISE(ABORT,'Counsel notification approval is retained'); END;
CREATE TRIGGER s_invoice_deliveries_immutable BEFORE UPDATE ON s_invoice_deliveries BEGIN SELECT RAISE(ABORT,'Delivered invoice artifacts are immutable'); END;
CREATE TRIGGER s_invoice_deliveries_retained BEFORE DELETE ON s_invoice_deliveries BEGIN SELECT RAISE(ABORT,'Delivered invoice artifacts are retained'); END;
CREATE TRIGGER s_invoice_delivery_events_immutable BEFORE UPDATE ON s_invoice_delivery_events BEGIN SELECT RAISE(ABORT,'Provider events are immutable'); END;
CREATE TRIGGER s_invoice_delivery_events_retained BEFORE DELETE ON s_invoice_delivery_events BEGIN SELECT RAISE(ABORT,'Provider events are retained'); END;
CREATE TRIGGER s_invoice_delivery_decision_immutable BEFORE UPDATE OF id,delivery_id,notification_template_id,authorized_by,authorized_at,reason,contact_revision ON s_invoice_delivery_attempts BEGIN SELECT RAISE(ABORT,'Send authorization is immutable'); END;
CREATE TRIGGER s_invoice_delivery_attempts_retained BEFORE DELETE ON s_invoice_delivery_attempts BEGIN SELECT RAISE(ABORT,'Send attempts are retained'); END;
CREATE TRIGGER s_payer_statements_immutable BEFORE UPDATE ON s_payer_statements BEGIN SELECT RAISE(ABORT,'Payer statements are immutable'); END;
CREATE TRIGGER s_payer_statements_retained BEFORE DELETE ON s_payer_statements BEGIN SELECT RAISE(ABORT,'Payer statements are retained'); END;
CREATE TRIGGER s_invoice_replacements_immutable BEFORE UPDATE ON s_invoice_replacements BEGIN SELECT RAISE(ABORT,'Replacement decisions are immutable'); END;
CREATE TRIGGER s_invoice_replacements_retained BEFORE DELETE ON s_invoice_replacements BEGIN SELECT RAISE(ABORT,'Replacement decisions are retained'); END;
