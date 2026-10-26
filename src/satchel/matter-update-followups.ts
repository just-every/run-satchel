import {atomic,audit,human,insist,integer,need,now,stmt,text,type Actor,type Data} from './model';
import {visibleDocument,documentGuard} from './documents';
import {accessGuard,guard} from './trust-guards';
import {visibleMatterUpdate} from './matter-update-authority';

export async function fulfilMatterUpdatePromise(db:D1Database,actor:Actor,promiseId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');const p=await stmt(db,'SELECT * FROM s_matter_update_promises WHERE id=?',promiseId).first<Data>();insist(p,'Promise not found',404);
 const u=await visibleMatterUpdate(db,actor,p.update_id);insist(u.status==='approved'&&p.status==='open','Only an open reviewed promise can be fulfilled',409);
 const doc=await visibleDocument(db,actor,text(b.documentId,'Fulfillment source document',100)),version=integer(b.version,'Fulfillment source version',1),sha=text(b.digest,'Fulfillment source digest',64),evidence=text(b.evidence,'How this source fulfills the promise',4000);
 insist(doc.matter_id===u.matter_id&&!doc.erased_at,'Use retained fulfillment evidence on this matter',409);
 const v=await stmt(db,'SELECT sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',doc.id,version).first<Data>();insist(v?.sha256===sha,'The exact fulfillment source is unavailable or changed',409);
 await atomic(db,actor,[accessGuard(db,actor,u.matter_id),...documentGuard(db,actor,doc),guard(db,"EXISTS(SELECT 1 FROM s_matter_update_promises WHERE id=? AND status='open')",p.id),guard(db,'EXISTS(SELECT 1 FROM s_document_versions WHERE document_id=? AND version=? AND sha256=? AND content_base64 IS NOT NULL)',doc.id,version,sha),stmt(db,"UPDATE s_matter_update_promises SET status='fulfilled',fulfilled_document_id=?,fulfilled_version=?,fulfilled_digest=?,fulfilled_evidence=?,fulfilled_by=?,fulfilled_at=? WHERE id=?",doc.id,version,sha,evidence,actor.email,now(),p.id),audit(db,actor,'matter_update.promise_fulfilled',p.id,JSON.stringify({documentId:doc.id,version,digest:sha,evidence}),{matterId:u.matter_id})]);
 return {id:p.id};
}
export async function completeMatterUpdateReply(db:D1Database,actor:Actor,replyId:string,b:Data){
 human(actor);need(actor,'owner','lawyer','assistant');const r=await stmt(db,'SELECT * FROM s_matter_update_replies WHERE id=?',replyId).first<Data>();insist(r,'Followup not found',404);
 const u=await visibleMatterUpdate(db,actor,r.update_id);insist(!r.completed_at,'This reply already has completion evidence',409);
 insist(actor.email===r.responsible_email||actor.role==='owner'||actor.role==='lawyer','Only the responsible person or counsel may complete this followup',403);
 const evidence=text(b.evidence,'Followup completion evidence',4000);
 await atomic(db,actor,[accessGuard(db,actor,u.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_matter_update_replies WHERE id=? AND completed_at IS NULL)',r.id),stmt(db,'UPDATE s_matter_update_replies SET completed_by=?,completed_at=?,completion_evidence=? WHERE id=?',actor.email,now(),evidence,r.id),audit(db,actor,'matter_update.reply_completed',r.id,JSON.stringify({evidence}),{matterId:u.matter_id})]);
 return {id:r.id};
}
