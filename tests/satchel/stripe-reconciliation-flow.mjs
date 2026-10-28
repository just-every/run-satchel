import {designate} from './trust-fixture.mjs';
import {draft,reviewed} from './invoice-numbering-fixture.mjs';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {stripeEdge,paymentFixture} from './stripe-fixture.mjs';
export async function reconciliationFlow(){
 const edge=stripeEdge(),h=await harness(edge);let restored;
 try{
  await designate(h);const bankAccount=await h.json('/trust/accounts',{name:'Synthetic operating bank',kind:'operating',bankReference:'synthetic-satchel-bank'},h.owner);
  const s=await paymentFixture(h),base='/portal/invoices/'+s.card.id;
  edge.loseNextResponse();await h.json(base+'/checkout',{requestKey:'synthetic-satchel-lost'},s.client,502);
  let invoice=await h.json(base+'/payment',undefined,s.client);assert.equal(invoice.paidCents,0);assert.equal(invoice.status,'pending');
  await h.json(base+'/checkout',{requestKey:'synthetic-satchel-repeat'},s.client,409);assert.equal(edge.calls,1);
  const attempt=invoice.attempts[0],path='/stripe/collections/'+attempt.id;
  await h.json(path+'/reconcile',{},s.client,403);
  await h.json(path+'/reconcile',{},h.owner);assert.equal(edge.calls,1);
  const session=[...edge.sessions.values()][0],event=edge.event(session,'checkout.session.completed','paid');
  for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)})).status,200);
  let state=await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner);assert.equal(state.bankStatus,'unconfirmed');assert.equal(state.attempts[0].events.length,2);
  await h.json('/team',{email:'billing@example.test',name:'Billing staff',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');await h.json('/matters/'+s.m.id+'/access',{email:'billing@example.test'},h.owner);
  const refund={requestKey:'synthetic-satchel-approved-refund',revision:s.card.revision,cents:5000,reason:'Principal approves a partial refund for duplicate work',confirmed:true};
  await h.json(path+'/refund',refund,billing,403);await h.json(path+'/refund',{...refund,revision:'stale'},h.owner,409);
  await h.json(path+'/refund',refund,h.owner);await h.json(path+'/refund',refund,h.owner);assert.equal(edge.refunds.length,1);await h.json(path+'/refund',{...refund,cents:5001},h.owner,409);
  await h.json(path+'/reconcile',{},h.owner);invoice=await h.json(base+'/payment',undefined,s.client);assert.equal(invoice.paidCents,32500);assert.equal(invoice.dueCents,5000);
  const payout='synthetic-satchel-payout';edge.payouts.set(payout,{id:payout,livemode:false,status:'pending',reconciliation_status:'in_progress',currency:'usd',amount:31183,destination:'synthetic-satchel-bank',arrival_date:1793491200});
  edge.transactions.set(payout,[{id:'synthetic-satchel-balance-charge',currency:'usd',amount:37500,fee:1317,net:36183,type:'charge',status:'pending',source:{id:session.payment_intent.latest_charge.id,payment_intent:session.payment_intent.id}},{id:'synthetic-satchel-balance-refund',currency:'usd',amount:-5000,fee:0,net:-5000,type:'refund',status:'pending',source:{id:edge.refunds[0].id,payment_intent:session.payment_intent.id}}]);
  state=await h.json(path+'/settlement',{payoutId:payout},h.owner);assert.equal(state.settlements[0].snapshot.grossCents,32500);assert.equal(state.settlements[0].snapshot.feeCents,1317);assert.equal(state.settlements[0].snapshot.netCents,31183);assert.equal(state.bankStatus,'unconfirmed');
  const match={observationId:state.settlements[0].id,cents:31183,bankReference:'synthetic-satchel-statement-42',reason:'Principal matches exact statement deposit',confirmed:true,operatingAccountId:bankAccount.id,depositDate:'2026-11-01'};await h.json(path+'/bank-match',match,h.owner,409);
  edge.payouts.get(payout).status='paid';edge.payouts.get(payout).reconciliation_status='completed';for(const t of edge.transactions.get(payout))t.status='available';
  state=await h.json(path+'/settlement',{payoutId:payout},h.owner);match.observationId=state.settlements.find(x=>x.snapshot.status==='paid').id;
  await h.json(path+'/bank-match',match,billing,403);await h.json(path+'/bank-match',{...match,cents:31182},h.owner,409);
  await h.json(path+'/bank-match',match,h.owner);state=await h.json(path+'/bank-match',match,h.owner);assert.equal(state.bankStatus,'matched');assert.equal(state.settlements[0].bank.cents,31183);
  assert.equal(state.attempts[0].receipt.cents,37500);assert.equal(state.attempts[0].receipt.charge_id,session.payment_intent.latest_charge.id);
  let bank=(await h.json('/trust',undefined,h.owner));assert.equal(bank.accounts.find(a=>a.id===bankAccount.id).balance_cents,31183);assert.equal(bank.entries.filter(e=>e.kind==='stripe_payout').length,1);
  const payoutEvent={id:'synthetic-satchel-payout-event',livemode:false,type:'payout.paid',data:{object:{object:'payout',id:payout}}};edge.events.set(payoutEvent.id,payoutEvent);
  for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:payoutEvent.id})})).status,200);
  state=await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner);assert.equal(state.settlements.length,3,'One verified payout event appends one observation despite replay');assert.equal(state.processorPostings.length,2);assert.equal(state.processorPostings.reduce((n,t)=>n+t.net_cents,0),31183);
  const reversal={matchId:state.settlements.at(-1).bank.id,revision:s.card.revision,reason:'Finance corrects an incorrectly matched statement line',requestKey:'synthetic-satchel-bank-reversal',depositDate:'2026-11-02',confirmed:true};
  await h.json(path+'/bank-reversal',reversal,billing,403);await h.json(path+'/bank-reversal',{...reversal,revision:'stale'},h.owner,409);
  state=await h.json(path+'/bank-reversal',reversal,h.owner);assert.equal(state.bankStatus,'unconfirmed');await h.json(path+'/bank-reversal',reversal,h.owner);await h.json(path+'/bank-reversal',{...reversal,reason:'Changed decision'},h.owner,409);
  bank=await h.json('/trust',undefined,h.owner);assert.equal(bank.accounts.find(a=>a.id===bankAccount.id).balance_cents,0);assert.equal(bank.entries.filter(e=>e.kind==='stripe_payout_reversal').length,1);
  match.bankReference='synthetic-satchel-statement-corrected';match.depositDate='2026-11-02';state=await h.json(path+'/bank-match',match,h.owner);assert.equal(state.bankStatus,'matched');assert.equal(state.bankHistory.length,2);assert.ok(state.bankHistory.find(m=>m.id===reversal.matchId).reversal);
  edge.payouts.get(payout).status='failed';state=await h.json(path+'/settlement',{payoutId:payout},h.owner);assert.equal(state.bankStatus,'unconfirmed','A failed payout cannot inherit the historical bank match');edge.payouts.get(payout).status='paid';state=await h.json(path+'/settlement',{payoutId:payout},h.owner);assert.equal(state.bankStatus,'matched');
  const disputed=edge.event(session,'charge.dispute.created','paid',{disputed:true,amount_refunded:5000});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(disputed)});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(disputed)});
  invoice=await h.json(base+'/payment',undefined,s.client);assert.equal(invoice.paidCents,0);assert.equal(invoice.dueCents,37500);
  state=await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner);assert.deepEqual(state.attempts[0].adjustments.map(a=>[a.kind,a.cents]),[['refund',5000],['dispute',32500]]);
  await h.restart();assert.equal((await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner)).attempts[0].refunds[0].approved_by,'owner@example.test');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness(edge);await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);state=await restored.json('/bills/'+s.card.id+'/reconciliation',undefined,restored.owner);assert.equal(state.bankStatus,'matched');assert.equal(state.attempts[0].adjustments.reduce((n,a)=>n+a.cents,0),37500);assert.equal(edge.calls,1);
  await h.json('/team',{email:'finance-custodian@example.test',name:'Finance wall custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'finance-custodian@example.test'},h.owner);await h.login('finance-custodian@example.test');
  const hidden=await open(h,'Restricted finance batch','Restricted finance client','Restricted finance adverse'),hiddenBill=await reviewed(h,hidden,await draft(h,hidden,'Restricted processor allocation'));
  await h.json('/invoices/issue',{bills:[{id:hiddenBill.id,revision:hiddenBill.revision}]},h.owner);await h.json('/portal/invoices/'+hiddenBill.id+'/checkout',{requestKey:'synthetic-satchel-hidden-allocation'},h.owner);
  const hiddenSession=[...edge.sessions.values()].at(-1);await h.json('/matters/'+hidden.id+'/wall',{revision:null,custodianEmail:'finance-custodian@example.test',members:['finance-custodian@example.test'],reason:'Separate client finance wall'},h.owner);
  const batch='synthetic-satchel-wall-batch';edge.payouts.set(batch,{...edge.payouts.get(payout),id:batch,amount:68683});edge.transactions.set(batch,[...edge.transactions.get(payout),{id:'synthetic-satchel-hidden-balance',currency:'usd',amount:37500,fee:0,net:37500,type:'charge',status:'available',source:{id:'synthetic-satchel-hidden-charge',payment_intent:hiddenSession.payment_intent.id}}]);
  // Verified callbacks associate the intent before a restricted aggregate is inspected.
  await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(edge.event(hiddenSession,'checkout.session.completed','paid'))});
  const auditPath='/audit?matterId='+s.m.id+'&action=stripe.settlement_observed',beforeAudit=(await h.json(auditPath,undefined,h.owner)).records.length;
  await h.json(path+'/settlement',{payoutId:batch},h.owner,404);assert.equal((await h.json(auditPath,undefined,h.owner)).records.length,beforeAudit,'A restricted settlement aggregate cannot leak into an accessible invoice audit');
  await h.json('/matters/'+s.m.id+'/wall',{revision:null,custodianEmail:'finance-custodian@example.test',members:['finance-custodian@example.test'],reason:'Finance records restricted to current counsel'},h.owner);
  await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner,404);await h.json(path+'/refund',{...refund,requestKey:'synthetic-satchel-excluded-refund'},h.owner,404);await h.json(path+'/bank-match',match,h.owner,404);assert.equal(edge.refunds.length,1,'Removed matter authority cannot execute a refund');

 }finally{await restored?.close();await h.close();}
}
