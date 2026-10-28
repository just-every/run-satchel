import {audit,id,insist,now,rows,stmt,type Data} from './model';
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
  guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_processor_postings p JOIN s_stripe_config c ON c.id=p.config_id WHERE p.id=? AND (c.account_id<>? OR c.mode<>? OR p.payout_id<>? OR p.gross_cents<>? OR p.fee_cents<>? OR p.net_cents<>?))',t.id,config.account_id,config.mode,snapshot.payoutId,t.grossCents,t.feeCents,t.netCents),
  stmt(env.DB,'INSERT INTO s_stripe_processor_postings SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM s_stripe_processor_postings WHERE id=?)',t.id,config.id,snapshot.payoutId,t.paymentIntentId,t.grossCents,t.feeCents,t.netCents,t.type,at,t.id)
 ])];
}
export async function ingestPayout(env:StripeEnv,event:Data){
 if(await stmt(env.DB,'SELECT 1 FROM s_stripe_payout_events WHERE id=?',event.id).first())return {received:true};
 const account=await stripeApi(env,'/account'),configs=await rows(env.DB,"SELECT * FROM s_stripe_config WHERE kind='operating' AND account_id=? AND mode=? ORDER BY approved_at DESC,id DESC",account.id,env.STRIPE_MODE==='live'?'live':'test');
 if(!configs.length)return {received:true};
 const snapshot=await readSettlement(env,configs[0],event.data.object.id),observationId=id();
 const intents=await rows(env.DB,"SELECT c.payment_intent_id,c.config_id,c.bill_id,b.matter_id,b.revision FROM s_stripe_checkouts c JOIN s_bills b ON b.id=c.bill_id WHERE c.config_id IN(SELECT value FROM json_each(?)) AND c.purpose='operating'",JSON.stringify(configs.map(c=>c.id)));
 const included=intents.filter(a=>a.payment_intent_id&&snapshot.transactions.some(t=>t.paymentIntentId===a.payment_intent_id));
 if(!included.length)return {received:true};
 const config=configs.find(c=>c.id===included[0].config_id)!;
 const provider={id:'stripe',email:['processor','stripe.invalid'].join('@'),role:'provider',channel:'provider'};
 const trail=included.map(a=>audit(env.DB,provider,'stripe.payout_observed',a.bill_id,JSON.stringify({observationId,matterId:a.matter_id,eventId:event.id,payoutId:snapshot.payoutId,status:snapshot.status,transactions:snapshot.transactions.filter(t=>t.paymentIntentId===a.payment_intent_id)}),{matterId:a.matter_id,billId:a.bill_id,reviewedRevision:a.revision}));
 try{await env.DB.batch([guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_stripe_payout_events WHERE id=?)',event.id),...settlementWrites(env,config,snapshot,observationId),stmt(env.DB,'INSERT INTO s_stripe_payout_events VALUES(?,?,?)',event.id,observationId,now()),...trail]);}
 catch(error){if(!await stmt(env.DB,'SELECT 1 FROM s_stripe_payout_events WHERE id=?',event.id).first())throw error;}
 return {received:true};
}
