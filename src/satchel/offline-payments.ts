import {atomic,audit,date,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {requireArea} from './role-areas';
import {invoiceFunds,invoiceAvailableGuard} from './trust-transfers';

function staff(actor:Actor){human(actor);need(actor,'owner','billing');requireArea(actor,'billing','write');requireArea(actor,'bank','full');}
async function billAccess(db:D1Database,actor:Actor,billId:string){
 const b=await stmt(db,'SELECT b.*,m.client FROM s_bills b JOIN s_matters m ON m.id=b.matter_id WHERE b.id=?',billId).first<Data>();
 insist(b,'Invoice not found',404);await matter(db,actor,b.matter_id);return b;
}
async function receiptAccess(db:D1Database,actor:Actor,receiptId:string){
 const r=await stmt(db,'SELECT * FROM s_offline_receipts WHERE id=?',receiptId).first<Data>();insist(r,'Payment not found',404);
 // A payer-wide receipt must never disclose a walled allocation or its residual.
 const bills=await rows(db,'SELECT DISTINCT bill_id FROM s_offline_allocations WHERE receipt_id=?',receiptId);
 for(const b of bills)await billAccess(db,actor,b.bill_id);
 return r;
}
async function replay(db:D1Database,table:string,key:string,json:string){
 const p=await stmt(db,`SELECT * FROM ${table} WHERE request_key=?`,key).first<Data>();
 if(p)insist(p.request_json===json,'This request reference retains a different decision',409);return p;
}
const unbounced=(db:D1Database,r:string)=>guard(db,"NOT EXISTS(SELECT 1 FROM s_offline_actions WHERE receipt_id=? AND kind='bounce')",r);
const creditSql=`(SELECT r.cents-COALESCE((SELECT SUM(a.cents) FROM s_offline_allocations a WHERE a.receipt_id=r.id AND NOT EXISTS(SELECT 1 FROM s_offline_releases x WHERE x.allocation_id=a.id)),0) FROM s_offline_receipts r WHERE r.id=?)`;
async function allocations(db:D1Database,actor:Actor,payer:string,input:unknown,available:number){
 insist(Array.isArray(input)&&input.length>0&&input.length<=100,'Select between 1 and 100 invoice allocations');
 const result:Data[]=[],seen=new Set();let left=available;
 for(const a of input){insist(a&&typeof a==='object'&&!Array.isArray(a),'Give an invoice and exact amount for every allocation');const billId=text(a.billId,'Invoice',100);insist(!seen.has(billId),'Select each invoice once');seen.add(billId);
  const b=await billAccess(db,actor,billId);insist(b.client===payer,'Every invoice must belong to the recorded payer',409);
  insist(['approved','exported'].includes(b.status)&&!b.corrects_bill_id,'Choose a live approved original invoice',409);
  const f=await invoiceFunds(db,billId);const cents=integer(a.cents,'Allocated USD cents',1,100000000000);
  insist(cents<=left&&cents<=f.reservable_cents,'Allocation exceeds available credit or unpaid unreserved invoice balance',409);left-=cents;
  result.push({billId,cents,bill:b,funds:f});
 }
 return result;
}
function allocationGuards(db:D1Database,actor:Actor,aa:Data[]){return aa.flatMap(a=>[
 accessGuard(db,actor,a.bill.matter_id),
 guard(db,"EXISTS(SELECT 1 FROM s_bills b JOIN s_matters m ON m.id=b.matter_id WHERE b.id=? AND b.revision=? AND b.status IN('approved','exported') AND m.client=?)",a.billId,a.bill.revision,a.bill.client),
 invoiceAvailableGuard(db,a.billId,a.funds.reservable_cents),
 ]);}
function insertAllocations(db:D1Database,receiptId:string,actionId:string,aa:Data[]){return aa.map(a=>stmt(db,'INSERT INTO s_offline_allocations VALUES(?,?,?,?,?)',id(),receiptId,actionId,a.billId,a.cents));}
export async function offlineReceipt(db:D1Database,actor:Actor,receiptId:string){
 staff(actor);const r=await receiptAccess(db,actor,receiptId),aa=await rows(db,'SELECT a.*,rel.action_id release_action_id FROM s_offline_allocations a LEFT JOIN s_offline_releases rel ON rel.allocation_id=a.id WHERE a.receipt_id=? ORDER BY a.id',receiptId),actions=await rows(db,'SELECT id,kind,reason,actor,at FROM s_offline_actions WHERE receipt_id=? ORDER BY at,id',receiptId);
 const bounced=actions.some(a=>a.kind==='bounce');return {...r,request_json:undefined,allocations:aa,actions,creditCents:bounced?0:r.cents-aa.filter(a=>!a.release_action_id).reduce((n,a)=>n+a.cents,0),status:bounced?'bounced':'recorded'};
}
export async function recordOffline(db:D1Database,actor:Actor,b:Data){
 staff(actor);const key=text(b.requestKey,'Request reference',100),payer=text(b.payer,'Payer',300),method=text(b.method,'Payment method',20);
 insist(['cash','check','wire','ach'].includes(method),'Choose cash, check, wire or ACH');
 insist(b.purpose==='operating','Trust receipts must use the trust receipt workflow');
 const reference=text(b.reference,'Check, wire or receipt reference',300),received=date(b.receivedDate),deposit=date(b.depositDate);insist(deposit>=received,'Deposit date cannot precede receipt date');
 const account=text(b.operatingAccountId,'Operating deposit account',100),cents=integer(b.cents,'Received USD cents',1,100000000000);
 const request=JSON.stringify({payer,method,reference,received,deposit,account,cents,purpose:b.purpose,allocation:b.allocations??null,oldestFirst:b.oldestFirst===true});
 const prior=await replay(db,'s_offline_receipts',key,request);if(prior)return offlineReceipt(db,actor,prior.id);
 let input=b.allocations;
 if(b.oldestFirst===true){insist(!b.allocations,'Choose oldest first or explicit amounts');const candidates=await rows(db,"SELECT b.id,b.matter_id FROM s_bills b JOIN s_matters m ON m.id=b.matter_id WHERE m.client=? AND b.status IN('approved','exported') AND b.corrects_bill_id IS NULL ORDER BY json_extract(b.snapshot,'$.date'),b.created_at,b.id",payer);input=[];let left=cents;
  // Refuse a hidden payer invoice rather than leak its age or silently skip it.
  for(const c of candidates){await matter(db,actor,c.matter_id);const f=await invoiceFunds(db,c.id);if(left>0&&f.reservable_cents>0){const amount=Math.min(left,f.reservable_cents);(input as Data[]).push({billId:c.id,cents:amount});left-=amount;}}
 }
 const aa=await allocations(db,actor,payer,input,cents);
 const receiptId=id(),actionId=id(),at=now();
 try{await atomic(db,actor,[guard(db,"EXISTS(SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='operating')",account),...allocationGuards(db,actor,aa),
 stmt(db,'INSERT INTO s_offline_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',receiptId,key,request,payer,method,reference,received,deposit,account,cents,actor.email,at),
 stmt(db,"INSERT INTO s_offline_actions VALUES(?,?,?,?,'allocate',?,?,?)",actionId,'receipt:'+receiptId,request,receiptId,'Initial allocation',actor.email,at),...insertAllocations(db,receiptId,actionId,aa),audit(db,actor,'offline.received',receiptId,request)]);}catch(e){if(!(e instanceof Fault)||e.status!==409)throw e;const p=await replay(db,'s_offline_receipts',key,request);if(!p)throw e;return offlineReceipt(db,actor,p.id);}
 return offlineReceipt(db,actor,receiptId);
}
export async function offlineAction(db:D1Database,actor:Actor,receiptId:string,b:Data){
 staff(actor);const r=await receiptAccess(db,actor,receiptId),key=text(b.requestKey,'Request reference',100),reason=text(b.reason,'Reason',2000),kind=text(b.kind,'Payment action',20);
 insist(['allocate','credit','bounce'].includes(kind),'Choose allocation, move to credit or bounce');
 const request=JSON.stringify({receiptId,kind,reason,allocations:b.allocations??null,billId:b.billId??null});
 const prior=await replay(db,'s_offline_actions',key,request);if(prior)return offlineReceipt(db,actor,receiptId);
 insist(!await stmt(db,"SELECT 1 FROM s_offline_actions WHERE receipt_id=? AND kind='bounce'",receiptId).first(),'This receipt has been returned',409);
 const sourceMatters=await rows(db,'SELECT DISTINCT b.matter_id FROM s_offline_allocations a JOIN s_bills b ON b.id=a.bill_id WHERE a.receipt_id=?',receiptId);
 const actionId=id(),at=now(),extra:D1PreparedStatement[]=sourceMatters.map(m=>accessGuard(db,actor,m.matter_id));
 if(kind==='allocate'){
  const available=Number((await stmt(db,'SELECT '+creditSql+' cents',receiptId).first<Data>())!.cents),aa=await allocations(db,actor,r.payer,b.allocations,available);
  extra.push(guard(db,creditSql+'>=?',receiptId,aa.reduce((n,a)=>n+a.cents,0)),...allocationGuards(db,actor,aa),...insertAllocations(db,receiptId,actionId,aa));
 }else{
  const aa=await rows(db,'SELECT a.*,b.matter_id,(SELECT action_id FROM s_offline_releases x WHERE x.allocation_id=a.id) released FROM s_offline_allocations a JOIN s_bills b ON b.id=a.bill_id WHERE a.receipt_id=?',receiptId);
  const selected=kind==='credit'?aa.filter(a=>!a.released&&a.bill_id===text(b.billId,'Invoice',100)):aa.filter(a=>!a.released);
  insist(kind==='bounce'||selected.length,'No live payment allocation for this invoice',409);
  if(kind==='bounce')insist(['check','ach'].includes(r.method),'Only check and ACH returns use the bounce action');
  for(const a of selected)extra.push(accessGuard(db,actor,a.matter_id),stmt(db,'INSERT INTO s_offline_releases VALUES(?,?)',a.id,actionId));
  // Refuse concurrent credit applications while releasing the observed allocations.
  extra.push(guard(db,'(SELECT COUNT(*) FROM s_offline_allocations WHERE receipt_id=?)=?',receiptId,aa.length));
 }
 try{await atomic(db,actor,[unbounced(db,receiptId),stmt(db,'INSERT INTO s_offline_actions VALUES(?,?,?,?,?,?,?,?)',actionId,key,request,receiptId,kind,reason,actor.email,at),...extra,audit(db,actor,'offline.'+kind,receiptId,request)]);}catch(e){if(!(e instanceof Fault)||e.status!==409)throw e;const p=await replay(db,'s_offline_actions',key,request);if(!p)throw e;}
 return offlineReceipt(db,actor,receiptId);
}
export async function writeOffInvoice(db:D1Database,actor:Actor,billId:string,b:Data){
 staff(actor);need(actor,'owner');insist(b.approve===true,'Explicit principal finance approval is required',403);
 const bill=await billAccess(db,actor,billId),key=text(b.requestKey,'Request reference',100),reason=text(b.reason,'Write-off reason',2000),cents=integer(b.cents,'Write-off USD cents',1,100000000000),request=JSON.stringify({billId,cents,reason,revision:b.revision});
 const prior=await replay(db,'s_invoice_writeoffs',key,request);if(prior)return prior;
 insist(bill.revision===b.revision&&['approved','exported'].includes(bill.status)&&!bill.corrects_bill_id,'Review the current live invoice',409);
 const f=await invoiceFunds(db,billId);insist(cents<=f.reservable_cents,'Write-off exceeds the unpaid unreserved amount',409);
 const aa=[{billId,bill,funds:f}];const writeoffId=id();
 try{await atomic(db,actor,[...allocationGuards(db,actor,aa),stmt(db,'INSERT INTO s_invoice_writeoffs VALUES(?,?,?,?,?,?,?,?)',writeoffId,key,request,billId,cents,reason,actor.email,now()),audit(db,actor,'invoice.writeoff',billId,request,{matterId:bill.matter_id})]);}catch(e){if(!(e instanceof Fault)||e.status!==409)throw e;const p=await replay(db,'s_invoice_writeoffs',key,request);if(!p)throw e;return p;}
 return stmt(db,'SELECT * FROM s_invoice_writeoffs WHERE id=?',writeoffId).first<Data>();
}
