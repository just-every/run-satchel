import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {harness} from './harness.mjs';

// Resume the real paid invoice through native restore; never collect again to
// wait for a daily provider batch. The archive contains no provider credential.
const key=process.env.STRIPE_US_TEST_SECRET_KEY;
assert.ok(/^(sk|rk)_test_/.test(key??''),'Inject the held Stripe test credential');
assert.ok(process.env.SATCHEL_RECONCILIATION_ARCHIVE,'Name the retained native sandbox archive');
async function stripe(path){
 const r=await fetch('https://api.stripe.com/v1'+path,{headers:{authorization:'Bearer '+key,'stripe-version':'2025-02-24.acacia'},signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'Authenticated Stripe readback must succeed');return r.json();
}
async function list(path){
 const objects=[];let after='';
 do{const result=await stripe(path+(path.includes('?')?'&':'?')+'limit=100'+(after?'&starting_after='+encodeURIComponent(after):''));assert.ok(Array.isArray(result.data));objects.push(...result.data);if(!result.has_more)return objects;assert.ok(result.data.length);after=result.data.at(-1).id;}while(true);
}
async function transport(request){
 assert.equal(request.method,'GET','Payout proof never creates another provider financial effect');
 const r=await fetch(request.url,{headers:Object.fromEntries(request.headers),redirect:'manual',signal:AbortSignal.timeout(30000)}),headers=new Headers(r.headers);
 headers.delete('content-encoding');headers.delete('content-length');return new Response(await r.arrayBuffer(),{status:r.status,headers});
}
const h=await harness({bindings:{STRIPE_SECRET_KEY:key,STRIPE_MODE:'test'},stripeResponse:transport});
try{
 const archive=await readFile(process.env.SATCHEL_RECONCILIATION_ARCHIVE,'utf8');assert.ok(!archive.includes(key));
 await h.json('/restore',{archive,confirm:'RESTORE'},h.owner);
 const matters=(await h.json('/state',undefined,h.owner)).matters;
 const matter=matters.find(m=>m.title==='Barton operating invoice');assert.ok(matter);
 const bill=(await h.json('/matters/'+matter.id+'/billing',undefined,h.owner)).bills.find(b=>b.snapshot.title==='Card operating services');assert.ok(bill);
 let state=await h.json('/bills/'+bill.id+'/reconciliation',undefined,h.owner);
 assert.equal(state.attempts.length,1);const attempt=state.attempts[0];
 assert.equal(attempt.receipt.cents,37500);assert.equal(attempt.refunds.length,1);
 const charge=await stripe('/charges/'+encodeURIComponent(attempt.receipt.charge_id)+'?expand[]=balance_transaction');
 assert.equal(charge.livemode,false);assert.equal(charge.amount,37500);assert.equal(charge.amount_refunded,5000);assert.equal(charge.payment_intent,attempt.payment_intent_id);
 const refund=await stripe('/refunds/'+encodeURIComponent(attempt.refunds[0].provider_id)+'?expand[]=balance_transaction');
 assert.equal(refund.status,'succeeded');assert.equal(refund.amount,5000);assert.equal(refund.charge,charge.id);
 const expected=[charge.balance_transaction,refund.balance_transaction];assert.ok(expected.every(t=>t&&typeof t==='object'));
 const since=Math.max(0,Math.floor(Date.parse(attempt.created_at)/1000)-60),observed=new Set();let verifiedEvents=0;
 const events=[...await list('/events?type=payout.reconciliation_completed&created[gte]='+since),...await list('/events?type=payout.paid&created[gte]='+since)];
 for(const payout of await list('/payouts?created[gte]='+since)){
  assert.equal(payout.livemode,false);
  if(!payout.automatic||payout.status!=='paid'||payout.reconciliation_status!=='completed'||payout.currency!=='usd')continue;
  const transactions=await list('/balance_transactions?payout='+encodeURIComponent(payout.id)+'&expand[]=data.source');
  const own=transactions.filter(t=>expected.some(e=>e.id===t.id));if(!own.length)continue;
  const event=events.find(e=>e.data.object.id===payout.id);assert.ok(event,'The payout needs an authentic provider event');
  for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:event.id})})).status,200);
  state=await h.json('/bills/'+bill.id+'/reconciliation',undefined,h.owner);
  const observation=state.settlements.filter(s=>s.payout_id===payout.id).at(-1);assert.ok(observation);
  assert.equal(observation.snapshot.netCents,payout.amount);
  for(const t of own){
   const original=expected.find(e=>e.id===t.id),posting=state.processorPostings.find(p=>p.id===t.id);assert.ok(posting);
   assert.equal(t.status,'available');assert.equal(t.amount,original.amount);assert.equal(t.fee,original.fee);assert.equal(t.net,original.net);
   assert.equal(posting.payment_intent_id,attempt.payment_intent_id);assert.equal(posting.gross_cents,t.amount);assert.equal(posting.fee_cents,t.fee);assert.equal(posting.net_cents,t.net);observed.add(t.id);
  }
  verifiedEvents++;
 }
 assert.equal(state.bankStatus,'unconfirmed');assert.equal(state.bankHistory.length,0);
 const payment=await h.json('/portal/invoices/'+bill.id+'/payment',undefined,h.owner);
 assert.equal(payment.paidCents,32500);assert.equal(payment.dueCents,5000);
 console.log(JSON.stringify({testMode:true,restoredNativeInvoice:true,readOnlyProvider:true,verifiedEvents,memberTransactions:observed.size,expectedTransactions:2,chargeSettlementStatus:charge.balance_transaction.status,chargeAvailableAt:new Date(charge.balance_transaction.available_on*1000).toISOString(),bankSettlementUnconfirmed:true,journeyPassed:observed.size===2,providerBatchPending:observed.size!==2}));
 if(observed.size!==2)process.exitCode=2;
}finally{await h.close();}
