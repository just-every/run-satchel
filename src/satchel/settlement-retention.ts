import {createPortability} from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {matterGuard} from './documents';
import {atomic,audit,human,insist,matter,need,now,stmt,text,type Actor,type Data} from './model';
import {firmToday} from './retention';
import {guard} from './trust-guards';
const retainedFeeBill="EXISTS(SELECT 1 FROM s_bills WHERE matter_id=? AND json_extract(snapshot,'$.feePlan.kind')='settlement')";

export async function isSettlementErased(db:D1Database,matterId:string) {
 return Boolean(await stmt(db,'SELECT 1 FROM s_settlement_erasures WHERE matter_id=?',matterId).first());
}

// FIRM-006 supplies the policy: no automatic schedule, counsel's holds, and
// principal approval only after the current matter retention period expires.
export async function disposeSettlement(db:D1Database,actor:Actor,matterId:string,body:Data,originals:R2Bucket) {
 human(actor);need(actor,'owner');
 const m=await matter(db,actor,matterId);
 insist(body.confirm===m.title,'Type the matter name to confirm disposal of its restricted settlement evidence');
 const reason=text(body.reason,'Settlement disposal reason',1000),today=await firmToday(db);
 insist(!(await isSettlementErased(db,matterId)),'Settlement evidence was already erased',409);
 insist(await stmt(db,'SELECT 1 FROM s_contingency_terms WHERE matter_id=?',matterId).first(),'Settlement evidence not found',404);
 // Reviewed bills remain financial originals, including void/correction history.
 insist(!(await stmt(db,`SELECT 1 WHERE ${retainedFeeBill}`,matterId).first()),'A retained settlement fee bill still requires this source evidence. Settlement disposal cannot erase financial bill history.',409);
 // A source-specific hold is conservatively treated as a hold on this file.
 insist(!(await stmt(db,'SELECT 1 FROM s_holds WHERE matter_id=? AND released_at IS NULL',matterId).first()),'Settlement evidence is under a legal hold. Counsel must release it before erasure or disposal.',409);
 const retention=await stmt(db,'SELECT * FROM s_retention WHERE matter_id=? AND document_id IS NULL AND superseded_at IS NULL',matterId).first<Data>();
 insist(retention,'Settlement evidence needs a matter retention schedule',409);
 insist(retention.dispose_after<=today,`Its retention runs until ${retention.dispose_after}`,409);
 const at=now(),service=await createPortability({db,buckets:{originals},policy});
 await atomic(db,actor,[...matterGuard(db,actor,matterId),
  guard(db,`NOT ${retainedFeeBill}`,matterId),
  guard(db,'NOT EXISTS(SELECT 1 FROM s_holds WHERE matter_id=? AND released_at IS NULL)',matterId),
  guard(db,'EXISTS(SELECT 1 FROM s_retention WHERE id=? AND matter_id=? AND document_id IS NULL AND superseded_at IS NULL AND dispose_after<=?)',retention.id,matterId,today),
  stmt(db,'INSERT INTO s_settlement_erasures(matter_id,retention_id,reason,approved_by,approved_at) VALUES(?,?,?,?,?)',matterId,retention.id,reason,actor.email,at),
  stmt(db,"UPDATE s_settlement_approvals SET note='' WHERE note<>'' AND statement_id IN (SELECT id FROM s_settlement_statements WHERE matter_id=?)",matterId),
  stmt(db,"UPDATE s_settlement_statements SET snapshot='{}' WHERE matter_id=? AND snapshot<>'{}'",matterId),
  stmt(db,"UPDATE s_contingency_terms SET terms='{}' WHERE matter_id=? AND terms<>'{}'",matterId),
  ...await service.redactionStatements(),...await service.invalidateTransfersStatements(),
  audit(db,actor,'settlement.disposed',matterId,JSON.stringify({matterId,retentionId:retention.id}),{matterId,retentionId:retention.id})]);
 return {matterId,erased:true,erasedAt:at,retentionId:retention.id};
}
