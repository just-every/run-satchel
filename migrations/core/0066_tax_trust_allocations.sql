-- BILL-004: officer-reviewed allocation; never infer which funds pay tax.
CREATE TABLE s_tax_trust_allocations (
 transfer_id TEXT PRIMARY KEY REFERENCES s_trust_transfers(id),
 earned_cents INTEGER NOT NULL CHECK(earned_cents>=0),
 tax_cents INTEGER NOT NULL CHECK(tax_cents>=0),
 reference TEXT NOT NULL,
 CHECK(earned_cents+tax_cents>0)
);
CREATE TRIGGER s_tax_trust_allocations_update BEFORE UPDATE ON s_tax_trust_allocations BEGIN SELECT RAISE(ABORT,'tax trust allocations are immutable'); END;
CREATE TRIGGER s_tax_trust_allocations_delete BEFORE DELETE ON s_tax_trust_allocations BEGIN SELECT RAISE(ABORT,'tax trust allocations are immutable'); END;
