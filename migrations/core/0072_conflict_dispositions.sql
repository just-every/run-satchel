CREATE TABLE s_conflict_waivers(id TEXT PRIMARY KEY,search_id TEXT NOT NULL REFERENCES s_conflicts(id),wall_id TEXT REFERENCES s_ethical_walls(id),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880),sha256 TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
-- Small immutable chunks keep a 5 MB original below D1's per-row size limit.
CREATE TABLE s_conflict_waiver_chunks(waiver_id TEXT NOT NULL REFERENCES s_conflict_waivers(id),position INTEGER NOT NULL CHECK(position>=0),content_base64 TEXT NOT NULL,PRIMARY KEY(waiver_id,position));
CREATE TABLE s_conflict_reviews(id TEXT PRIMARY KEY,search_id TEXT NOT NULL REFERENCES s_conflicts(id),actor TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN('cleared','declined')),note TEXT NOT NULL,restrictions TEXT NOT NULL CHECK(json_valid(restrictions) AND json_type(restrictions)='array'),waiver_id TEXT REFERENCES s_conflict_waivers(id),created_at TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),UNIQUE(search_id,sequence));
CREATE INDEX s_conflict_review_search ON s_conflict_reviews(search_id);
CREATE TABLE s_conflict_referrals(id TEXT PRIMARY KEY,search_id TEXT NOT NULL REFERENCES s_conflicts(id),wall_id TEXT NOT NULL REFERENCES s_ethical_walls(id),requester_email TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(search_id,wall_id));
CREATE TABLE s_conflict_referral_decisions(id TEXT PRIMARY KEY,referral_id TEXT NOT NULL REFERENCES s_conflict_referrals(id),wall_revision TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN('cleared','declined')),note TEXT NOT NULL,restrictions TEXT NOT NULL CHECK(json_valid(restrictions) AND json_type(restrictions)='array'),waiver_id TEXT REFERENCES s_conflict_waivers(id),actor TEXT NOT NULL,created_at TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),UNIQUE(referral_id,sequence));
CREATE INDEX s_conflict_referral_decision ON s_conflict_referral_decisions(referral_id);
CREATE TRIGGER s_conflict_waivers_immutable_update BEFORE UPDATE ON s_conflict_waivers BEGIN SELECT RAISE(ABORT,'Original conflict waivers are immutable'); END;
CREATE TRIGGER s_conflict_waivers_immutable_delete BEFORE DELETE ON s_conflict_waivers BEGIN SELECT RAISE(ABORT,'Original conflict waivers are immutable'); END;
CREATE TRIGGER s_conflict_waiver_chunks_immutable_update BEFORE UPDATE ON s_conflict_waiver_chunks BEGIN SELECT RAISE(ABORT,'Original conflict waivers are immutable'); END;
CREATE TRIGGER s_conflict_waiver_chunks_immutable_delete BEFORE DELETE ON s_conflict_waiver_chunks BEGIN SELECT RAISE(ABORT,'Original conflict waivers are immutable'); END;
CREATE TRIGGER s_conflict_reviews_immutable_update BEFORE UPDATE ON s_conflict_reviews BEGIN SELECT RAISE(ABORT,'Conflict dispositions are immutable'); END;
CREATE TRIGGER s_conflict_reviews_immutable_delete BEFORE DELETE ON s_conflict_reviews BEGIN SELECT RAISE(ABORT,'Conflict dispositions are immutable'); END;
CREATE TRIGGER s_conflict_referrals_immutable_update BEFORE UPDATE ON s_conflict_referrals BEGIN SELECT RAISE(ABORT,'Conflict referrals are immutable'); END;
CREATE TRIGGER s_conflict_referrals_immutable_delete BEFORE DELETE ON s_conflict_referrals BEGIN SELECT RAISE(ABORT,'Conflict referrals are immutable'); END;
CREATE TRIGGER s_conflict_referral_decisions_immutable_update BEFORE UPDATE ON s_conflict_referral_decisions BEGIN SELECT RAISE(ABORT,'Custodian dispositions are immutable'); END;
CREATE TRIGGER s_conflict_referral_decisions_immutable_delete BEFORE DELETE ON s_conflict_referral_decisions BEGIN SELECT RAISE(ABORT,'Custodian dispositions are immutable'); END;
-- Recheck inside matter insertion: a later decline cannot race an HTTP preflight.
CREATE TRIGGER s_matter_conflict_disposition BEFORE INSERT ON s_matters WHEN
 (SELECT decision FROM s_conflict_reviews WHERE search_id=NEW.conflict_id ORDER BY sequence DESC LIMIT 1)='declined'
 OR EXISTS(
  SELECT 1 FROM s_conflicts c,json_each(c.matches) m,json_each(m.value,'$.custodianRoutes') route
  WHERE c.id=NEW.conflict_id AND json_extract(m.value,'$.restricted')=1 AND (
   COALESCE((SELECT decision FROM s_conflict_reviews WHERE search_id=c.id ORDER BY sequence DESC LIMIT 1),'pending')<>'cleared'
   OR NOT EXISTS(
    SELECT 1 FROM s_conflict_referrals r JOIN s_ethical_walls w ON w.id=r.wall_id
    JOIN s_conflict_referral_decisions d ON d.id=(SELECT id FROM s_conflict_referral_decisions WHERE referral_id=r.id ORDER BY sequence DESC LIMIT 1)
    WHERE r.search_id=c.id AND r.wall_id=json_extract(route.value,'$.route') AND d.decision='cleared' AND json_array_length(d.restrictions)=0 AND d.wall_revision=w.revision
   )
  )
 ) BEGIN SELECT RAISE(ABORT,'stale conflict disposition'); END;

CREATE TABLE s_matter_conflict_terms(matter_id TEXT PRIMARY KEY REFERENCES s_matters(id),review_id TEXT REFERENCES s_conflict_reviews(id),restrictions TEXT NOT NULL CHECK(json_valid(restrictions)),acknowledged_by TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER s_matter_conflict_terms_immutable_update BEFORE UPDATE ON s_matter_conflict_terms BEGIN SELECT RAISE(ABORT,'Engagement restriction acknowledgments are immutable'); END;
CREATE TRIGGER s_matter_conflict_terms_immutable_delete BEFORE DELETE ON s_matter_conflict_terms BEGIN SELECT RAISE(ABORT,'Engagement restriction acknowledgments are immutable'); END;
