import {readSettlement,settlementWrites} from './stripe-settlements';
import {bankMatches} from './stripe-bank';
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {paymentInvoice} from './invoice-payment';
import {reconcileStripe} from './stripe-events';
import {stripeApi,type StripeEnv} from './stripe-api';

export async function operatingAttempt(env:StripeEnv,actor:Actor,attemptId:string){
 const attempt=await stmt(env.DB,'SELECT * FROM s_stripe_checkouts WHERE id=?',attemptId).first<Data>();insist(attempt,'Collection not found',404);
 const bill=await paymentInvoice(env.DB,actor,attempt.bill_id);human(actor);need(actor,'owner');
 insist(attempt.purpose==='operating','Trust reconciliation requires its protected bank workflow',409);
 const config=await stmt(env.DB,'SELECT * FROM s_stripe_config WHERE id=?',attempt.config_id).first<Data>();
 insist(config?.kind==='operating'&&config.mode===(env.STRIPE_MODE==='live'?'live':'test'),'Operating processor configuration does not match',409);
 const account=await stripeApi(env,'/account');insist(account.id===config.account_id,'Operating processor account changed',409);
 return {attempt,bill,config};
}
export async function reconcileCollection(env:StripeEnv,actor:Actor,attemptId:string){
 const {attempt,bill}=await operatingAttempt(env,actor,attemptId);
 if(!attempt.session_id&&!attempt.payment_intent_id){
  let after='',found:Data|undefined;
  do{const list=await stripeApi(env,'/checkout/sessions?limit=100'+(after?'&starting_after='+encodeURIComponent(after):''));insist(Array.isArray(list.data),'Invalid checkout readback',502);
   for(const session of list.data)if(session.client_reference_id===attempt.id){insist(!found,'Multiple provider sessions need finance investigation',409);found=session;}
   if(!list.has_more)break;insist(list.data.length,'Incomplete checkout readback',502);after=list.data.at(-1).id;
  }while(true);
  insist(found,'No provider session found; collection remains uncertain and reserved',409);
  insist(found.metadata?.satchel_checkout===attempt.id&&found.amount_total===attempt.cents&&found.currency===attempt.currency&&found.livemode===(env.STRIPE_MODE==='live'),'Recovered checkout allocation mismatch',409);
  await atomic(env.DB,actor,[accessGuard(env.DB,actor,bill.matter_id),guard(env.DB,'EXISTS(SELECT 1 FROM s_stripe_checkouts WHERE id=? AND session_id IS NULL)',attempt.id),stmt(env.DB,'UPDATE s_stripe_checkouts SET session_id=? WHERE id=?',found.id,attempt.id),audit(env.DB,actor,'stripe.acknowledgment_recovered',attempt.id,JSON.stringify({sessionId:found.id}),{matterId:bill.matter_id})]);attempt.session_id=found.id;
 }
 await reconcileStripe(env,attempt,'readback:'+id(),'finance.readback');return reconciliationState(env,actor,bill.id);
}
export async function reconciliationState(env:StripeEnv,actor:Actor,billId:string){
 human(actor);need(actor,'owner');const bill=await paymentInvoice(env.DB,actor,billId);
 insist(bill,'Invoice not found',404);return stateForBill(env,actor,bill);
}
export async function settlementAccess(env:StripeEnv,actor:Actor,transactions:Data[]){
 const bills=await rows(env.DB,'SELECT DISTINCT c.bill_id,b.matter_id FROM s_stripe_checkouts c JOIN s_bills b ON b.id=c.bill_id WHERE c.payment_intent_id IN(SELECT value FROM json_each(?))',JSON.stringify(transactions.map(t=>t.paymentIntentId).filter(Boolean)));
 for(const b of bills)await paymentInvoice(env.DB,actor,b.bill_id);
 return bills.map(b=>accessGuard(env.DB,actor,b.matter_id));
}
async function stateForBill(env:StripeEnv,actor:Actor,bill:Data){
 const attempts=await rows(env.DB,"SELECT * FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating' ORDER BY created_at,id",bill.id);
 const settlements:Data[]=(await rows(env.DB,'SELECT * FROM s_stripe_settlement_observations ORDER BY sequence')).map(r=>({...r,snapshot:JSON.parse(r.snapshot)})).filter(r=>r.snapshot.transactions.some((t:Data)=>attempts.some(a=>a.payment_intent_id&&t.paymentIntentId===a.payment_intent_id)));
 for(const settlement of settlements)await settlementAccess(env,actor,settlement.snapshot.transactions);
 const history=await bankMatches(env),matched=history.filter(m=>!m.reversal),latest=[...new Map(settlements.map(r=>[r.payout_id,r])).values()];
 const bankConfirmed=(r:Data)=>r.snapshot.status==='paid'&&r.snapshot.reconciliationStatus==='completed'&&r.snapshot.transactions.every((t:Data)=>t.status==='available')&&r.snapshot.netCents===r.snapshot.amountCents&&matched.some(m=>m.payout_id===r.payout_id&&m.cents===r.snapshot.netCents);
 const ownPayouts=new Set(settlements.map(s=>s.payout_id));
 const bankHistory=history.filter(m=>ownPayouts.has(m.payout_id));
 const processorPostings=await rows(env.DB,'SELECT * FROM s_stripe_processor_postings WHERE payout_id IN(SELECT value FROM json_each(?)) ORDER BY id',JSON.stringify([...ownPayouts]));
 return {bankHistory,processorPostings,billId:bill.id,revision:bill.revision,principal:actor.role==='owner',canRefund:env.STRIPE_MODE!=='live',attempts:await Promise.all(attempts.map(async a=>({...a,events:await rows(env.DB,'SELECT * FROM s_stripe_events WHERE checkout_id=? ORDER BY at,id',a.id),adjustments:await rows(env.DB,'SELECT * FROM s_stripe_adjustments WHERE checkout_id=? ORDER BY at,id',a.id),receipt:await stmt(env.DB,'SELECT * FROM s_stripe_receipts WHERE checkout_id=?',a.id).first(),refunds:await rows(env.DB,'SELECT r.*,o.provider_id,o.status outcome FROM s_stripe_refund_requests r LEFT JOIN s_stripe_refund_outcomes o ON o.request_id=r.id WHERE r.checkout_id=? ORDER BY r.at,r.id',a.id)}))),settlements:settlements.map(r=>({...r,bank:matched.find(m=>m.payout_id===r.payout_id)??null,bankHistory:[]})),bankStatus:latest.length&&latest.every(bankConfirmed)?'matched':'unconfirmed'};
}
export async function inspectSettlement(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 const {bill,config}=await operatingAttempt(env,actor,attemptId),payoutId=text(b.payoutId,'Stripe payout ID',100);
 const snapshot=await readSettlement(env,config,payoutId),transactions=snapshot.transactions;
 const own=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating'",bill.id);insist(transactions.some(t=>own.some(a=>a.payment_intent_id&&a.payment_intent_id===t.paymentIntentId)),'This payout contains no verified collection for this invoice',409);
 const batchGuards=await settlementAccess(env,actor,transactions),observationId=id();
 await atomic(env.DB,actor,[...batchGuards,accessGuard(env.DB,actor,bill.matter_id),...settlementWrites(env,config,snapshot,observationId),audit(env.DB,actor,'stripe.settlement_observed',observationId,JSON.stringify(snapshot),{matterId:bill.matter_id})]);
 return reconciliationState(env,actor,bill.id);
}
export {matchSettlement,reverseBankMatch} from './stripe-bank';
