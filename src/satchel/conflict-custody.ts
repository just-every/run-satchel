import {createPortability} from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {firmToday} from './retention';
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
// Conflict originals inherit the existing whole-matter schedule and legal hold.
// Attribution, digest, scope and enforced restrictions remain history, as do the
// name/hash and sign-off metadata of disposed document originals.
export async function disposeConflictWaiver(db:D1Database,actor:Actor,waiverId:string,b:Data,originals:R2Bucket){
 human(actor);need(actor,'owner');const f=await stmt(db,'SELECT * FROM s_conflict_waivers WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_conflict_disposals d WHERE d.waiver_id=s_conflict_waivers.id)',waiverId).first<Data>();insist(f,'Conflict original not found',404);
 insist(b.confirm===f.name,'Type the waiver filename to confirm disposal');const reason=text(b.reason,'Disposal reason',2000),at=now(),today=await firmToday(db),scopes=await rows(db,'SELECT matter_id FROM s_conflict_waiver_matters WHERE waiver_id=?',f.id),guards:D1PreparedStatement[]=[];
 insist(scopes.length,'The original has no classified matter custody',409);
 for(const s of scopes){await matter(db,actor,s.matter_id);const hold=await stmt(db,'SELECT reason FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL',s.matter_id).first<Data>();insist(!hold,'Legal hold: '+hold?.reason,409);
  const r=await stmt(db,'SELECT * FROM s_retention WHERE matter_id=? AND document_id IS NULL AND superseded_at IS NULL',s.matter_id).first<Data>();insist(r&&r.dispose_after<=today,'The affected matter needs an expired retention schedule',409);
  const fence=id();guards.push(stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_retention WHERE id=? AND superseded_at IS NULL AND dispose_after<=?) AND NOT EXISTS(SELECT 1 FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL) THEN 1 ELSE 0 END)',fence,r.id,today,s.matter_id),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 }
 const service=await createPortability({db,buckets:{originals},policy}),journal={originals:[{id:f.id,size:f.size,sha256:f.sha256}],conflictOriginals:1,writtenConfirmations:1,scopes:scopes.map(s=>s.matter_id)};
 await atomic(db,actor,[...guards,stmt(db,'INSERT INTO s_conflict_disposals VALUES(?,?,?,?,?,?)',id(),f.id,reason,JSON.stringify(journal),actor.email,at),stmt(db,"UPDATE s_conflict_waiver_chunks SET content_base64='' WHERE waiver_id=?",f.id),stmt(db,"UPDATE s_conflict_waiver_details SET confirmation='' WHERE waiver_id=?",f.id),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'conflict.original_disposed',f.id,JSON.stringify({reason,journal}),{matterId:scopes[0].matter_id})]);return {id:f.id,erasedAt:at,journal};
}
