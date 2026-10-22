import {matterScope} from './matter-scope';
import {atomic,audit,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {sourceDocument,sourceGuard,trustOfficer,trustReconciler} from './trust';
import {currentDate} from './trust-transactions';
import {activeApprovals,authorizationGuard,contextGuards,liveMatterTransferGuard,matterTransferContext,matterTransferFunds,matterTransferPosting,matterTransferSource,transferContext} from './trust-matter-transfer-context';
export async function matterTransferState(db:D1Database,actor:Actor){
 await trustReconciler(db,actor);
 const transfers=await rows(db,`SELECT t.*,f.matter_id from_matter_id,l.matter_id to_matter_id,m.matter_number from_matter_number,n.matter_number to_matter_number,f.account_id from_account_id,l.account_id to_account_id FROM s_trust_matter_transfers t JOIN s_trust_ledgers f ON f.id=t.from_ledger_id JOIN s_trust_ledgers l ON l.id=t.to_ledger_id JOIN s_matters m ON m.id=f.matter_id JOIN s_matters n ON n.id=l.matter_id WHERE ${matterScope('f.matter_id')} AND ${matterScope('l.matter_id')} ORDER BY t.created_at,t.id`,actor.role,actor.email,actor.role,actor.email);
 for(const t of transfers){t.actions=await rows(db,"SELECT * FROM s_trust_matter_transfer_actions WHERE transfer_id=? ORDER BY at,CASE kind WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,actor,id",t.id);t.approvals=t.actions.filter((a:Data)=>a.kind==='approved').length;t.status=['posted','cleared','not_executed','declined','submitted'].find(k=>t.actions.some((a:Data)=>a.kind===k))??(t.approvals>=t.required_approvals?'authorized':'needs_review');}
 return transfers;
}
export async function requestMatterTransfer(db:D1Database,actor:Actor,b:Data,originalId?:string){
 const original=originalId?(await transferContext(db,actor,originalId)).t:null;
 if(original)insist(await stmt(db,"SELECT 1 FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind IN('posted','cleared')",original.id).first(),'Only a posted transfer can be reversed',409);
 const c=await matterTransferContext(db,actor,original?.to_ledger_id??b.fromLedgerId,original?.from_ledger_id??b.toLedgerId,original?.client_id??text(b.clientId,'Canonical client identity'));
 const source=await matterTransferSource(db,actor,b.documentId,c.from.matter_id),reason=text(b.reason,'Client authorization / transfer reason',1000),day=currentDate(b.effectiveDate,'Transfer date'),cents=original?.cents??integer(b.cents,'USD cents',1,100000000000),key=text(b.requestKey,'Request reference',100);
 if(original){const last=await stmt(db,'SELECT MAX(effective_date) day FROM s_trust_entries WHERE source_id IN (?,?)',original.id+':from',original.id+':to').first<Data>();insist(day>=last!.day,'Reversal cannot precede the original transfer');}
 const prior=await stmt(db,'SELECT * FROM s_trust_matter_transfers WHERE request_key=? OR (? IS NOT NULL AND original_transfer_id=?)',key,originalId??null,originalId??null).first<Data>();
 if(prior){insist(prior.from_ledger_id===c.from.id&&prior.to_ledger_id===c.to.id&&(prior.client_id===c.clientId||prior.client_id===b.clientId)&&prior.cents===cents&&prior.reason===reason&&prior.effective_date===day&&prior.source_document_id===source.id&&prior.source_version===source.version&&prior.original_transfer_id===(originalId??null),'Request reference already names a different transfer',409);return prior;}
 const policy=await stmt(db,'SELECT * FROM s_trust_transfer_policy WHERE id=1').first<Data>(),required=Math.max(original?.required_approvals??1,policy!.dual_authorization?2:1),transferId=id();
 try{await atomic(db,actor,[...contextGuards(db,actor,c),sourceGuard(db,source,actor),guard(db,"EXISTS(SELECT 1 FROM s_documents WHERE id=? AND visibility='matter')",source.id),...matterTransferFunds(db,c.from.id,cents,day),guard(db,'EXISTS(SELECT 1 FROM s_trust_transfer_policy WHERE id=1 AND revision=?)',policy!.revision),stmt(db,'INSERT INTO s_trust_matter_transfers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',transferId,key,originalId??null,c.from.id,c.to.id,c.clientId,cents,id(),required,day,reason,source.id,source.version,source.digest,policy!.revision,actor.email,now()),audit(db,actor,'trust.matter_transfer_requested',transferId,JSON.stringify({fromMatterId:c.from.matter_id,toMatterId:c.to.matter_id,clientId:c.clientId,cents,source,reason,originalTransferId:originalId??null,requiredApprovals:required}))]);}
 catch(e){await atomic(db,actor,[audit(db,actor,'trust.matter_transfer_refused',transferId,JSON.stringify({fromMatterId:c.from.matter_id,toMatterId:c.to.matter_id,cents,reason:'Available cleared funds or historical balance refused transfer'}))]);throw e;}
 return stmt(db,'SELECT * FROM s_trust_matter_transfers WHERE id=?',transferId).first<Data>();
}
export async function decideMatterTransfer(db:D1Database,actor:Actor,transferId:string,b:Data){
 const c=await transferContext(db,actor,transferId),{t}=c;insist(t.revision===b.revision,'Review the exact transfer revision',409);insist(['approved','declined'].includes(b.decision),'Choose approved or declined');const note=text(b.reviewNote,'Officer review note',1000);
 const prior=await stmt(db,'SELECT * FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind=? AND actor=?',t.id,b.decision,actor.email).first<Data>();if(prior)return prior;
 const at=now(),actionId=id(),writes=[...contextGuards(db,actor,c),authorizationGuard(db,t),liveMatterTransferGuard(db,t.id),guard(db,"NOT EXISTS(SELECT 1 FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind='submitted')",t.id),stmt(db,'INSERT INTO s_trust_matter_transfer_actions(id,transfer_id,kind,actor,note,at) VALUES(?,?,?,?,?,?)',actionId,t.id,b.decision,actor.email,note,at)];
 if(b.decision==='approved'&&c.from.account_id===c.to.account_id){
 writes.push(activeApprovals(db,t,c),...matterTransferPosting(db,t,c,t.effective_date,actor,at,true),stmt(db,"INSERT INTO s_trust_matter_transfer_actions(id,transfer_id,kind,actor,note,at) SELECT ?,?,'posted',?,?,? WHERE (SELECT COUNT(*) FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind='approved')>=?",id(),t.id,actor.email,'Paired allocation; no bank movement',at,t.id,t.required_approvals));
 }
 await atomic(db,actor,[...writes,audit(db,actor,'trust.matter_transfer_'+b.decision,t.id,JSON.stringify({fromMatterId:c.from.matter_id,toMatterId:c.to.matter_id,revision:t.revision,cents:t.cents,note,originalTransferId:t.original_transfer_id}))]);
 return stmt(db,'SELECT * FROM s_trust_matter_transfer_actions WHERE id=?',actionId).first<Data>();
}
