ALTER TABLE s_matters ADD COLUMN matter_number TEXT;
ALTER TABLE s_matters ADD COLUMN client_number TEXT NOT NULL DEFAULT '';
ALTER TABLE s_matters ADD COLUMN practice_code TEXT NOT NULL DEFAULT '';
ALTER TABLE s_matters ADD COLUMN number_sequence INTEGER;
UPDATE s_matters SET matter_number='LEGACY-' || id;
CREATE UNIQUE INDEX s_matter_number_unique ON s_matters(matter_number);
CREATE TABLE s_number_settings(id INTEGER PRIMARY KEY CHECK(id=1), pattern TEXT NOT NULL, start INTEGER NOT NULL, padding INTEGER NOT NULL, per_client INTEGER NOT NULL, revision TEXT NOT NULL);
INSERT INTO s_number_settings VALUES(1,'{year}-{sequence}',1,4,0,'initial');
CREATE TABLE s_number_clients(id INTEGER PRIMARY KEY AUTOINCREMENT, client_key TEXT NOT NULL UNIQUE, number TEXT UNIQUE);
CREATE TABLE s_number_sequences(scope TEXT PRIMARY KEY, next INTEGER NOT NULL);
-- Party record changes invalidate searches. A new link to an unchanged party does not.
DROP TRIGGER s_party_link_insert;
DROP TRIGGER s_party_link_delete;
CREATE TRIGGER s_matter_number AFTER INSERT ON s_matters WHEN NEW.matter_number IS NULL BEGIN
 INSERT OR IGNORE INTO s_number_sequences(scope,next) SELECT CASE WHEN per_client=1 THEN NEW.client_number ELSE '' END,start FROM s_number_settings WHERE id=1;
 UPDATE s_matters SET number_sequence=(
  WITH RECURSIVE candidates(n) AS (
   SELECT next FROM s_number_sequences WHERE scope=(SELECT CASE WHEN per_client=1 THEN NEW.client_number ELSE '' END FROM s_number_settings WHERE id=1)
   UNION ALL SELECT n+1 FROM candidates WHERE n<(SELECT next+(SELECT COUNT(*) FROM s_matters) FROM s_number_sequences WHERE scope=(SELECT CASE WHEN per_client=1 THEN NEW.client_number ELSE '' END FROM s_number_settings WHERE id=1))
  )
  SELECT MIN(n) FROM candidates,s_number_settings s WHERE s.id=1 AND NOT EXISTS(SELECT 1 FROM s_matters m WHERE m.matter_number=replace(replace(replace(replace(s.pattern,'{sequence}',printf('%0*d',s.padding,n)),'{year}',strftime('%Y',NEW.opened_at)),'{client}',NEW.client_number),'{practice}',NEW.practice_code))
 ) WHERE id=NEW.id;
 UPDATE s_matters SET matter_number=(SELECT replace(replace(replace(replace(s.pattern,'{sequence}',printf('%0*d',s.padding,number_sequence)),'{year}',strftime('%Y',NEW.opened_at)),'{client}',NEW.client_number),'{practice}',NEW.practice_code) FROM s_number_settings s WHERE s.id=1) WHERE id=NEW.id;
 UPDATE s_number_sequences SET next=(SELECT number_sequence+1 FROM s_matters WHERE id=NEW.id) WHERE scope=(SELECT CASE WHEN per_client=1 THEN NEW.client_number ELSE '' END FROM s_number_settings WHERE id=1);
END;
CREATE TRIGGER s_matter_number_immutable BEFORE UPDATE OF matter_number,client_number,practice_code ON s_matters WHEN OLD.matter_number IS NOT NULL AND (NEW.matter_number IS NOT OLD.matter_number OR NEW.client_number IS NOT OLD.client_number OR NEW.practice_code IS NOT OLD.practice_code) BEGIN SELECT RAISE(ABORT,'Matter identity is immutable'); END;
