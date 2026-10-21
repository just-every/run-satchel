import {createPortability} from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {firmToday} from './retention';
import {matterGuard} from './documents';
import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
// Conflict originals inherit the existing whole-matter schedule and legal hold.
// Attribution, digest, scope and enforced restrictions remain history, as do the
// name/hash and sign-off metadata of disposed document originals.
export async function disposeConflictWaiver(db:D1Database,actor:Actor,waiverId:string,b:Data,originals:R2Bucket){
 human(actor);need(actor,'owner');const f=await stmt(db,'SELECT * FROM s_conflict_waivers WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_conflict_disposals d WHERE d.waiver_id=s_conflict_waivers.id)',waiverId).first<Data>();insist(f,'Conflict original not found',404);
 insist(b.confirm===f.name,'Type the waiver filename to confirm disposal');const reason=text(b.reason,'Disposal reason',2000),at=now(),today=await firmToday(db),scopes=await rows(db,'SELECT matter_id FROM s_conflict_waiver_matters WHERE waiver_id=?',f.id),guards:D1PreparedStatement[]=[];
 insist(scopes.length,'The original has no classified matter custody',409);
 for(const s of scopes){await matter(db,actor,s.matter_id);guards.push(...matterGuard(db,actor,s.matter_id));const hold=await stmt(db,'SELECT reason FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL',s.matter_id).first<Data>();insist(!hold,'Legal hold: '+hold?.reason,409);
  const r=await stmt(db,'SELECT * FROM s_retention WHERE matter_id=? AND document_id IS NULL AND superseded_at IS NULL',s.matter_id).first<Data>();insist(r&&r.dispose_after<=today,'The affected matter needs an expired retention schedule',409);
  const fence=id();guards.push(stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_retention WHERE id=? AND superseded_at IS NULL AND dispose_after<=?) AND NOT EXISTS(SELECT 1 FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL) THEN 1 ELSE 0 END)',fence,r.id,today,s.matter_id),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 }
 const service=await createPortability({db,buckets:{originals},policy}),journal={originals:[{id:f.id,size:f.size,sha256:f.sha256}],conflictOriginals:1,writtenConfirmations:1,scopes:scopes.map(s=>s.matter_id)};
 await atomic(db,actor,[...guards,stmt(db,'INSERT INTO s_conflict_disposals VALUES(?,?,?,?,?,?)',id(),f.id,reason,JSON.stringify(journal),actor.email,at),stmt(db,"UPDATE s_conflict_waiver_chunks SET content_base64='' WHERE waiver_id=?",f.id),stmt(db,"UPDATE s_conflict_waiver_details SET confirmation='' WHERE waiver_id=?",f.id),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'conflict.original_disposed',f.id,JSON.stringify({reason,journal}),{matterId:scopes[0].matter_id})]);return {id:f.id,erasedAt:at,journal};
}

const disposedPayload='Disposed conflict payload; consult counsel';
function redactedPolicy(value:unknown):unknown{
 if(Array.isArray(value))return value.map(redactedPolicy);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['note','reason','release_reason','restriction'].includes(key)?disposedPayload:key==='restrictions'?(typeof v==='string'?JSON.stringify([disposedPayload]):[disposedPayload]):redactedPolicy(v)]));
 return value;
}

