-- TIME-007: optional client XML profiles and approval-frozen XML 2.1.3 artifacts.
ALTER TABLE s_ledes_guidelines ADD COLUMN xml_profile TEXT CHECK(xml_profile IS NULL OR json_valid(xml_profile));
CREATE TABLE s_bill_ledes_xml (
 bill_id TEXT PRIMARY KEY REFERENCES s_bill_ledes(bill_id), artifact TEXT NOT NULL, artifact_digest TEXT NOT NULL
);
CREATE TRIGGER s_bill_ledes_xml_frozen BEFORE UPDATE ON s_bill_ledes_xml BEGIN SELECT RAISE(ABORT,'reviewed LEDES XML is immutable'); END;
CREATE TRIGGER s_bill_ledes_xml_keep BEFORE DELETE ON s_bill_ledes_xml BEGIN SELECT RAISE(ABORT,'billing history is immutable'); END;
