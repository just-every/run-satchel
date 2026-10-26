import {getBill,prepareFeeBill,type BillStage} from './billing';
import {audit,date,human,id,insist,need,now,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {loadFeePlan,periods} from './fee-plans';

export const scheduledFeeArrangements=['flat','retainer','milestone'];
// Preparation adds routing metadata only. Counsel's fee and earning approvals remain separate.
export async function stageFeePrebill(db:D1Database,actor:Actor,matterId:string,item:Data,stage:BillStage){
 human(actor);need(actor,'owner','lawyer','billing');
 insist(item.entryIds===undefined||(Array.isArray(item.entryIds)&&item.entryIds.length===0),'Scheduled fee occurrences do not select time or cost entries');
 if(!item.existingBillId){
  const planId=text(item.feePlanId,'Reviewed fee plan',100),period=date(item.feePeriod);
  return prepareFeeBill(db,actor,matterId,planId,period,stage);
 }
 const bill=await getBill(db,actor,text(item.existingBillId,'Existing fee occurrence',100));
 insist(bill.matterId===matterId,'Fee occurrence must belong to the selected matter',409);
 insist(item.revision===bill.revision,'Fee occurrence changed; select its exact current revision',409);
 insist(bill.status==='draft'&&!bill.artifact&&!bill.approvedBy&&!bill.snapshot.prebill,'Only an unapproved fee occurrence outside any prebill run may be adopted',409);
 const occurrence=await stmt(db,'SELECT plan_id,period FROM s_fee_occurrences WHERE bill_id=?',bill.id).first<Data>();
 insist(occurrence&&scheduledFeeArrangements.includes(bill.snapshot.feePlan?.kind),'Select a native flat, retainer or milestone occurrence',422);
 if(item.feePlanId!==undefined)insist(item.feePlanId===occurrence.plan_id,'Existing occurrence belongs to a different fee plan',409);
 if(item.feePeriod!==undefined)insist(date(item.feePeriod)===occurrence.period,'Existing occurrence belongs to a different fee period',409);
 const plan=await loadFeePlan(db,actor,matterId,occurrence.plan_id);
 insist(JSON.stringify(plan)===JSON.stringify(bill.snapshot.feePlan)&&bill.snapshot.feePeriod===occurrence.period&&periods(plan,occurrence.period).includes(occurrence.period),'Existing occurrence must retain the exact reviewed fee terms and due period',409);
 const raw=await stmt(db,'SELECT snapshot FROM s_bills WHERE id=?',bill.id).first<Data>(),snapshot={...bill.snapshot,...stage.snapshot},revision=id(),adoptionId=id(),at=now();
 stage.billId=bill.id;
 stage.writes.push(accessGuard(db,actor,matterId),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status='draft' AND artifact IS NULL AND approved_by IS NULL AND snapshot=?)",bill.id,bill.revision,raw!.snapshot),
  guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_issues WHERE bill_id=?) AND NOT EXISTS(SELECT 1 FROM s_prebill_run_items WHERE bill_id=?)',bill.id,bill.id),
  guard(db,'EXISTS(SELECT 1 FROM s_fee_occurrences WHERE bill_id=? AND plan_id=? AND period=?)',bill.id,occurrence.plan_id,occurrence.period),
  stmt(db,'INSERT INTO s_prebill_fee_adoptions VALUES(?,?,?,?,?,?,?,?,?)',adoptionId,bill.id,snapshot.prebill.runId,bill.revision,revision,raw!.snapshot,JSON.stringify(snapshot),actor.email,at),
  stmt(db,"UPDATE s_bills SET snapshot=?,revision=? WHERE id=? AND revision=? AND status='draft'",JSON.stringify(snapshot),revision,bill.id,bill.revision),
  audit(db,actor,'prebill.fee_occurrence_adopted',bill.id,JSON.stringify({runId:snapshot.prebill.runId,planId:plan.id,period:occurrence.period,beforeRevision:bill.revision,revision}),{matterId}),
 );
 return {...bill,revision,snapshot};
}
