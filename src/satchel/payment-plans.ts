import {atomic,audit,date,human,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {paymentAccess,paymentInvoice} from './invoice-payment';
import {invoiceAvailableGuard,invoiceFunds} from './trust-transfers';
import {guard} from './trust-guards';
import {planAccess,planCurrent,planEvent,planStaff,planView,stopPlanWrites} from './payment-plan-records';
import type {StripeEnv} from './stripe-api';
export {startPlanMandate,confirmPlanMandate} from './payment-plan-stripe';
export {runPaymentPlans} from './payment-plan-runner';
export {syncPaymentPlanAttempt} from './payment-plan-records';

export async function paymentPlan(env:StripeEnv,actor:Actor,planId:string){return planView(env,await planAccess(env,actor,planId),actor);}
export async function paymentPlans(env:StripeEnv,actor:Actor,billId:string){
 await paymentInvoice(env.DB,actor,billId);
 const plans=await rows(env.DB,'SELECT * FROM s_payment_plans WHERE bill_id=? ORDER BY created_at,id',billId);
 return {plans:await Promise.all(plans.map(p=>planView(env,p,actor))),canApprove:actor.role==='owner'&&actor.channel==='person'};
}
function noImportedCredentials(input:unknown){
 if(!input||typeof input!=='object')return;
 for(const [key,value] of Object.entries(input)){
  insist(!/token|secret|card|customer|mandate|payment.?method|bank.?account/i.test(key),'Source credentials cannot be copied; the client must authorize a new hosted mandate');
  noImportedCredentials(value);
 }
}
export async function savePaymentPlan(env:StripeEnv,actor:Actor,billId:string,b:Data){
 planStaff(actor);insist(b.approve===true,'Explicit principal approval of these installments is required',403);noImportedCredentials(b);
 const bill=await paymentInvoice(env.DB,actor,billId);insist(['approved','exported'].includes(bill.status)&&!bill.corrects_bill_id,'Choose a current issued original operating invoice',409);
 insist(b.billRevision===bill.revision,'Review the current invoice revision',409);
 const funds=await invoiceFunds(env.DB,billId),balance=integer(b.balanceCents,'Allocated USD cents',1),start=date(b.startDate),reason=text(b.reason,'Plan approval or hardship reason',2000);
 insist(balance<=funds.reservable_cents,'Plan allocation exceeds the unpaid unreserved invoice balance',409);
 insist(Array.isArray(b.installments)&&b.installments.length>0&&b.installments.length<=120,'Define between 1 and 120 installments');
 let previous=start,sum=0;
 const installments=b.installments.map((v:Data,position:number)=>{
  const due=date(v.dueDate),cents=integer(v.cents,'Installment USD cents',1);
  insist(due>=start&&(position===0||due>previous),'Installment dates must be distinct, ordered and on or after the start date');previous=due;sum+=cents;
  return {id:id(),position,due,cents};
 });
 insist(sum===balance,'Installments must allocate exactly the approved plan balance');
 const old=b.planId?await planAccess(env,actor,text(b.planId,'Payment plan',100)):null;
 if(old){
  insist(old.bill_id===billId&&b.revision===old.revision,'Review the exact current plan before a hardship change',409);
  insist(!await stmt(env.DB,`SELECT 1 FROM s_payment_plan_attempts a JOIN s_payment_plan_installments i ON i.id=a.installment_id JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND c.status IN('creating','open','pending','uncertain','returned')`,old.id).first(),'Reconcile outstanding or returned collections before changing this plan',409);
 }
 const sourceSystem=old?.source_system??(b.sourceSystem?text(b.sourceSystem,'Source system',100):null),sourceReference=old?.source_reference??(b.sourceReference?text(b.sourceReference,'Source plan reference',300):null);
 insist(Boolean(sourceSystem)===Boolean(sourceReference),'Imported plans require both source system and source plan reference');
 const at=now(),planId=old?.id??id(),revision=id(),p={id:planId,revision},db=env.DB,reauthorizationTask=sourceSystem?id():null;
 const taskDue=new Date(Date.parse(installments[0].due+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 await atomic(db,actor,[paymentAccess(db,actor,bill.matter_id),invoiceAvailableGuard(db,billId,funds.reservable_cents),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status IN('approved','exported'))",billId,bill.revision),
 ...(old?[planCurrent(db,old),guard(db,`NOT EXISTS(SELECT 1 FROM s_payment_plan_attempts a JOIN s_payment_plan_installments i ON i.id=a.installment_id JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND c.status IN('creating','open','pending','uncertain','returned'))`,planId),stmt(db,"UPDATE s_payment_plans SET revision=?,status='paused',stop_reason=NULL,approved_by=?,approved_operator_id=?,approved_at=? WHERE id=?",revision,actor.email,actor.id,at,planId)]:[stmt(db,"INSERT INTO s_payment_plans VALUES(?,?,?,'paused',NULL,?,?,?,?,?,?)",planId,billId,revision,sourceSystem,sourceReference,actor.email,actor.id,at,at)]),
 stmt(db,'INSERT INTO s_payment_plan_versions VALUES(?,?,?,?,?,?,?,?)',revision,planId,bill.revision,start,balance,reason,actor.email,at),
 ...installments.map(i=>stmt(db,'INSERT INTO s_payment_plan_installments VALUES(?,?,?,?,?,?)',i.id,planId,revision,i.position,i.due,i.cents)),
 ...(reauthorizationTask?[stmt(db,"INSERT INTO s_tasks(id,matter_id,title,priority,due_date,owner_email,recurrence,series_id,status,revision,created_by,created_at) VALUES(?,?,?,'high',?,?,'none',?,'open',?,?,?)",reauthorizationTask,bill.matter_id,'Obtain client authorization for imported payment plan',taskDue,actor.email,reauthorizationTask,id(),actor.email,at)]:[]),
 planEvent(db,p,old?'hardship_changed':sourceSystem?'imported_paused':'approved_paused',JSON.stringify({reason,balanceCents:balance,startDate:start,sourceSystem,sourceReference}),actor.email,reauthorizationTask),audit(db,actor,old?'payment_plan.hardship_changed':'payment_plan.approved',planId,JSON.stringify({revision,balanceCents:balance,sourceSystem,sourceReference}),{matterId:bill.matter_id})]);
 return paymentPlan(env,actor,planId);
}
export async function paymentPlanAction(env:StripeEnv,actor:Actor,planId:string,b:Data){
 human(actor);const p=await planAccess(env,actor,planId),kind=text(b.kind,'Plan action',30),reason=text(b.reason,'Reason',2000);
 insist(['revoke','dispute','pause'].includes(kind),'Choose revoke, dispute or pause');
 if(actor.role!=='client')planStaff(actor);
 if(actor.role==='client'){
  insist(kind!=='pause','Only the principal can pause a plan',403);
  const c=await stmt(env.DB,'SELECT client_email FROM s_payment_plan_consents WHERE plan_id=? AND revision=?',p.id,p.revision).first<Data>();
  insist(!c||c.client_email===actor.email,'Only the consenting payer may revoke this mandate',403);
 }
 insist(b.revision===p.revision,'Review the current plan revision',409);
 if(p.status==='stopped')return planView(env,p,actor);
 await atomic(env.DB,actor,[paymentAccess(env.DB,actor,p.matter_id),...stopPlanWrites(env.DB,p,kind+': '+reason,actor.email),audit(env.DB,actor,'payment_plan.'+kind,p.id,reason,{matterId:p.matter_id})]);
 return paymentPlan(env,actor,planId);
}
