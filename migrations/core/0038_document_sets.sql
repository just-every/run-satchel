-- Matter filing never changes the document's identity, original bytes or readers.
CREATE TABLE s_document_folders (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(matter_id,name), UNIQUE(id,matter_id)
);
ALTER TABLE s_documents ADD COLUMN folder_id TEXT REFERENCES s_document_folders(id);
ALTER TABLE s_documents ADD COLUMN document_type TEXT NOT NULL DEFAULT '';
ALTER TABLE s_documents ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) AND json_type(tags)='array');
CREATE INDEX s_documents_folder ON s_documents(matter_id,folder_id);
CREATE INDEX s_document_versions_hash ON s_document_versions(sha256,document_id);
CREATE TRIGGER s_document_folder_matter_insert BEFORE INSERT ON s_documents
 WHEN NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM s_document_folders f WHERE f.id=NEW.folder_id AND f.matter_id=NEW.matter_id)
 BEGIN SELECT RAISE(ABORT,'document folder must belong to its matter'); END;
CREATE TRIGGER s_document_folder_matter_update BEFORE UPDATE OF folder_id,matter_id ON s_documents
 WHEN NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM s_document_folders f WHERE f.id=NEW.folder_id AND f.matter_id=NEW.matter_id)
 BEGIN SELECT RAISE(ABORT,'document folder must belong to its matter'); END;
CREATE TABLE s_document_views (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 for_email TEXT NOT NULL, name TEXT NOT NULL, filters TEXT NOT NULL CHECK(json_valid(filters)),
 created_at TEXT NOT NULL, UNIQUE(matter_id,for_email,name)
);
CREATE TABLE s_document_bulk_previews (
 id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id),
 for_email TEXT NOT NULL, role TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 created_at TEXT NOT NULL, applied_at TEXT
);
