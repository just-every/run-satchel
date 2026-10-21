import {atomic,audit,authority,Fault,human,id,insist,matter,need,now,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';

export async function getInvoiceVoid(db:D1Database,billId:string){
 return stmt(db,'SELECT bill_id,reviewed_revision,reason,actor,at FROM s_invoice_voids WHERE bill_id=?',billId).first<Data>();
}

const noFunds=`NOT EXISTS(SELECT 1 FROM s_operating_payments p WHERE p.bill_id=? AND p.cents>COALESCE((SELECT SUM(r.cents) FROM s_operating_payment_reversals r WHERE r.payment_id=p.id),0))
 AND NOT EXISTS(SELECT 1 FROM s_trust_transfers t WHERE t.bill_id=? AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','not_executed','cleared')))`;
const originalSources=`EXISTS(SELECT 1 FROM s_bills b WHERE b.id=? AND b.corrects_bill_id IS NULL
 AND json_extract(b.snapshot,'$.feePlan') IS NULL AND json_array_length(b.snapshot,'$.lines')>0
 AND NOT EXISTS(SELECT 1 FROM json_each(b.snapshot,'$.lines') l WHERE COALESCE(json_extract(l.value,'$.kind'),'') NOT IN('time','disbursement')))
 AND NOT EXISTS(SELECT 1 FROM s_bills WHERE corrects_bill_id=?)`;

async function currentAccess(db:D1Database,actor:Actor,matterId:string){
 await matter(db,actor,matterId);const a=authority(actor);
 insist(await stmt(db,`SELECT 1 WHERE ${a.sql}`,...a.params).first(),'Your authority to void this invoice is no longer active',403);
}
function replay(record:Data,revision:string,reason:string){
 insist(record.reviewed_revision===revision&&record.reason===reason,'This invoice was already voided with a different reviewed revision or reason',409);
 return record;
}

// Native BILL-016 slice: preserve reviewed history and release original work only.
export async function voidInvoice(db:D1Database,actor:Actor,billId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');
 const revision=text(body.revision,'Reviewed revision',100),reason=text(body.reason,'Void reason',2000);
 const bill=await stmt(db,'SELECT * FROM s_bills WHERE id=?',billId).first<Data>();
 insist(bill,'Bill not found',404);await currentAccess(db,actor,bill.matter_id);
 const prior=await getInvoiceVoid(db,billId);if(prior)return replay(prior,revision,reason);
 insist(bill.revision===revision,'Bill changed; review the current revision',409);
 insist(['approved','exported'].includes(bill.status),'Choose an approved or issued invoice',409);
 insist(await stmt(db,`SELECT 1 WHERE ${originalSources}`,billId,billId).first(),'Only original time and expense invoices without correction branches can be voided here',409);
 insist(await stmt(db,`SELECT 1 WHERE ${noFunds}`,billId,billId).first(),'Reverse live invoice payments and resolve pending trust applications before voiding',409);
 const at=now();
 try{
  await atomic(db,actor,[
   accessGuard(db,actor,bill.matter_id),
   guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status IN('approved','exported'))",billId,revision),
   guard(db,originalSources,billId,billId),guard(db,noFunds,billId,billId),
   stmt(db,'INSERT INTO s_invoice_voids(bill_id,reviewed_revision,reason,actor,at) VALUES(?,?,?,?,?)',billId,revision,reason,actor.email,at),
   stmt(db,"UPDATE s_bills SET status='void',revision=?,void_reason=?,voided_by=?,voided_at=? WHERE id=? AND revision=? AND status IN('approved','exported')",id(),reason,actor.email,at,billId,revision),
   stmt(db,'DELETE FROM s_billing_sources WHERE bill_id=?',billId),
   audit(db,actor,'invoice.voided',billId,reason,{matterId:bill.matter_id,reviewedRevision:revision}),
  ]);
 }catch(error){
  // A competing identical request may have committed. Read that durable result;
  // never retry the financial mutation or reconcile a changed request.
  if(!(error instanceof Fault)||error.status!==409)throw error;
  const committed=await getInvoiceVoid(db,billId);if(!committed)throw error;
  await currentAccess(db,actor,bill.matter_id);return replay(committed,revision,reason);
 }
 return (await getInvoiceVoid(db,billId))!;
}
