import {atomic,audit,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {invoiceFunds} from './trust-transfers';

const principalSql="EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')";
async function access(db:D1Database,actor:Actor,billId:string){
 human(actor);need(actor,'owner');
 insist(await stmt(db,'SELECT 1 WHERE '+principalSql,actor.id,actor.email).first(),'Only the active principal may approve a write-off reversal',403);
 const bill=await stmt(db,'SELECT * FROM s_bills WHERE id=?',billId).first<Data>();insist(bill,'Invoice not found',404);
 await matter(db,actor,bill.matter_id);return bill;
}
async function history(db:D1Database,bill:Data,reversalId?:string){
 const writeoffs=await rows(db,'SELECT * FROM s_invoice_writeoffs WHERE bill_id=? ORDER BY at,id',bill.id);
 const reversals=await rows(db,'SELECT * FROM s_invoice_writeoff_reversals WHERE bill_id=? ORDER BY at,id',bill.id);
 return {billId:bill.id,revision:bill.revision,reversalId:reversalId??null,writeoffs:writeoffs.map(w=>({...w,remainingCents:w.cents-reversals.filter(r=>r.writeoff_id===w.id).reduce((n,r)=>n+r.cents,0)})),reversals,funds:await invoiceFunds(db,bill.id)};
}
export async function invoiceWriteoffHistory(db:D1Database,actor:Actor,billId:string){return history(db,await access(db,actor,billId));}

// Reversing a concession restores receivables only; receipts and bank entries
// retain their independent history. Approval and posting form one atomic act.
export async function reverseInvoiceWriteoff(db:D1Database,actor:Actor,billId:string,b:Data){
 const bill=await access(db,actor,billId);insist(b.approve===true,'Explicit principal finance approval is required',403);
 const key=text(b.requestKey,'Request reference',100),writeoffId=text(b.writeoffId,'Original write-off',100),revision=text(b.revision,'Reviewed invoice revision',100),reason=text(b.reason,'Reversal reason',2000),cents=integer(b.cents,'Reversed USD cents',1,100000000000);
 const request=JSON.stringify({billId,writeoffId,revision,cents,reason});
 async function replay(){
  const prior=await stmt(db,'SELECT * FROM s_invoice_writeoff_reversals WHERE request_key=?',key).first<Data>();
  if(prior)insist(prior.request_json===request,'This request reference retains a different reversal decision',409);return prior;
 }
 const prior=await replay();if(prior)return history(db,bill,prior.id);
 insist(bill.revision===revision&&['approved','exported'].includes(bill.status)&&!bill.corrects_bill_id,'Review the exact current live invoice revision',409);
 const original=await stmt(db,'SELECT * FROM s_invoice_writeoffs WHERE id=? AND bill_id=?',writeoffId,billId).first<Data>();insist(original,'Original write-off not found',404);
 const remainingSql='(SELECT w.cents-COALESCE((SELECT SUM(r.cents) FROM s_invoice_writeoff_reversals r WHERE r.writeoff_id=w.id),0) FROM s_invoice_writeoffs w WHERE w.id=? AND w.bill_id=?)';
 const remaining=await stmt(db,'SELECT '+remainingSql+' cents',writeoffId,billId).first<Data>();insist(cents<=remaining!.cents,'Reversal exceeds the remaining original write-off',409);
 const reversalId=id(),at=now();
 try{await atomic(db,actor,[
  guard(db,principalSql,actor.id,actor.email),accessGuard(db,actor,bill.matter_id),
  guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status IN('approved','exported') AND corrects_bill_id IS NULL)",billId,revision),
  guard(db,remainingSql+'>=?',writeoffId,billId,cents),
  stmt(db,'INSERT INTO s_invoice_writeoff_reversals VALUES(?,?,?,?,?,?,?,?,?,?,?)',reversalId,key,request,writeoffId,billId,revision,cents,reason,actor.email,actor.id,at),
  audit(db,actor,'invoice.writeoff_reversed',billId,request,{matterId:bill.matter_id})
 ]);}catch(error){
  if(!(error instanceof Fault)||error.status!==409)throw error;
  // A competing identical request may have committed; recheck current authority
  // and matter access before returning its retained finance decision.
  await access(db,actor,billId);const committed=await replay();if(!committed)throw error;return history(db,bill,committed.id);
 }
 return history(db,bill,reversalId);
}
