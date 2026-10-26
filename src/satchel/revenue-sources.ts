import {rows,type Data} from './model';

// Normalize retained money facts, never invoice value, write-offs or trust custody.
// A cleared transfer is an operating receipt; its preceding trust deposit is not.
export async function revenueSources(db:D1Database,matterId:string):Promise<Data[]> {
 const result:Data[]=[];
 for(const a of await rows(db,`SELECT a.*,r.reference,r.at received_at,x.at FROM s_offline_allocations a JOIN s_offline_receipts r ON r.id=a.receipt_id JOIN s_offline_actions x ON x.id=a.action_id JOIN s_bills b ON b.id=a.bill_id WHERE b.matter_id=? ORDER BY x.at,a.id`,matterId)){
  const reversals=await rows(db,'SELECT x.id,x.at,a.cents FROM s_offline_releases r JOIN s_offline_actions x ON x.id=r.action_id JOIN s_offline_allocations a ON a.id=r.allocation_id WHERE r.allocation_id=?',a.id);
  result.push({key:'offline:'+a.id,kind:'offline',id:a.id,receiptId:a.receipt_id,billId:a.bill_id,reference:a.reference,cents:a.cents,netCents:a.cents-reversals.reduce((n,r)=>n+r.cents,0),at:a.at,reversals});
 }
 for(const a of await rows(db,`SELECT p.*,a.earned_cents allocated_earned,a.tax_cents allocated_tax FROM s_operating_payments p LEFT JOIN s_tax_trust_allocations a ON a.transfer_id=p.transfer_id JOIN s_bills b ON b.id=p.bill_id WHERE b.matter_id=? ORDER BY p.at,p.id`,matterId)){
  const reversals=await rows(db,'SELECT id,cents,at FROM s_operating_payment_reversals WHERE payment_id=? ORDER BY at,id',a.id);
  result.push({key:'operating:'+a.id,kind:'operating',components:a.allocated_earned==null?null:{earnedCents:a.allocated_earned,taxCents:a.allocated_tax},id:a.id,billId:a.bill_id,reference:a.transfer_id,cents:a.cents,netCents:a.cents-reversals.reduce((n,r)=>n+r.cents,0),at:a.at,reversals});
 }
 for(const a of await rows(db,`SELECT sc.*,(SELECT MIN(at) FROM s_stripe_events e WHERE e.checkout_id=sc.id AND e.status IN('paid','returned')) collected_at FROM s_stripe_checkouts sc JOIN s_bills b ON b.id=sc.bill_id WHERE b.matter_id=? AND sc.purpose='operating' AND sc.status IN('paid','returned') ORDER BY sc.created_at,sc.id`,matterId)){
  const reversals=await rows(db,'SELECT id,cents,at FROM s_stripe_adjustments WHERE checkout_id=? ORDER BY at,id',a.id);
  result.push({key:'stripe:'+a.id,kind:'stripe',id:a.id,billId:a.bill_id,reference:a.session_id,cents:a.cents,netCents:a.cents-reversals.reduce((n,r)=>n+r.cents,0),at:a.collected_at??a.updated_at,reversals});
 }
 return result.sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key));
}
