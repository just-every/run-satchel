import {atomic,audit,id,insist,matter,now,rows,stmt,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {portalAccess} from './portal';
import {invoiceAvailableGuard,invoiceFunds} from './trust-transfers';
import {stripeApi,type StripeEnv} from './stripe-api';
import {reconcileStripe} from './stripe-events';
import {planStripeConfig} from './payment-plan-stripe';
import {planCurrent,planEvent,stopPlan,syncPaymentPlanAttempt} from './payment-plan-records';

async function runPlan(env:StripeEnv,p:Data,day:string){
 const db=env.DB;
 const prior=await rows(db,`SELECT c.* FROM s_payment_plan_installments i JOIN s_payment_plan_attempts a ON a.installment_id=i.id JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND i.revision=? ORDER BY i.position`,p.id,p.revision);
 for(const a of prior){
  if(['failed','returned','expired','uncertain'].includes(a.status)){await syncPaymentPlanAttempt(env,a.id);return;}
  if(['creating','open'].includes(a.status)){await stopPlan(env,p,'An interrupted collection needs human reconciliation','payment-plan-scheduler');return;}
  if(a.status==='pending')return;
 }
 const installment=await stmt(db,`SELECT i.* FROM s_payment_plan_installments i WHERE i.plan_id=? AND i.revision=? AND NOT EXISTS(SELECT 1 FROM s_payment_plan_attempts a WHERE a.installment_id=i.id) ORDER BY i.position LIMIT 1`,p.id,p.revision).first<Data>();
 if(!installment){if(prior.length)await syncPaymentPlanAttempt(env,prior.at(-1)!.id);return;}
 if(installment.due_date>day)return;
 let checkoutId:string|null=null;
 try{
  const operator=await stmt(db,"SELECT * FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active'",p.approved_operator_id,p.approved_by).first<Data>();
  insist(operator,'The principal who approved this plan no longer has current authority',409);
  const actor:Actor={id:operator.id,email:operator.email,name:operator.display_name,role:'owner',channel:'agent'};
  await matter(db,actor,p.matter_id);
  const bill=await stmt(db,'SELECT b.status,b.revision,v.bill_revision FROM s_bills b JOIN s_payment_plan_versions v ON v.id=? WHERE b.id=?',p.revision,p.bill_id).first<Data>();
  insist(bill&&['approved','exported'].includes(bill.status)&&bill.revision===bill.bill_revision,'The invoice changed or is no longer collectible under this consent',409);
  const consent=await stmt(db,'SELECT * FROM s_payment_plan_consents WHERE plan_id=? AND revision=?',p.id,p.revision).first<Data>();
  insist(consent,'The client has not authorized this exact current schedule',409);
  insist(await stmt(db,`SELECT 1 WHERE ${portalAccess('?',['client','co_client','payer'])}`,consent.client_email,p.matter_id).first(),'The consenting client no longer has current invoice authority',409);
  const config=await planStripeConfig(env);insist(config.id===consent.config_id,'The processor arrangement changed after client consent',409);
  const pm=await stripeApi(env,'/payment_methods/'+encodeURIComponent(consent.payment_method_id));
  insist(pm.id===consent.payment_method_id&&pm.customer===consent.customer_id&&['card','us_bank_account'].includes(pm.type),'The current payment method no longer matches client consent',409);
  if(pm.type==='us_bank_account'){
   insist(consent.mandate_id,'This bank method lacks a verified mandate',409);
   const mandate=await stripeApi(env,'/mandates/'+encodeURIComponent(consent.mandate_id));insist(mandate.status==='active'&&mandate.payment_method===pm.id,'The bank mandate was revoked or is inactive',409);
  }
  const funds=await invoiceFunds(db,p.bill_id);insist(installment.cents<=funds.reservable_cents,'The approved installment exceeds the current unpaid unreserved invoice balance',409);
  const attemptId=id(),at=now();
  await atomic(db,actor,[accessGuard(db,actor,p.matter_id),planCurrent(db,p),guard(db,`EXISTS(SELECT 1 FROM s_payment_plan_consents c WHERE c.id=? AND c.plan_id=? AND c.revision=? AND ${portalAccess('?',['client','co_client','payer'])})`,consent.id,p.id,p.revision,consent.client_email,p.matter_id),
   guard(db,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')",p.approved_operator_id,p.approved_by),
   guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status IN('approved','exported'))",p.bill_id,bill.revision),
   guard(db,"?=(SELECT id FROM s_stripe_config WHERE kind='operating' ORDER BY approved_at DESC,id DESC LIMIT 1)",config.id),
   invoiceAvailableGuard(db,p.bill_id,funds.reservable_cents),guard(db,"NOT EXISTS(SELECT 1 FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating' AND status IN('creating','open','pending','uncertain'))",p.bill_id),
   stmt(db,"INSERT INTO s_stripe_checkouts VALUES(?,?,?,?,'usd','creating','operating',NULL,?,NULL,NULL,?,?,?)",attemptId,'plan-installment:'+installment.id,p.bill_id,installment.cents,config.id,consent.client_email,at,at),
   stmt(db,'INSERT INTO s_payment_plan_attempts VALUES(?,?,?,?)',attemptId,installment.id,consent.id,at),planEvent(db,p,'installment_dispatched',JSON.stringify({checkoutId:attemptId,installmentId:installment.id,cents:installment.cents,consentId:consent.id}),'payment-plan-scheduler'),audit(db,actor,'payment_plan.installment_dispatched',p.id,JSON.stringify({checkoutId:attemptId,cents:installment.cents}),{matterId:p.matter_id})]);
  // The transaction above is the dispatch decision. No retry can claim this installment.
  checkoutId=attemptId;
  const params=new URLSearchParams({amount:String(installment.cents),currency:'usd',customer:consent.customer_id,payment_method:consent.payment_method_id,confirm:'true',off_session:'true','metadata[satchel_checkout]':attemptId,'metadata[satchel_plan]':p.id,...(consent.mandate_id?{mandate:consent.mandate_id}:{})});
  const intent=await stripeApi(env,'/payment_intents',params,'satchel-plan-installment-'+installment.id);
  insist(intent.id&&intent.amount===installment.cents&&intent.currency==='usd'&&intent.metadata?.satchel_checkout===attemptId&&intent.livemode===false,'Stripe collection response does not match this exact installment',502);
  await stmt(db,'UPDATE s_stripe_checkouts SET payment_intent_id=?,updated_at=? WHERE id=?',intent.id,now(),attemptId).run();
  const attempt=await stmt(db,'SELECT * FROM s_stripe_checkouts WHERE id=?',attemptId).first<Data>();
  await reconcileStripe(env,attempt!,'plan-response:'+intent.id+':'+intent.status,'payment_plan.provider_response');
  await syncPaymentPlanAttempt(env,attemptId);
 }catch(error){
  if(checkoutId){await stmt(db,"UPDATE s_stripe_checkouts SET status='uncertain',updated_at=? WHERE id=? AND status IN('creating','open','pending')",now(),checkoutId).run();}
  else{
   // A simultaneous scheduler may have claimed the installment. Its dispatch remains authoritative.
   if(await stmt(db,'SELECT 1 FROM s_payment_plan_attempts WHERE installment_id=?',installment.id).first())return;
  }
  const current=await stmt(db,'SELECT p.*,b.matter_id FROM s_payment_plans p JOIN s_bills b ON b.id=p.bill_id WHERE p.id=?',p.id).first<Data>();
  if(current&&current.revision===p.revision&&current.status==='active')await stopPlan(env,current,checkoutId?'Provider acknowledgment needs human reconciliation':String(error instanceof Error?error.message:error),'payment-plan-scheduler');
 }
}
export async function runPaymentPlans(env:StripeEnv,at:number){
 const timezone=(await stmt(env.DB,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const plans=await rows(env.DB,"SELECT p.*,b.matter_id FROM s_payment_plans p JOIN s_bills b ON b.id=p.bill_id WHERE p.status='active' ORDER BY p.created_at,p.id");
 for(const p of plans)await runPlan(env,p,day);
}
