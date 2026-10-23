-- CLIENT-001: a portal grant names what kind of person holds it. A client and a co-client each read what is shared; a
-- payer reads only issued invoices; a delegate acts for one named client and loses access when that client's grant or
-- their own is withdrawn.
ALTER TABLE s_portal_grants ADD COLUMN kind TEXT NOT NULL DEFAULT 'client' CHECK(kind IN('client','co_client','payer','delegate'));
ALTER TABLE s_portal_grants ADD COLUMN delegate_of TEXT;
DROP TRIGGER s_portal_grants_revoke_only;
CREATE TRIGGER s_portal_grants_revoke_only BEFORE UPDATE ON s_portal_grants WHEN NEW.id IS NOT OLD.id OR NEW.email IS NOT OLD.email OR NEW.matter_id IS NOT OLD.matter_id OR NEW.granted_by IS NOT OLD.granted_by OR NEW.granted_at IS NOT OLD.granted_at OR NEW.reason IS NOT OLD.reason OR NEW.kind IS NOT OLD.kind OR NEW.delegate_of IS NOT OLD.delegate_of OR OLD.revoked_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'portal grants are history'); END;
