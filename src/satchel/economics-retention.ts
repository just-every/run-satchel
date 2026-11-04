import {createPortability} from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {matterScope} from './matter-scope';
import {allWallsAllow,requireWholeFirmWallAccess} from './wall-doors';
import {firmToday} from './retention';
import {atomic,audit,date,digest,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {economicsPrincipal} from './staff-costs';
import {economicsCustody,economicsSourceGuard} from './economics-exports';
import {accessGuard,guard} from './trust-guards';

const retentionHead='FROM s_economics_retention current_policy WHERE NOT EXISTS(SELECT 1 FROM s_economics_retention successor WHERE successor.previous_id=current_policy.id)';

// Reuse FIRM-006's whole-matter retention decisions. A cost also affects every
// retained report that cites it, so all those matters must permit disposal.
async function custodyGuards(db:D1Database,actor:Actor,matterIds:string[]){
 const today=await firmToday(db),guards:D1PreparedStatement[]=[];
 if(!matterIds.length){
  await requireWholeFirmWallAccess(db,actor);
  const wholeFirm=`NOT EXISTS(SELECT 1 FROM s_matters current_matter WHERE NOT ${matterScope('current_matter.id')})`;
  insist(await stmt(db,`SELECT 1 WHERE ${wholeFirm}`,actor.role,actor.email).first(),'This firm-wide operation requires current access to every matter',403);
  const retention=await stmt(db,`SELECT current_policy.* ${retentionHead}`).first<Data>();
  insist(retention&&retention.dispose_after<=today,'An expired firm economics retention decision is required for unassigned custody',409);
  insist(!await stmt(db,'SELECT 1 FROM s_holds WHERE released_at IS NULL').first(),'An affected matter has a legal hold',409);
  guards.push(guard(db,wholeFirm,actor.role,actor.email),guard(db,`EXISTS(SELECT 1 FROM (SELECT ? email) viewer WHERE ${allWallsAllow('viewer.email')})`,actor.email),guard(db,`(SELECT current_policy.id ${retentionHead})=? AND NOT EXISTS(SELECT 1 FROM s_holds WHERE released_at IS NULL)`,retention.id));
  return guards;
 }
 for(const matterId of matterIds)await matter(db,actor,matterId);
 for(const matterId of matterIds){
  const retention=await stmt(db,'SELECT id FROM s_retention WHERE matter_id=? AND document_id IS NULL AND superseded_at IS NULL AND dispose_after<=?',matterId,today).first<Data>();
  insist(retention,'Every affected matter needs an expired retention schedule',409);
  insist(!await stmt(db,'SELECT 1 FROM s_holds WHERE matter_id=? AND released_at IS NULL',matterId).first(),'An affected matter has a legal hold',409);
  guards.push(accessGuard(db,actor,matterId),guard(db,'EXISTS(SELECT 1 FROM s_retention WHERE id=? AND superseded_at IS NULL AND dispose_after<=?) AND NOT EXISTS(SELECT 1 FROM s_holds WHERE matter_id=? AND released_at IS NULL)',retention.id,today,matterId));
 }
 return guards;
}
function artifactWrites(db:D1Database,actor:Actor,exports:Data[],reason:string,at:string){
 const writes:D1PreparedStatement[]=[];
 for(const item of exports){writes.push(stmt(db,'INSERT INTO s_economics_export_disposals VALUES(?,?,?,?,?)',item.id,reason,JSON.stringify({reportArtifacts:1,bytes:new TextEncoder().encode(item.artifact).byteLength,sha256:item.artifact_sha256}),actor.email,at),stmt(db,'UPDATE s_economics_exports SET artifact=NULL WHERE id=?',item.id));}
 return writes;
}
export async function disposeEconomicsExport(db:D1Database,actor:Actor,exportId:string,b:Data,originals:R2Bucket){
 economicsPrincipal(actor);const item=await stmt(db,'SELECT * FROM s_economics_exports WHERE id=? AND artifact IS NOT NULL',exportId).first<Data>();insist(item,'Retained report not found',404);
 insist(b.confirm===exportId,'Type the retained report reference to confirm disposal');const reason=text(b.reason,'Disposal reason',2000),at=now(),{matterIds,sourceIds}=await economicsCustody(db,item),guards=await custodyGuards(db,actor,matterIds),service=await createPortability({db,buckets:{originals,matterOriginals:originals},policy}),journal={reportArtifacts:1,bytes:new TextEncoder().encode(item.artifact).byteLength,sha256:item.artifact_sha256,matterIds};
 await atomic(db,actor,[...guards,economicsSourceGuard(db,actor,sourceIds),guard(db,'EXISTS(SELECT 1 FROM s_economics_exports WHERE id=? AND artifact IS NOT NULL)',exportId),...artifactWrites(db,actor,[item],reason,at),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'report.economics_disposed',exportId,JSON.stringify({reason,journal}))]);
 return {id:exportId,erasedAt:at,journal};
}
export async function disposeStaffCost(db:D1Database,actor:Actor,costId:string,b:Data,originals:R2Bucket){
 economicsPrincipal(actor);
 const revision=await stmt(db,'SELECT r.*,a.approved_at,0 legacy FROM s_staff_cost_revisions r LEFT JOIN s_staff_cost_approvals a ON a.revision_id=r.id WHERE r.id=? UNION ALL SELECT c.id,c.email,c.effective_from,c.hourly_cents,c.reason,NULL supersedes_id,c.approved_by created_by,c.approved_at created_at,c.approved_at,1 legacy FROM s_staff_cost_rates c WHERE c.id=?',costId,costId).first<Data>();
 insist(revision&&!await stmt(db,'SELECT 1 FROM s_staff_cost_disposals WHERE revision_id=?',costId).first(),'Staff cost payload not found',404);
 insist(b.confirm===costId,'Type the exact cost revision reference to confirm disposal');const reason=text(b.reason,'Disposal reason',2000),at=now();
 const exports=await rows(db,'SELECT * FROM s_economics_exports WHERE artifact IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(cost_revision_ids) WHERE value=?)',costId);
 const bulkReviews=await rows(db,"SELECT * FROM s_bulk_work_rows WHERE json_extract(review_json,'$.value.costBasis.approvalId')=?",costId);
 const affected=await rows(db,"SELECT DISTINCT matter_id FROM s_entries WHERE kind='time' AND COALESCE(timekeeper_email,created_by)=? AND date>=?",revision.email,revision.effective_from);
 const custody=await Promise.all(exports.map(e=>economicsCustody(db,e))),matterIds=[...new Set([...affected.map(m=>m.matter_id),...bulkReviews.map(r=>r.matter_id),...custody.flatMap(c=>c.matterIds)])] as string[],guards=await custodyGuards(db,actor,matterIds);
 const auditRows=await rows(db,"SELECT id,detail,evidence FROM s_audit WHERE object_id=? AND action LIKE 'report.staff_cost_%'",costId),journal={costVersions:1,approvedCostVersions:revision.approved_at?1:0,auditPayloads:auditRows.length,reportArtifacts:exports.length,bulkWorkReviews:bulkReviews.length,reportBytes:exports.reduce((n,e)=>n+new TextEncoder().encode(e.artifact).byteLength,0),matterIds};
 const service=await createPortability({db,buckets:{originals,matterOriginals:originals},policy}),writes:D1PreparedStatement[]=[...guards,...custody.map(c=>economicsSourceGuard(db,actor,c.sourceIds)),
  guard(db,"NOT EXISTS(SELECT 1 FROM s_entries WHERE kind='time' AND COALESCE(timekeeper_email,created_by)=? AND date>=? AND matter_id NOT IN(SELECT value FROM json_each(?)))",revision.email,revision.effective_from,JSON.stringify(matterIds)),
  guard(db,'NOT EXISTS(SELECT 1 FROM s_economics_exports WHERE artifact IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(cost_revision_ids) WHERE value=?) AND id NOT IN(SELECT value FROM json_each(?)))',costId,JSON.stringify(exports.map(e=>e.id))),
  guard(db,"NOT EXISTS(SELECT 1 FROM s_bulk_work_rows WHERE json_extract(review_json,'$.value.costBasis.approvalId')=? AND id NOT IN(SELECT value FROM json_each(?)))",costId,JSON.stringify(bulkReviews.map(r=>r.id))),
  guard(db,'(SELECT COUNT(*) FROM s_staff_cost_approvals WHERE revision_id=?)=?',costId,!revision.legacy&&revision.approved_at?1:0),
  stmt(db,'INSERT INTO s_staff_cost_disposals VALUES(?,?,?,?,?,?,?,?)',costId,await digest(revision.email),revision.effective_from,revision.approved_at?1:0,reason,JSON.stringify(journal),actor.email,at),
  stmt(db,"UPDATE s_staff_cost_revisions SET email='',effective_from='',hourly_cents=0,reason='' WHERE id=?",costId),stmt(db,"UPDATE s_staff_cost_rates SET email='',effective_from='',hourly_cents=0,reason='' WHERE id=?",costId),...artifactWrites(db,actor,exports,reason,at)];
 for(const row of bulkReviews){writes.push(guard(db,'EXISTS(SELECT 1 FROM s_bulk_work_rows WHERE id=? AND review_json=?)',row.id,row.review_json),stmt(db,'INSERT INTO s_economics_bulk_redactions VALUES(?,?,?)',row.id,costId,await digest(row.review_json)),stmt(db,"UPDATE s_bulk_work_rows SET review_json=json_set(review_json,'$.value.costBasis',NULL) WHERE id=?",row.id));}
 for(const row of auditRows){const sha256=await digest(JSON.stringify({detail:row.detail,evidence:row.evidence})),detail='Staff cost payload disposed under an approved retention decision',evidence=JSON.stringify({disposedStaffCostPayload:true,sha256,revision:costId});writes.push(stmt(db,'INSERT INTO s_economics_audit_redactions VALUES(?,?,?,?,?)',row.id,costId,sha256,detail,evidence),stmt(db,'UPDATE s_audit SET detail=?,evidence=? WHERE id=?',detail,evidence,row.id));}
 writes.push(...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'report.staff_cost_disposed',costId,JSON.stringify({reason,journal})));
 await atomic(db,actor,writes);return {id:costId,erasedAt:at,journal};
}

export async function economicsRetention(db:D1Database,actor:Actor){
 economicsPrincipal(actor);return {current:await stmt(db,`SELECT current_policy.* ${retentionHead}`).first<Data>()};
}
export async function saveEconomicsRetention(db:D1Database,actor:Actor,b:Data){
 economicsPrincipal(actor);const previous=await stmt(db,`SELECT current_policy.id ${retentionHead}`).first<Data>();
 insist((b.revision??null)===(previous?.id??null),'Review the current firm economics retention decision',409);
 const record={id:id(),disposeAfter:date(b.disposeAfter),basis:text(b.basis,'Firm retention basis',2000),createdBy:actor.email,createdAt:now()};
 await atomic(db,actor,[guard(db,`COALESCE((SELECT current_policy.id ${retentionHead}),'')=?`,previous?.id??''),stmt(db,'INSERT INTO s_economics_retention VALUES(?,?,?,?,?,?)',record.id,record.disposeAfter,record.basis,previous?.id??null,record.createdBy,record.createdAt),audit(db,actor,'report.economics_retention_saved',record.id,JSON.stringify({disposeAfter:record.disposeAfter,basis:record.basis,previousId:previous?.id??null}))]);return record;
}
