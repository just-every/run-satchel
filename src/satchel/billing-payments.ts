import {feePaymentParts,feePaymentWrites} from './billing-fee-money';
import {atomic,audit,date,digest,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {invoiceFunds} from './trust-transfers';
import {offlinePaidSql,writeoffSql} from './billing-money-sql';

const money=(v:unknown)=>integer(v,'USD cents',1,100_000_000_000);
const staff=(a:Actor)=>{human(a);need(a,'owner','billing');};
function day(value:unknown){const d=date(value);insist(d<=now().slice(0,10),'A received payment cannot be dated in the future');return d;}
async function epoch(db:D1Database){return (await stmt(db,'SELECT revision FROM s_billing_money_revision WHERE id=1').first<Data>())!.revision;}
const unchanged=(db:D1Database,n:number)=>guard(db,'(SELECT revision FROM s_billing_money_revision WHERE id=1)=?',n);
async function replay(db:D1Database,key:string,kind:string,fingerprint:string){const p=await stmt(db,'SELECT * FROM s_billing_requests WHERE request_key=?',key).first<Data>();if(p)insist(p.kind===kind&&p.fingerprint===fingerprint,'Request reference already records a different action',409);return p;}
async function post(db:D1Database,a:Actor,key:string,kind:string,input:Data,result:string,writes:D1PreparedStatement[]){
 const fingerprint=await digest(JSON.stringify(input)),prior=await replay(db,key,kind,fingerprint);if(prior)return prior.result_id as string;
 try{await atomic(db,a,[stmt(db,'INSERT INTO s_billing_requests VALUES(?,?,?,?)',key,kind,fingerprint,result),...writes]);}
 catch(error){if(!(error instanceof Fault)||error.status!==409)throw error;const committed=await replay(db,key,kind,fingerprint);if(!committed)throw error;return committed.result_id as string;}
 return result;
}
async function invoice(db:D1Database,a:Actor,billId:string,payer:string):Promise<Data>{
 const b=await stmt(db,'SELECT b.*,t.snapshot tax_snapshot,i.number FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.id=?',billId).first<Data>();
 insist(b,'Choose an issued invoice',404);await matter(db,a,b.matter_id);const s=JSON.parse(b.tax_snapshot??b.snapshot);
 insist(s.client===payer,'Allocate only to invoices of the recorded payer',409);insist(!b.corrects_bill_id&&['approved','exported'].includes(b.status),'Choose a live original invoice; corrections belong to its balance',409);
 return {...b,snapshot:s,funds:await invoiceFunds(db,b.id)};
}
async function split(db:D1Database,b:Data,cents:number,effective?:string){
 const baseCents=Math.min(cents,Math.max(0,b.funds.reservable_cents));insist(cents<=b.funds.due_cents-b.funds.reserved_cents,'Allocation exceeds the unpaid amount after pending trust reservations',409);
 const feeCents=cents-baseCents;insist(!feeCents||effective,'Use the separate finance waiver for late fees',409);const feeParts=feeCents?await feePaymentParts(db,b.id,feeCents,effective!):[];
 const used=await stmt(db,`SELECT ${offlinePaidSql('b.id',undefined,'earned_cents')}+${writeoffSql('b.id',undefined,'earned_cents')}+COALESCE((SELECT SUM(COALESCE(a.earned_cents,p.cents)) FROM s_operating_payments p LEFT JOIN s_tax_trust_allocations a ON a.transfer_id=p.transfer_id WHERE p.bill_id=b.id AND NOT EXISTS(SELECT 1 FROM s_operating_payment_reversals r WHERE r.payment_id=p.id)),0) earned FROM s_bills b WHERE b.id=?`,b.id).first<Data>();
 const earned=Math.min(baseCents,Math.max(0,b.funds.earned_cents-used!.earned));return {baseCents,earned,tax:baseCents-earned,feeParts};
}
export async function receiptAccess(db:D1Database,a:Actor,receiptId:string):Promise<Data>{
 const r=await stmt(db,'SELECT * FROM s_billing_receipts WHERE id=?',receiptId).first<Data>();insist(r,'Receipt not found',404);await matter(db,a,r.source_matter_id);
 let allocations=await rows(db,'SELECT a.*,b.matter_id,i.number FROM s_billing_allocations a JOIN s_bills b ON b.id=a.bill_id JOIN s_invoice_issues i ON i.bill_id=b.id WHERE receipt_id=? ORDER BY a.effective_date,a.at,a.id',r.id);
 const feeAllocations=await rows(db,"SELECT a.*,d.bill_id,b.matter_id,i.number,'late_fee' kind FROM s_billing_fee_allocations a JOIN s_billing_fee_drafts d ON d.id=a.draft_id JOIN s_bills b ON b.id=d.bill_id JOIN s_invoice_issues i ON i.bill_id=b.id WHERE a.receipt_id=?",r.id);allocations=[...allocations,...feeAllocations].sort((x,y)=>x.effective_date.localeCompare(y.effective_date)||x.at.localeCompare(y.at)||x.id.localeCompare(y.id));
 for(const x of allocations)await matter(db,a,x.matter_id);
 const reversal=await stmt(db,'SELECT * FROM s_billing_receipt_reversals WHERE receipt_id=?',r.id).first<Data>();
 return {...r,allocations,reversal,unapplied_cents:reversal?0:r.cents-allocations.reduce((n,x)=>n+x.cents,0)};
}
export async function billingPayments(db:D1Database,a:Actor,matterId:string){
 staff(a);const m=await matter(db,a,matterId),receipts:Data[]=[];
 for(const r of await rows(db,'SELECT id FROM s_billing_receipts WHERE payer=? ORDER BY received_date,at,id',m.client)){
  try{receipts.push(await receiptAccess(db,a,r.id));}catch(error){if(!(error instanceof Fault)||error.status!==404)throw error;}
 }
 const bills=await rows(db,"SELECT b.id,b.matter_id,i.number FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.matter_id=? AND b.corrects_bill_id IS NULL AND b.status IN('approved','exported') ORDER BY json_extract(b.snapshot,'$.date'),b.created_at,b.id",matterId);
 const invoices=await Promise.all(bills.map(async b=>({...b,balance:await invoiceFunds(db,b.id)})));
 const writeoffs=await rows(db,'SELECT w.*,d.actor approved_by,d.at approved_at FROM s_billing_writeoffs w JOIN s_bills b ON b.id=w.bill_id LEFT JOIN s_billing_writeoff_decisions d ON d.writeoff_id=w.id WHERE b.matter_id=? ORDER BY w.at,w.id',matterId);
 return {payer:m.client,receipts,invoices,writeoffs,accounts:await rows(db,"SELECT id,name FROM s_trust_accounts WHERE kind='operating' ORDER BY name,id")};
}
function allocationInput(body:Data){
 insist(Array.isArray(body.allocations)&&body.allocations.length<=50,'Choose up to 50 invoice allocations');
 const list=body.allocations.map((x:Data)=>({billId:text(x.billId,'Invoice ID',100),cents:money(x.cents)}));insist(new Set(list.map(x=>x.billId)).size===list.length,'Allocate to each invoice once per request');return list;
}
export async function recordOfflinePayment(db:D1Database,a:Actor,matterId:string,b:Data){
 staff(a);const m=await matter(db,a,matterId),key=text(b.requestKey,'Request reference',100),payer=text(b.payer,'Payer',200);
 insist(payer===m.client,'Payer must match the recorded client for this matter',409);insist(b.destination==='operating','Trust receipts must use Trust, never operating invoice payments');
 insist(b.confirmedReceived===true,'Confirm the funds were received outside Satchel; a pending attempt is not payment');
 insist(['cash','check','wire','ach'].includes(b.method),'Choose cash, check, wire or ACH');
 const received=day(b.receivedDate),deposit=day(b.depositDate);insist(deposit>=received,'Deposit date cannot precede receipt');
 const accountId=text(b.accountId,'Operating deposit account',100),cents=money(b.cents),reference=text(b.reference,'Check or wire reference',200),mode=b.mode??'explicit';
 insist(mode==='explicit'||mode==='oldest','Choose explicit or oldest-first allocation');
 const input={matterId,payer,method:b.method,reference,received,deposit,accountId,cents,mode,allocations:mode==='explicit'?allocationInput(b):[]};
 const existing=await replay(db,key,'receipt',await digest(JSON.stringify(input)));if(existing)return receiptAccess(db,a,existing.result_id);
 const revision=await epoch(db);insist(await stmt(db,"SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='operating'",accountId).first(),'Choose a separate operating deposit account');
 const allocations:Data[]=[],checks:D1PreparedStatement[]=[accessGuard(db,a,matterId),unchanged(db,revision),guard(db,"EXISTS(SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='operating')",accountId)];
 let remaining=cents;
 const candidates=mode==='explicit'?input.allocations:await rows(db,"SELECT b.id billId FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.matter_id=? AND b.corrects_bill_id IS NULL AND b.status IN('approved','exported') ORDER BY json_extract(b.snapshot,'$.date'),b.created_at,b.id",matterId);
 for(const x of candidates){const bill=await invoice(db,a,x.billId,payer),amount=mode==='oldest'?Math.min(remaining,Math.max(0,bill.funds.due_cents-bill.funds.reserved_cents)):x.cents;if(!amount)continue;
  insist(amount<=remaining,'Allocations exceed the received payment');insist(deposit>=bill.snapshot.date,'Payment allocation cannot precede the invoice date');
  allocations.push({bill,cents:amount,...await split(db,bill,amount,deposit)});checks.push(accessGuard(db,a,bill.matter_id));remaining-=amount;
 }
 const receiptId=id(),at=now(),writes=[...checks,stmt(db,'INSERT INTO s_billing_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)',receiptId,matterId,payer,b.method,reference,received,deposit,accountId,cents,a.email,at),...allocations.flatMap(x=>[...(x.baseCents?[stmt(db,'INSERT INTO s_billing_allocations VALUES(?,?,?,?,?,?,?,?,?)',id(),receiptId,x.bill.id,x.baseCents,x.earned,x.tax,deposit,a.email,at)]:[]),...feePaymentWrites(db,a,receiptId,x.feeParts,deposit,at)]),audit(db,a,'billing.offline_received',receiptId,reference,{matterId,cents,allocationCount:allocations.length})];
 const result=await post(db,a,key,'receipt',input,receiptId,writes);return receiptAccess(db,a,result);
}
export async function applyOfflineCredit(db:D1Database,a:Actor,receiptId:string,b:Data){
 staff(a);const revision=await epoch(db),r=await receiptAccess(db,a,receiptId),key=text(b.requestKey,'Request reference',100),effective=day(b.date),allocations=allocationInput(b);insist(allocations.length,'Choose at least one invoice');
 const input={receiptId,effective,allocations},prior=await replay(db,key,'credit',await digest(JSON.stringify(input)));if(prior)return receiptAccess(db,a,prior.result_id);
 insist(!r.reversal,'A reversed receipt has no available credit',409);insist(effective>=r.deposit_date,'Credit application cannot precede its deposit');
 let remaining=r.unapplied_cents;const writes:D1PreparedStatement[]=[unchanged(db,revision),accessGuard(db,a,r.source_matter_id)];
 for(const x of allocations){const bill=await invoice(db,a,x.billId,r.payer);insist(effective>=bill.snapshot.date,'Credit application cannot precede the invoice date');insist(x.cents<=remaining,'Allocation exceeds unapplied credit',409);const components=await split(db,bill,x.cents,effective);remaining-=x.cents;const at=now();writes.push(accessGuard(db,a,bill.matter_id),...(components.baseCents?[stmt(db,'INSERT INTO s_billing_allocations VALUES(?,?,?,?,?,?,?,?,?)',id(),r.id,bill.id,components.baseCents,components.earned,components.tax,effective,a.email,at)]:[]),...feePaymentWrites(db,a,r.id,components.feeParts,effective,at));}
 for(const x of r.allocations)writes.push(accessGuard(db,a,x.matter_id));writes.push(audit(db,a,'billing.credit_applied',r.id,'',{matterId:r.source_matter_id}));
 await post(db,a,key,'credit',input,r.id,writes);return receiptAccess(db,a,r.id);
}
export async function reverseOfflinePayment(db:D1Database,a:Actor,receiptId:string,b:Data){
 staff(a);const revision=await epoch(db),r=await receiptAccess(db,a,receiptId),key=text(b.requestKey,'Request reference',100),effective=day(b.date),reason=text(b.reason,'Reversal reason',2000),input={receiptId,effective,reason};
 const prior=await replay(db,key,'reverse',await digest(JSON.stringify(input)));if(prior)return receiptAccess(db,a,prior.result_id);
 insist(!r.reversal,'This receipt was already reversed',409);insist(effective>=r.deposit_date&&r.allocations.every((x:Data)=>x.effective_date<=effective),'Reversal cannot precede receipt or its credit applications');
 const writes=[unchanged(db,revision),accessGuard(db,a,r.source_matter_id),...r.allocations.map((x:Data)=>accessGuard(db,a,x.matter_id)),stmt(db,'INSERT INTO s_billing_receipt_reversals VALUES(?,?,?,?,?,?)',id(),r.id,effective,reason,a.email,now()),audit(db,a,'billing.receipt_reversed',r.id,reason,{matterId:r.source_matter_id})];
 await post(db,a,key,'reverse',input,r.id,writes);return receiptAccess(db,a,r.id);
}
export async function requestWriteoff(db:D1Database,a:Actor,billId:string,b:Data){
 staff(a);const revision=await epoch(db),row=await stmt(db,'SELECT snapshot FROM s_bills WHERE id=?',billId).first<Data>();insist(row,'Invoice not found',404);
 const bill=await invoice(db,a,billId,JSON.parse(row.snapshot).client),cents=money(b.cents),effective=day(b.date),reason=text(b.reason,'Write-off reason',2000),key=text(b.requestKey,'Request reference',100),input={billId,cents,effective,reason};
 const prior=await replay(db,key,'writeoff',await digest(JSON.stringify(input)));if(prior)return stmt(db,'SELECT * FROM s_billing_writeoffs WHERE id=?',prior.result_id).first<Data>();
 insist(effective>=bill.snapshot.date,'Write-off cannot precede the invoice date');const components=await split(db,bill,cents),result=id();
 const resultId=await post(db,a,key,'writeoff',input,result,[unchanged(db,revision),accessGuard(db,a,bill.matter_id),stmt(db,'INSERT INTO s_billing_writeoffs VALUES(?,?,?,?,?,?,?,?,?)',result,bill.id,cents,components.earned,components.tax,effective,reason,a.email,now()),audit(db,a,'billing.writeoff_requested',result,reason,{matterId:bill.matter_id})]);return stmt(db,'SELECT * FROM s_billing_writeoffs WHERE id=?',resultId).first<Data>();
}
export async function approveWriteoff(db:D1Database,a:Actor,writeoffId:string,b:Data){
 human(a);need(a,'owner');const w=await stmt(db,'SELECT w.*,b.matter_id FROM s_billing_writeoffs w JOIN s_bills b ON b.id=w.bill_id WHERE w.id=?',writeoffId).first<Data>();insist(w,'Write-off not found',404);await matter(db,a,w.matter_id);
 const key=text(b.requestKey,'Request reference',100),input={writeoffId},prior=await replay(db,key,'writeoff_approve',await digest(JSON.stringify(input)));if(prior)return {id:writeoffId};
 const revision=await epoch(db),row=await stmt(db,'SELECT snapshot FROM s_bills WHERE id=?',w.bill_id).first<Data>(),bill=await invoice(db,a,w.bill_id,JSON.parse(row!.snapshot).client),components=await split(db,bill,w.cents);
 insist(components.earned===w.earned_cents&&components.tax===w.tax_cents,'Invoice changed; request a fresh write-off review',409);
 await post(db,a,key,'writeoff_approve',input,writeoffId,[unchanged(db,revision),accessGuard(db,a,w.matter_id),stmt(db,'INSERT INTO s_billing_writeoff_decisions VALUES(?,?,?)',w.id,a.email,now()),audit(db,a,'billing.writeoff_approved',w.id,w.reason,{matterId:w.matter_id,cents:w.cents})]);return {id:writeoffId};
}
