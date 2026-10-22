-- FIRM-008: principal-defined custom roles. Each role is a ceiling of per-area permissions
-- applied to a firm member on top of their built-in role; it never confers legal approval or trust authority.
CREATE TABLE s_custom_roles(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,permissions TEXT NOT NULL CHECK(json_valid(permissions)),revision INTEGER NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
ALTER TABLE s_members ADD COLUMN custom_role_id TEXT REFERENCES s_custom_roles(id);
