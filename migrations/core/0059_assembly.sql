-- DOC-006: immutable document templates, questionnaires and exact approvals.
CREATE TABLE s_assembly_templates(id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),name TEXT NOT NULL,definition TEXT NOT NULL CHECK(json_valid(definition)),created_by TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,version));
CREATE TABLE s_assemblies(id TEXT PRIMARY KEY,matter_id TEXT NOT NULL REFERENCES s_matters(id),title TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE s_assembly_revisions(id TEXT PRIMARY KEY,assembly_id TEXT NOT NULL REFERENCES s_assemblies(id),number INTEGER NOT NULL CHECK(number>0),template_id TEXT NOT NULL,template_version INTEGER NOT NULL,answers TEXT NOT NULL CHECK(json_valid(answers)),snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),sha256 TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(assembly_id,number),FOREIGN KEY(template_id,template_version) REFERENCES s_assembly_templates(id,version));
CREATE TABLE s_assembly_approvals(revision_id TEXT PRIMARY KEY REFERENCES s_assembly_revisions(id),docx_id TEXT NOT NULL REFERENCES s_documents(id),pdf_id TEXT NOT NULL REFERENCES s_documents(id),approved_by TEXT NOT NULL,approved_at TEXT NOT NULL);
CREATE TRIGGER s_assembly_templates_update BEFORE UPDATE ON s_assembly_templates BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assembly_templates_delete BEFORE DELETE ON s_assembly_templates BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assemblies_update BEFORE UPDATE ON s_assemblies BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assemblies_delete BEFORE DELETE ON s_assemblies BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assembly_revisions_update BEFORE UPDATE ON s_assembly_revisions BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assembly_revisions_delete BEFORE DELETE ON s_assembly_revisions BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assembly_approvals_update BEFORE UPDATE ON s_assembly_approvals BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
CREATE TRIGGER s_assembly_approvals_delete BEFORE DELETE ON s_assembly_approvals BEGIN SELECT RAISE(ABORT,'constraint: document assembly history is immutable'); END;