export async function disposeConflictPayload(db:D1Database,actor:Actor,searchId:string,b:Data,originals:R2Bucket){
 human(actor);need(actor,'owner');
 const search=await stmt(db,'SELECT * FROM s_conflicts WHERE id=?',searchId).first<Data>();insist(search,'Conflict search not found',404);
 insist(!await stmt(db,'SELECT 1 FROM s_conflict_policy_disposals WHERE search_id=?',searchId).first(),'This conflict payload was already disposed',409);
 insist(b.confirm===searchId,'Type the search reference to confirm disposal');const reason=text(b.reason,'Disposal reason',2000),at=now(),today=await firmToday(db);
 const reviews=await rows(db,'SELECT id FROM s_conflict_reviews WHERE search_id=?',searchId),decisions=await rows(db,'SELECT d.id FROM s_conflict_route_decisions d JOIN s_conflict_routes r ON r.id=d.referral_id WHERE r.search_id=?',searchId),legacy=await rows(db,'SELECT d.id FROM s_conflict_referral_decisions d JOIN s_conflict_referrals r ON r.id=d.referral_id WHERE r.search_id=?',searchId);
 const scopes=new Set<string>((await rows(db,`SELECT id matter_id FROM s_matters WHERE conflict_id=? UNION SELECT wm.matter_id FROM s_conflict_waiver_matters wm JOIN s_conflict_waivers f ON f.id=wm.waiver_id WHERE f.search_id=? UNION SELECT matter_id FROM s_conflict_retention_scopes WHERE search_id=? UNION SELECT w.matter_id FROM s_conflict_route_sources rs JOIN s_ethical_walls w ON w.id=rs.wall_id WHERE rs.search_id=?`,searchId,searchId,searchId,searchId)).map(r=>r.matter_id));
 // A restriction can concern an affected source without an attached waiver.
 for(const match of JSON.parse(search.matches))for(const r of match.matterRoles??[])scopes.add(r.matter_id);
 insist(scopes.size,'This conflict payload has no classified matter custody',409);
 const guards:D1PreparedStatement[]=[];
 for(const matterId of scopes){
  await matter(db,actor,matterId);guards.push(...matterGuard(db,actor,matterId));
  const r=await stmt(db,'SELECT * FROM s_retention WHERE matter_id=? AND document_id IS NULL AND superseded_at IS NULL',matterId).first<Data>();
  insist(r&&r.dispose_after<=today,'Every affected matter needs an expired retention schedule',409);
  insist(!await stmt(db,'SELECT 1 FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL',matterId).first(),'An affected matter has a legal hold',409);
  const fence=id();guards.push(stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_retention WHERE id=? AND superseded_at IS NULL AND dispose_after<=?) AND NOT EXISTS(SELECT 1 FROM s_holds WHERE matter_id=? AND document_id IS NULL AND released_at IS NULL) THEN 1 ELSE 0 END)',fence,r.id,today,matterId),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 }
 const screenWalls=await rows(db,'SELECT id FROM s_ethical_walls WHERE matter_id IN (SELECT id FROM s_matters WHERE conflict_id=?)',searchId);
 const objectIds=[...reviews,...decisions,...legacy,...screenWalls].map(r=>r.id);
 const auditRows=await rows(db,`SELECT * FROM s_audit WHERE object_id IN (SELECT value FROM json_each(?)) OR (action='conflict.restriction_removed' AND object_id IN (SELECT id FROM s_matters WHERE conflict_id=?))`,JSON.stringify(objectIds),searchId);
 const journal={restrictionRecords:reviews.length+decisions.length+legacy.length,matterAcknowledgments:(await rows(db,'SELECT id FROM s_matters WHERE conflict_id=?',searchId)).length,auditPayloads:auditRows.length,scopes:[...scopes],retained:'ids, decisions, attribution and times; original audit payload digests; staff exclusions and walls remain enforced'};
 const service=await createPortability({db,buckets:{originals},policy});
 const writes:D1PreparedStatement[]=[...guards,stmt(db,'INSERT INTO s_conflict_policy_disposals VALUES(?,?,?,?,?)',searchId,reason,JSON.stringify(journal),actor.email,at)];
 for(const a of auditRows){
  const sha256=await digest(JSON.stringify({detail:a.detail,evidence:a.evidence}));
  let detail=disposedPayload;try{const original=JSON.parse(a.detail);if(original&&typeof original==='object')detail=JSON.stringify(redactedPolicy(original));}catch{}
  const evidence=JSON.stringify({...redactedPolicy(a.evidence?JSON.parse(a.evidence):{}) as Data,disposedConflictPayload:1,sha256});
  writes.push(stmt(db,'INSERT INTO s_conflict_policy_audit_redactions VALUES(?,?,?,?,?)',a.id,searchId,sha256,detail,evidence),stmt(db,'UPDATE s_audit SET detail=?,evidence=? WHERE id=?',detail,evidence,a.id));
 }
 for(const table of ['s_conflict_reviews','s_conflict_route_decisions','s_conflict_referral_decisions']){
  const ids=table==='s_conflict_reviews'?reviews:table==='s_conflict_route_decisions'?decisions:legacy;
  for(const r of ids)writes.push(stmt(db,`UPDATE ${table} SET note=?,restrictions=? WHERE id=?`,disposedPayload,JSON.stringify([disposedPayload]),r.id));
 }
 for(const w of screenWalls)writes.push(stmt(db,'UPDATE s_ethical_walls SET reason=? WHERE id=?',disposedPayload,w.id));
 writes.push(stmt(db,'UPDATE s_matter_conflict_terms SET restrictions=? WHERE matter_id IN (SELECT id FROM s_matters WHERE conflict_id=?)',JSON.stringify([disposedPayload]),searchId),stmt(db,'UPDATE s_matter_exclusions SET restriction=?,release_reason=CASE WHEN released_at IS NULL THEN NULL ELSE ? END WHERE matter_id IN (SELECT id FROM s_matters WHERE conflict_id=?)',disposedPayload,disposedPayload,searchId),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'conflict.payload_disposed',searchId,JSON.stringify({reason,journal}),{matterId:[...scopes][0]}));
 await atomic(db,actor,writes);return {id:searchId,erasedAt:at,journal};
}
