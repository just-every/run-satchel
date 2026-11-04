-- Keep retired handles as replay evidence without repeatedly deleting storage.
ALTER TABLE s_document_uploads ADD COLUMN cleaned_at TEXT;
