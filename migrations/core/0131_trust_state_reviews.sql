-- Evidence and firm review retain the exact revision; they grant no delivery authority.
CREATE TABLE s_trust_state_metadata(
 id TEXT PRIMARY KEY,period_id TEXT NOT NULL REFERENCES s_trust_periods(id),
 state TEXT NOT NULL CHECK(state IN('CA','NY')),version INTEGER NOT NULL CHECK(version>0),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),digest TEXT NOT NULL,
 recorded_by TEXT NOT NULL,recorded_name TEXT NOT NULL,recorded_at TEXT NOT NULL,
 UNIQUE(period_id,state,version)
);
CREATE TABLE s_trust_state_evidence(
 id TEXT PRIMARY KEY,metadata_id TEXT NOT NULL REFERENCES s_trust_state_metadata(id),item_key TEXT NOT NULL,
 source_document_id TEXT NOT NULL REFERENCES s_documents(id),source_version INTEGER NOT NULL CHECK(source_version>0),
 source_digest TEXT NOT NULL,citation TEXT NOT NULL,
 UNIQUE(metadata_id,item_key,source_document_id,source_version)
);
CREATE TABLE s_trust_state_reviews(
 id TEXT PRIMARY KEY,packet_id TEXT NOT NULL REFERENCES s_trust_packets(id),state TEXT NOT NULL CHECK(state IN('CA','NY')),
 metadata_id TEXT NOT NULL REFERENCES s_trust_state_metadata(id),packet_digest TEXT NOT NULL,bundle_digest TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),digest TEXT NOT NULL,
 reviewer_id TEXT NOT NULL,reviewer_email TEXT NOT NULL,reviewer_name TEXT NOT NULL,reviewed_at TEXT NOT NULL,note TEXT NOT NULL,
 UNIQUE(packet_id,state,metadata_id,bundle_digest)
);
CREATE INDEX s_trust_state_metadata_period ON s_trust_state_metadata(period_id,state,version);
CREATE TRIGGER s_trust_state_metadata_no_update BEFORE UPDATE ON s_trust_state_metadata BEGIN SELECT RAISE(ABORT,'state metadata is append-only'); END;
CREATE TRIGGER s_trust_state_metadata_no_delete BEFORE DELETE ON s_trust_state_metadata BEGIN SELECT RAISE(ABORT,'state metadata is append-only'); END;
CREATE TRIGGER s_trust_state_evidence_no_update BEFORE UPDATE ON s_trust_state_evidence BEGIN SELECT RAISE(ABORT,'state evidence is append-only'); END;
CREATE TRIGGER s_trust_state_evidence_no_delete BEFORE DELETE ON s_trust_state_evidence BEGIN SELECT RAISE(ABORT,'state evidence is append-only'); END;
CREATE TRIGGER s_trust_state_reviews_no_update BEFORE UPDATE ON s_trust_state_reviews BEGIN SELECT RAISE(ABORT,'state reviews are immutable'); END;
CREATE TRIGGER s_trust_state_reviews_no_delete BEFORE DELETE ON s_trust_state_reviews BEGIN SELECT RAISE(ABORT,'state reviews are immutable'); END;
