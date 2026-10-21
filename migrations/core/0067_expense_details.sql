CREATE TABLE s_expense_details (
 entry_id TEXT PRIMARY KEY REFERENCES s_entries(id),
 category TEXT NOT NULL CHECK(category IN('overhead','client_disbursement','advanced_cost')),
 vendor TEXT NOT NULL,
 vendor_reference TEXT NOT NULL,
 accounting_code TEXT NOT NULL,
 source_system TEXT,
 source_id TEXT,
 request_digest TEXT NOT NULL,
 receipt_document_id TEXT,
 receipt_version INTEGER,
 receipt_digest TEXT,
 UNIQUE(source_system,source_id),
 FOREIGN KEY(receipt_document_id,receipt_version) REFERENCES s_document_versions(document_id,version),
 CHECK((source_system IS NULL)=(source_id IS NULL)),
 CHECK((receipt_document_id IS NULL AND receipt_version IS NULL AND receipt_digest IS NULL) OR
       (receipt_document_id IS NOT NULL AND receipt_version>0 AND receipt_digest IS NOT NULL))
);
