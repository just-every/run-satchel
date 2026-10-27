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
async function stateForBill(env:StripeEnv,actor:Actor,bill:Data){
 const attempts=await rows(env.DB,"SELECT * FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating' ORDER BY created_at,id",bill.id);
 const settlements:Data[]=(await rows(env.DB,'SELECT * FROM s_stripe_settlement_observations ORDER BY sequence')).map(r=>({...r,snapshot:JSON.parse(r.snapshot)})).filter(r=>r.snapshot.transactions.some((t:Data)=>attempts.some(a=>a.payment_intent_id&&t.paymentIntentId===a.payment_intent_id)));
 for(const settlement of settlements)for(const t of settlement.snapshot.transactions){const linked=await rows(env.DB,'SELECT bill_id FROM s_stripe_checkouts WHERE payment_intent_id=?',t.paymentIntentId??null);for(const a of linked)await paymentInvoice(env.DB,actor,a.bill_id);}
 const matched=await rows(env.DB,'SELECT * FROM s_stripe_bank_matches'),latest=[...new Map(settlements.map(r=>[r.payout_id,r])).values()];
 const bankConfirmed=(r:Data)=>r.snapshot.status==='paid'&&r.snapshot.reconciliationStatus==='completed'&&r.snapshot.transactions.every((t:Data)=>t.status==='available')&&r.snapshot.netCents===r.snapshot.amountCents&&matched.some(m=>m.payout_id===r.payout_id&&m.cents===r.snapshot.netCents);
 return {billId:bill.id,revision:bill.revision,principal:actor.role==='owner',canRefund:env.STRIPE_MODE!=='live',attempts:await Promise.all(attempts.map(async a=>({...a,events:await rows(env.DB,'SELECT * FROM s_stripe_events WHERE checkout_id=? ORDER BY at,id',a.id),adjustments:await rows(env.DB,'SELECT * FROM s_stripe_adjustments WHERE checkout_id=? ORDER BY at,id',a.id),refunds:await rows(env.DB,'SELECT r.*,o.provider_id,o.status outcome FROM s_stripe_refund_requests r LEFT JOIN s_stripe_refund_outcomes o ON o.request_id=r.id WHERE r.checkout_id=? ORDER BY r.at,r.id',a.id)}))),settlements:settlements.map(r=>({...r,bank:matched.find(m=>m.payout_id===r.payout_id)??null})),bankStatus:latest.length&&latest.every(bankConfirmed)?'matched':'unconfirmed'};
}
export async function inspectSettlement(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 const {bill,config}=await operatingAttempt(env,actor,attemptId),payoutId=text(b.payoutId,'Stripe payout ID',100);
 const payout=await stripeApi(env,'/payouts/'+encodeURIComponent(payoutId));insist(payout.id===payoutId&&payout.currency==='usd'&&payout.livemode===(config.mode==='live'),'Settlement currency or environment mismatch',409);
 const transactions:Data[]=[];let after='';
 do{const list=await stripeApi(env,'/balance_transactions?payout='+encodeURIComponent(payoutId)+'&limit=100&expand[]=data.source'+(after?'&starting_after='+encodeURIComponent(after):''));insist(Array.isArray(list.data),'Invalid settlement readback',502);
  for(const t of list.data){insist(t.currency==='usd'&&Number.isSafeInteger(t.amount)&&Number.isSafeInteger(t.fee)&&t.net===t.amount-t.fee,'Settlement totals do not reconcile',409);const source=t.source;transactions.push({id:t.id,sourceId:typeof source==='string'?source:source?.id,paymentIntentId:typeof source==='object'?(typeof source?.payment_intent==='string'?source.payment_intent:source?.payment_intent?.id):null,grossCents:t.amount,feeCents:t.fee,netCents:t.net,type:t.type,status:t.status});}
  if(!list.has_more)break;insist(list.data.length,'Incomplete settlement readback',502);after=list.data.at(-1).id;
 }while(true);
 const snapshot={payoutId,status:payout.status,reconciliationStatus:payout.reconciliation_status??'unknown',destination:typeof payout.destination==='string'?payout.destination:payout.destination?.id??null,amountCents:payout.amount,arrivalDate:payout.arrival_date,transactions,grossCents:transactions.reduce((n,t)=>n+t.grossCents,0),feeCents:transactions.reduce((n,t)=>n+t.feeCents,0),netCents:transactions.reduce((n,t)=>n+t.netCents,0)};
 const own=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating'",bill.id);insist(transactions.some(t=>own.some(a=>a.payment_intent_id&&a.payment_intent_id===t.paymentIntentId)),'This payout contains no verified collection for this invoice',409);
 const observationId=id();
 await atomic(env.DB,actor,[accessGuard(env.DB,actor,bill.matter_id),stmt(env.DB,'INSERT INTO s_stripe_settlement_observations SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM s_stripe_settlement_observations',observationId,payoutId,config.id,JSON.stringify(snapshot),now()),audit(env.DB,actor,'stripe.settlement_observed',observationId,JSON.stringify(snapshot),{matterId:bill.matter_id})]);
 return reconciliationState(env,actor,bill.id);
}
export async function matchSettlement(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 const {bill,config}=await operatingAttempt(env,actor,attemptId),observation=await stmt(env.DB,'SELECT * FROM s_stripe_settlement_observations WHERE id=? AND config_id=?',text(b.observationId,'Reviewed settlement',100),config.id).first<Data>();insist(observation,'Settlement not found',404);
 const s=JSON.parse(observation.snapshot),cents=integer(b.cents,'Bank deposit in USD cents',1),reference=text(b.bankReference,'Bank statement reference',200),reason=text(b.reason,'Finance match evidence',1000);
 insist(b.confirmed===true&&s.status==='paid'&&s.reconciliationStatus==='completed'&&s.netCents===s.amountCents&&s.amountCents===cents&&s.transactions.every((t:Data)=>t.status==='available'),'Only a fully reconciled paid payout can match an exact bank deposit',409);
 const current=await stripeApi(env,'/payouts/'+encodeURIComponent(s.payoutId));insist(current.status==='paid'&&current.amount===cents&&current.currency==='usd','Payout changed; inspect it again',409);
 const attempts=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE bill_id=? AND purpose='operating'",bill.id);insist(s.transactions.some((t:Data)=>attempts.some(a=>a.payment_intent_id===t.paymentIntentId)),'Settlement is not allocated to this invoice',409);
 const prior=await stmt(env.DB,'SELECT * FROM s_stripe_bank_matches WHERE payout_id=?',s.payoutId).first<Data>();if(prior){insist(prior.bank_reference===reference&&prior.cents===cents&&prior.reason===reason,'The bank match is immutable',409);return reconciliationState(env,actor,bill.id);}
 await atomic(env.DB,actor,[accessGuard(env.DB,actor,bill.matter_id),stmt(env.DB,'INSERT INTO s_stripe_bank_matches VALUES(?,?,?,?,?,?,?,?)',id(),s.payoutId,observation.id,reference,cents,reason,actor.email,now()),audit(env.DB,actor,'stripe.bank_matched',s.payoutId,JSON.stringify({reference,cents,reason,observationId:observation.id}),{matterId:bill.matter_id})]);return reconciliationState(env,actor,bill.id);
}
