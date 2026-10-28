import {id,insist,now,rows,stmt,type Data} from './model';
import {stripeApi,type StripeEnv} from './stripe-api';
import {guard} from './trust-guards';

export async function readSettlement(env:StripeEnv,config:Data,payoutId:string){
 const payout=await stripeApi(env,'/payouts/'+encodeURIComponent(payoutId));
 insist(payout.id===payoutId&&payout.currency==='usd'&&Number.isSafeInteger(payout.amount)&&payout.livemode===(config.mode==='live'),'Settlement currency or environment mismatch',409);
 const transactions:Data[]=[];let after='';
 do{
  const list=await stripeApi(env,'/balance_transactions?payout='+encodeURIComponent(payoutId)+'&limit=100&expand[]=data.source'+(after?'&starting_after='+encodeURIComponent(after):''));
  insist(Array.isArray(list.data),'Invalid settlement readback',502);
  for(const t of list.data){
   insist(t.currency==='usd'&&Number.isSafeInteger(t.amount)&&Number.isSafeInteger(t.fee)&&t.net===t.amount-t.fee,'Settlement totals do not reconcile',409);
   let source=t.source;
   if(typeof source==='string'&&source.startsWith('ch_'))source=await stripeApi(env,'/charges/'+encodeURIComponent(source));
   transactions.push({id:t.id,sourceId:typeof source==='string'?source:source?.id,paymentIntentId:typeof source==='object'?(typeof source?.payment_intent==='string'?source.payment_intent:source?.payment_intent?.id):null,grossCents:t.amount,feeCents:t.fee,netCents:t.net,type:t.type,status:t.status});
  }
  if(!list.has_more)break;insist(list.data.length,'Incomplete settlement readback',502);after=list.data.at(-1).id;
 }while(true);
 return {payoutId,status:payout.status,reconciliationStatus:payout.reconciliation_status??'unknown',destination:typeof payout.destination==='string'?payout.destination:payout.destination?.id??null,amountCents:payout.amount,arrivalDate:payout.arrival_date,transactions,grossCents:transactions.reduce((n,t)=>n+t.grossCents,0),feeCents:transactions.reduce((n,t)=>n+t.feeCents,0),netCents:transactions.reduce((n,t)=>n+t.netCents,0)};
}
export function settlementWrites(env:StripeEnv,config:Data,snapshot:Data,observationId:string){
 const at=now();return [stmt(env.DB,'INSERT INTO s_stripe_settlement_observations SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM s_stripe_settlement_observations',observationId,snapshot.payoutId,config.id,JSON.stringify(snapshot),at),
 ...snapshot.transactions.flatMap((t:Data)=>[
  guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_processor_postings WHERE id=? AND (config_id<>? OR gross_cents<>? OR fee_cents<>? OR net_cents<>?))',t.id,config.id,t.grossCents,t.feeCents,t.netCents),
  stmt(env.DB,'INSERT INTO s_stripe_processor_postings SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM s_stripe_processor_postings WHERE id=?)',t.id,config.id,snapshot.payoutId,t.paymentIntentId,t.grossCents,t.feeCents,t.netCents,t.type,at,t.id)
 ])];
}
export async function ingestPayout(env:StripeEnv,event:Data){
 if(await stmt(env.DB,'SELECT 1 FROM s_stripe_payout_events WHERE id=?',event.id).first())return {received:true};
 const account=await stripeApi(env,'/account'),config=await stmt(env.DB,"SELECT * FROM s_stripe_config WHERE kind='operating' AND account_id=? AND mode=? ORDER BY approved_at DESC,id DESC LIMIT 1",account.id,env.STRIPE_MODE==='live'?'live':'test').first<Data>();
 if(!config)return {received:true};
 const snapshot=await readSettlement(env,config,event.data.object.id),observationId=id();
 const intents=await rows(env.DB,"SELECT payment_intent_id FROM s_stripe_checkouts WHERE config_id=? AND purpose='operating'",config.id);
 if(!snapshot.transactions.some(t=>intents.some(a=>a.payment_intent_id&&a.payment_intent_id===t.paymentIntentId)))return {received:true};
 try{await env.DB.batch([guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_payout_events WHERE id=?)',event.id),...settlementWrites(env,config,snapshot,observationId),stmt(env.DB,'INSERT INTO s_stripe_payout_events VALUES(?,?,?)',event.id,observationId,now())]);}
 catch(error){if(!await stmt(env.DB,'SELECT 1 FROM s_stripe_payout_events WHERE id=?',event.id).first())throw error;}
 return {received:true};
}
