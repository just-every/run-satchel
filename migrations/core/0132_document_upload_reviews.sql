-- Preserve the manifest's original base. Explicit current-revision reviews are
-- attributed in the append-only audit; this pointer grants no scan clearance.
ALTER TABLE s_document_uploads ADD COLUMN reviewed_revision TEXT;
