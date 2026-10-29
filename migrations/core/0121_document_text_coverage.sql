-- Preserve page and version identity while reporting incomplete email coverage.
ALTER TABLE s_document_text_indexes ADD COLUMN incomplete INTEGER NOT NULL DEFAULT 0 CHECK(incomplete IN (0,1));
ALTER TABLE s_document_text_indexes ADD COLUMN ocr_pages INTEGER NOT NULL DEFAULT 0 CHECK(ocr_pages>=0);
ALTER TABLE s_document_text_indexes ADD COLUMN extractor TEXT NOT NULL DEFAULT 'embedded-v1';
