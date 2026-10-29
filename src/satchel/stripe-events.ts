import {ingestPayout} from './stripe-settlements';
import {syncPaymentPlanAttempt} from './payment-plan-records';
import {verifyProtectedStripe} from './stripe-config';
import {audit,id,insist,now,rows,stmt,text,type Data} from './model';
import {guard} from './trust-guards';
import {stripeApi,type StripeEnv} from './stripe-api';
// Incoming bodies carry only an event identity. Money facts come from authenticated
// Stripe readback, so forged bodies, browser redirects and stale event order confer no authority.
export async function stripeEvent(env:StripeEnv,request:Request){
 const raw=await request.text();insist(raw.length<=100000,'Provider event too large',413);
 const input=JSON.parse(raw),eventId=text(input.id,'Stripe event ID',100);
 const connected=input.account?await stmt(env.DB,"SELECT account_id FROM s_stripe_config WHERE kind='trust' AND account_id=?",text(input.account,'Connected processor account',100)).first<Data>():null;
 insist(!input.account||connected,'Unknown connected processor account',400);
 const event=await stripeApi(env,'/events/'+encodeURIComponent(eventId),undefined,undefined,connected?.account_id);insist(event.id===eventId&&event.livemode===(env.STRIPE_MODE==='live'),'Only verified Stripe events in the configured environment are accepted',400);
 const object=event.data?.object;insist(object,'Invalid provider event',400);
 if(object.object==='payout'&&!input.account)return ingestPayout(env,event);
 let attempt:Data|null=null;
 if(object.object==='checkout.session')attempt=await stmt(env.DB,'SELECT * FROM s_stripe_checkouts WHERE session_id=?',object.id).first<Data>();
 else{
  let intent=object.object==='payment_intent'?object.id:object.payment_intent;
  if(!intent&&object.charge){const charge=await stripeApi(env,'/charges/'+encodeURIComponent(typeof object.charge==='string'?object.charge:object.charge.id),undefined,undefined,connected?.account_id);intent=charge.payment_intent;}
  if(intent)attempt=await stmt(env.DB,'SELECT * FROM s_stripe_checkouts WHERE payment_intent_id=?',typeof intent==='string'?intent:intent.id).first<Data>();
  if(!attempt&&object.metadata?.satchel_checkout)attempt=await stmt(env.DB,'SELECT * FROM s_stripe_checkouts WHERE id=?',object.metadata.satchel_checkout).first<Data>();
 }
 if(!attempt)return {received:true};
 if(!attempt.session_id&&!attempt.payment_intent_id&&object.object==='payment_intent'&&object.metadata?.satchel_checkout===attempt.id)attempt={...attempt,payment_intent_id:object.id};
 if(await stmt(env.DB,'SELECT 1 FROM s_stripe_events WHERE id=?',eventId).first())return {received:true};
 return reconcileStripe(env,attempt,eventId,event.type);
}
export async function reconcileStripe(env:StripeEnv,attempt:Data,eventId:string,eventType:string){
 insist(attempt.session_id||attempt.payment_intent_id,'Reconcile the uncertain provider acknowledgment first',409);
 const config=await stmt(env.DB,'SELECT * FROM s_stripe_config WHERE id=?',attempt.config_id).first<Data>();
 if(config?.kind==='trust')await verifyProtectedStripe(env,config);
 const processorAccount=config?.kind==='trust'?config.account_id:undefined;
 const session=attempt.session_id?await stripeApi(env,'/checkout/sessions/'+encodeURIComponent(attempt.session_id)+'?expand[]=payment_intent.latest_charge',undefined,undefined,processorAccount):null;
 const pi=session?(session.payment_intent&&typeof session.payment_intent==='object'?session.payment_intent:null):await stripeApi(env,'/payment_intents/'+encodeURIComponent(attempt.payment_intent_id)+'?expand[]=latest_charge',undefined,undefined,processorAccount);
 const account=await stripeApi(env,'/account',undefined,undefined,processorAccount);
 insist(config&&account.id===config.account_id,'Stripe reconciliation does not match the approved account',409);
 if(session)insist(session.livemode===(config.mode==='live')&&session.id===attempt.session_id&&session.client_reference_id===attempt.id&&session.metadata?.satchel_checkout===attempt.id&&session.amount_total===attempt.cents&&session.currency===attempt.currency,'Stripe reconciliation does not match the exact invoice allocation',409);
 else insist(pi?.id===attempt.payment_intent_id,'Stripe intent identity mismatch',409);
 const charge=pi?.latest_charge&&typeof pi.latest_charge==='object'?pi.latest_charge:null;
 if(pi)insist(pi.metadata?.satchel_checkout===attempt.id&&pi.amount===attempt.cents&&pi.currency===attempt.currency&&pi.livemode===(config.mode==='live'),'Stripe intent allocation mismatch',409);
 let status=session?.status==='expired'?'expired':pi?.status==='processing'?'pending':pi?.status==='succeeded'&&(!session||session.payment_status==='paid')?'paid':pi?.last_payment_error&&(!session||session.status==='complete')?'failed':session?.status==='complete'?'pending':'open';
 const adjustments=await rows(env.DB,'SELECT * FROM s_stripe_adjustments WHERE checkout_id=?',attempt.id),priorReturned=adjustments.reduce((n,r)=>n+r.cents,0);
 const returned=charge?.disputed||(charge?.status==='failed'&&['paid','returned'].includes(attempt.status))?attempt.cents:Math.min(attempt.cents,Number(charge?.amount_refunded??0));
 const delta=Math.max(0,returned-priorReturned),wasPaid=attempt.status==='paid'||attempt.status==='returned';
 if(returned>0||priorReturned>0)status=returned>=attempt.cents||priorReturned>=attempt.cents?'returned':'paid';
 // A delayed processing event can never resurrect paid or returned principal.
 if(wasPaid&&['open','pending','failed','expired'].includes(status))status=attempt.status;
 const at=now(),writes:D1PreparedStatement[]=[guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_events WHERE id=?)',eventId),guard(env.DB,'EXISTS(SELECT 1 FROM s_stripe_checkouts WHERE id=? AND status=? AND updated_at=?)',attempt.id,attempt.status,attempt.updated_at)];
 if(status==='paid'&&!wasPaid)writes.push(guard(env.DB,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND status<>'void')",attempt.bill_id));
 if(delta>0)writes.push(stmt(env.DB,'INSERT INTO s_stripe_adjustments VALUES(?,?,?,?,?,?)',id(),attempt.id,String(charge.id)+':'+returned,delta,charge.disputed?'dispute':charge.status==='failed'?'return':'refund',at));
 if(attempt.purpose==='operating'&&pi?.status==='succeeded'&&charge?.id){writes.push(stmt(env.DB,'INSERT INTO s_stripe_receipts SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM s_stripe_receipts WHERE checkout_id=?)',attempt.id,charge.id,attempt.cents,at,attempt.id));}
 if(attempt.purpose==='trust'&&status==='paid'&&!wasPaid){
  const day=at.slice(0,10);writes.push(guard(env.DB,'EXISTS(SELECT 1 FROM s_trust_ledgers WHERE id=? AND account_id=?)',attempt.ledger_id,config.bank_account_id),stmt(env.DB,"INSERT INTO s_trust_entries VALUES(?,?,?,'ach',?,?,?,?,?,?)",id(),config.bank_account_id,attempt.ledger_id,attempt.cents,day,day,'stripe:'+attempt.id,attempt.created_by,at));
 }
 // Protected trust returns require an officer's append-only reviewed bank correction;
 // no provider event can silently debit protected client principal.
 writes.push(stmt(env.DB,'UPDATE s_stripe_checkouts SET status=?,payment_intent_id=COALESCE(?,payment_intent_id),updated_at=? WHERE id=?',status,pi?.id??null,at,attempt.id),stmt(env.DB,'INSERT INTO s_stripe_events VALUES(?,?,?,?,?,?)',eventId,attempt.id,eventType,status,attempt.cents,at),audit(env.DB,{id:'stripe',email:'processor@stripe.invalid',role:'provider',channel:'provider'},'stripe.reconciled',attempt.id,JSON.stringify({eventId,type:eventType,status,billId:attempt.bill_id,cents:attempt.cents,returnedCents:Math.max(returned,priorReturned),purpose:attempt.purpose}),{matterId:(await stmt(env.DB,'SELECT matter_id FROM s_bills WHERE id=?',attempt.bill_id).first<Data>())?.matter_id}));
 try{await env.DB.batch(writes);}catch(error){if(await stmt(env.DB,'SELECT 1 FROM s_stripe_events WHERE id=?',eventId).first())return {received:true};throw error;}
 await syncPaymentPlanAttempt(env,attempt.id);
 return {received:true};
}
