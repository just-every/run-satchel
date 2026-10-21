import {atomic,audit,id,insist,integer,now,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {sourceDocument,sourceGuard} from './trust';
import {currentDate} from './trust-transactions';
import {activeApprovals,authorizationGuard,contextGuards,liveMatterTransferGuard,matterTransferFunds,matterTransferPosting,matterTransferSource,transferContext} from './trust-matter-transfer-context';
// A person records actual bank activity. No provider send occurs here. Pending
// or uncertain submission holds the reservation until reviewed reconciliation.
export async function matterTransferBankResult(db:D1Database,actor:Actor,transferId:string,b:Data){
 const c=await transferContext(db,actor,transferId),{t}=c;insist(t.revision===b.revision,'Review the exact transfer revision',409);insist(c.from.account_id!==c.to.account_id,'An allocation within one bank account has no bank movement',409);
 insist(['submitted','cleared','not_executed'].includes(b.outcome),'Choose the actual bank outcome');
 const source=await matterTransferSource(db,actor,b.documentId,c.from.matter_id),destination=await matterTransferSource(db,actor,b.destinationDocumentId,c.to.matter_id),day=currentDate(b.bankDate,'Bank result date');const destinationDay=currentDate(b.destinationBankDate,'Destination bank date'),debit=integer(b.debitCents,'Bank debit USD cents',0,100000000000),credit=integer(b.creditCents,'Bank credit USD cents',0,100000000000);insist(debit===(b.outcome==='not_executed'?0:t.cents)&&credit===(b.outcome==='not_executed'?0:t.cents),'Reconcile both bank amounts to the exact transfer, or zero for confirmed no execution',409);insist(day>=t.effective_date&&destinationDay>=t.effective_date,'Bank activity cannot precede the transfer date');
 const reference=text(b.bankReference,'Source bank reference',200),destinationReference=text(b.destinationBankReference,'Destination bank reference',200),note=text(b.evidence,'Reviewed bank evidence',1000);
 const prior=await stmt(db,'SELECT * FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind=?',t.id,b.outcome).first<Data>();
 if(prior){insist(prior.bank_reference===reference&&prior.destination_bank_reference===destinationReference&&prior.bank_date===day&&prior.destination_bank_date===destinationDay&&prior.debit_cents===debit&&prior.credit_cents===credit&&prior.source_document_id===source.id&&prior.source_version===source.version&&prior.destination_document_id===destination.id&&prior.destination_version===destination.version,'Bank result already recorded with different evidence',409);return prior;}
 const at=now(),actionId=id();
 await atomic(db,actor,[...contextGuards(db,actor,c),authorizationGuard(db,t),sourceGuard(db,source,actor),sourceGuard(db,destination,actor),liveMatterTransferGuard(db,t.id),guard(db,"(SELECT COUNT(*) FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind='approved')>=?",t.id,t.required_approvals),
 ...(b.outcome==='submitted'?[activeApprovals(db,t,c),...matterTransferFunds(db,c.from.id,t.cents,t.effective_date,t.id)]:[guard(db,"EXISTS(SELECT 1 FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind='submitted' AND bank_reference=? AND destination_bank_reference=? AND bank_date<=? AND destination_bank_date<=?)",t.id,reference,destinationReference,day,destinationDay)]),
 ...(b.outcome==='cleared'?matterTransferPosting(db,t,c,day,actor,at,false,destinationDay):[]),
 stmt(db,'INSERT INTO s_trust_matter_transfer_actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',actionId,t.id,b.outcome,actor.email,note,reference,destinationReference,day,destinationDay,debit,credit,source.id,source.version,source.digest,destination.id,destination.version,destination.digest,at),
 audit(db,actor,'trust.matter_transfer_bank_'+b.outcome,t.id,JSON.stringify({fromMatterId:c.from.matter_id,toMatterId:c.to.matter_id,cents:t.cents,source,destination,bankReference:reference,destinationBankReference:destinationReference,day,destinationDay,debitCents:debit,creditCents:credit,note,originalTransferId:t.original_transfer_id}))]);
 return stmt(db,'SELECT * FROM s_trust_matter_transfer_actions WHERE id=?',actionId).first<Data>();
}
