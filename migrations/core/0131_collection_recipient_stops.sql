CREATE TABLE s_collection_recipient_stops(collection_id TEXT PRIMARY KEY REFERENCES s_collection_sequences(id),stopped_by TEXT NOT NULL,stopped_at TEXT NOT NULL,reason TEXT NOT NULL);
CREATE TRIGGER s_collection_stop_no_update BEFORE UPDATE ON s_collection_recipient_stops BEGIN SELECT RAISE(ABORT,'Recipient withdrawal history is retained'); END;
