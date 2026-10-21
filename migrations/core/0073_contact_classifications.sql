CREATE TABLE s_contact_classifications(id TEXT PRIMARY KEY,party_id TEXT NOT NULL REFERENCES s_parties(id),classification TEXT NOT NULL CHECK(classification IN('prospective_client','staff_relationship')),note TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_contact_classification_added AFTER INSERT ON s_contact_classifications BEGIN UPDATE s_meta SET party_revision=party_revision+1 WHERE id=1; END;
CREATE TRIGGER s_contact_classification_immutable_update BEFORE UPDATE ON s_contact_classifications BEGIN SELECT RAISE(ABORT,'Contact classifications are append-only'); END;
CREATE TRIGGER s_contact_classification_immutable_delete BEFORE DELETE ON s_contact_classifications BEGIN SELECT RAISE(ABORT,'Contact classifications are append-only'); END;
