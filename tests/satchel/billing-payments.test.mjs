import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {reviewed} from './invoice-numbering-fixture.mjs';
import {paymentFixture,receipt} from './billing-payments-fixture.mjs';
// One lifecycle: allocation/finance/credit/reversal with durable replay across the public doors.
test('offline receipts allocate once, retain credit, require finance write-off and reverse append-only across invoices',async()=>{
 const h=await harness();try{
  const f=await paymentFixture(h),base='/matters/'+f.m.id,body=receipt(f);
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing'},h.owner);await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);
  await h.json('/team/invite',{email:'billing@example.test'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);
  const billing=await h.login('billing@example.test'),assistant=await h.login('assistant@example.test');
  await h.json(base+'/access',{email:'billing@example.test'},h.owner);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json(base+'/payments',body,assistant,403);
  await h.json(base+'/payments',{...body,destination:'trust'},billing,400);await h.json(base+'/payments',{...body,accountId:f.trust.id},billing,400);
  await h.json(base+'/payments',{...body,confirmedReceived:false},billing,400);
  const [p,repeated]=await Promise.all([h.json(base+'/payments',body,billing),h.json(base+'/payments',body,billing)]);assert.equal(repeated.id,p.id);assert.deepEqual(f.bills.map(b=>p.allocations.find(x=>x.bill_id===b.id).cents),[10000,20000,15000]);assert.equal(p.unapplied_cents,0);
  const live=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===f.bills[0].id);await h.json('/invoices/'+live.id+'/void',{revision:live.revision,reason:'Cannot void paid work'},h.owner,409);
  const state=()=>h.json(base+'/payments',undefined,billing);let s=await state();assert.deepEqual(s.invoices.map(x=>x.balance.due_cents),[0,0,15000]);assert.deepEqual(s.invoices.map(x=>x.balance.status),['paid','paid','partially_paid']);
  await h.json(base+'/payments',{...body,cents:46000},billing,409);assert.equal((await state()).receipts.length,1);
  const wbody={requestKey:'synthetic-satchel-5',cents:15000,date:'2026-10-04',reason:'Finance approved courtesy write-off for service concern'};
  await h.json('/bills/'+f.bills[2].id+'/writeoffs',wbody,assistant,403);
  const w=await h.json('/bills/'+f.bills[2].id+'/writeoffs',wbody,billing);assert.equal((await state()).invoices[2].balance.due_cents,15000);
  await h.json('/writeoffs/'+w.id+'/approve',{requestKey:'synthetic-satchel-6'},billing,403);await h.json('/writeoffs/'+w.id+'/approve',{requestKey:'synthetic-satchel-6'},assistant,403);
  const approval={requestKey:'synthetic-satchel-6'};await h.json('/writeoffs/'+w.id+'/approve',approval,h.owner);await h.json('/writeoffs/'+w.id+'/approve',approval,h.owner);assert.equal((await state()).invoices[2].balance.due_cents,0);
  const fourth=await f.issue(5000,'Fourth lease advice');
  const secondBody=receipt(f,{requestKey:'synthetic-satchel-7',reference:'synthetic-satchel-8',cents:10000});
  const second=await h.json(base+'/payments',secondBody,billing);assert.equal(second.unapplied_cents,5000);assert.deepEqual(second.allocations.map(x=>[x.bill_id,x.cents]),[[fourth.id,5000]]);
  const fifth=await f.issue(4000,'Fifth lease advice'),credit={requestKey:'synthetic-satchel-9',date:'2026-10-05',allocations:[{billId:fifth.id,cents:4000}]};
  await h.json('/receipts/'+second.id+'/apply',credit,billing);await h.json('/receipts/'+second.id+'/apply',credit,billing);assert.equal((await state()).receipts.find(x=>x.id===second.id).unapplied_cents,1000);
  const sixth=await f.issue(4000,'Sixth lease advice'),race=[10,11].map(n=>h.request('/api/satchel/receipts/'+second.id+'/apply',{requestKey:'synthetic-satchel-'+n,date:'2026-10-06',allocations:[{billId:sixth.id,cents:1000}]},billing));
  const results=await Promise.all(race);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await state()).receipts.find(x=>x.id===second.id).unapplied_cents,0);
  const reversed={requestKey:'synthetic-satchel-12',date:'2026-10-07',reason:'Bank reported the original check stopped'};
  await h.json('/receipts/'+p.id+'/reverse',reversed,billing);await h.json('/receipts/'+p.id+'/reverse',reversed,billing);s=await state();assert.deepEqual(s.invoices.slice(0,3).map(x=>x.balance.due_cents),[10000,20000,15000]);assert.equal(s.receipts.find(x=>x.id===p.id).allocations.length,3);assert.ok(s.receipts.find(x=>x.id===p.id).reversal);
  await h.json('/receipts/'+p.id+'/apply',{...credit,requestKey:'synthetic-satchel-13'},billing,409);
  const alien=await f.issue(10000,'Other client work',f.other);await h.json(base+'/payments',receipt(f,{requestKey:'synthetic-satchel-14',mode:'explicit',allocations:[{billId:alien.id,cents:100}]}),h.owner,409);
  // A cross-matter receipt requires access to every referenced matter for all reads and writes.
  const sibling=await f.issue(3000,'Same payer other matter',f.sibling),cross=await h.json(base+'/payments',receipt(f,{requestKey:'synthetic-satchel-15',mode:'explicit',allocations:[{billId:sibling.id,cents:3000}],cents:4000}),h.owner);
  assert.ok(!(await state()).receipts.some(x=>x.id===cross.id));await h.json('/receipts/'+cross.id+'/reverse',{...reversed,requestKey:'synthetic-satchel-16'},billing,404);
  const ledger=await h.json(base+'/receivables?asOf=2026-10-06',undefined,billing);assert.equal(ledger.totals.paidCents,55000);assert.equal(ledger.totals.writeoffCents,15000);assert.equal(ledger.totals.openCents,3000);assert.equal(ledger.events.filter(x=>x.kind==='offline_payment').length,6);const afterReverse=await h.json(base+'/receivables?asOf=2026-10-07',undefined,billing);assert.equal(afterReverse.totals.paidCents,10000);assert.equal(afterReverse.totals.openCents,48000);assert.equal(afterReverse.events.filter(x=>x.kind==='payment_reversal').length,3);assert.deepEqual(await h.json(base+'/receivables?asOf=2026-10-06',undefined,billing),ledger);assert.equal((await h.request('/api/satchel'+base+'/receivables.csv?asOf=2026-10-07',undefined,billing)).status,200);
  const original=await f.issue(1000,'Ledger void-and-rebill source');const historical=await h.json(base+'/receivables?asOf=2026-10-22',undefined,h.owner);await h.json('/invoices/'+original.id+'/void',{revision:original.revision,reason:'Reviewed native void for source-preserving replacement'},h.owner);let replacement=await h.json(base+'/bills',{title:'Native ledger replacement',date:'2026-10-23',entryIds:[original.snapshot.lines[0].sourceId]},h.owner);replacement=await reviewed(h,f.m,replacement);await h.json('/invoices/issue',{bills:[{id:replacement.id,revision:replacement.revision}]},h.owner);assert.deepEqual(await h.json(base+'/receivables?asOf=2026-10-22',undefined,h.owner),historical);const withVoid=await h.json(base+'/receivables?asOf=2026-10-23',undefined,h.owner);assert.equal(withVoid.events.filter(x=>x.kind==='void'&&x.billId===original.id).length,1);assert.equal(withVoid.events.filter(x=>x.kind==='invoice'&&x.billId===replacement.id).length,1);assert.ok(!withVoid.aging.some(x=>x.billId===original.id));assert.equal(withVoid.aging.find(x=>x.billId===replacement.id).cents,1000);
  const before=await h.json(base+'/billing',undefined,h.owner),pdf=Buffer.from(await(await h.request('/api/satchel/bills/'+f.bills[0].id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());
  const beforeRestart=await state();await h.restart();assert.deepEqual(await state(),beforeRestart);assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+f.bills[0].id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),pdf);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json(base+'/payments',undefined,target.owner);assert.equal(restored.receipts.length,3);assert.equal(restored.receipts.find(x=>x.id===p.id).reversal.reason,reversed.reason);assert.equal(restored.writeoffs[0].approved_by,'owner@example.test');assert.deepEqual(restored.invoices, (await h.json(base+'/payments',undefined,h.owner)).invoices);assert.deepEqual((await target.json(base+'/billing',undefined,target.owner)).bills.map(b=>[b.id,b.artifact,b.snapshot]),before.bills.map(b=>[b.id,b.artifact,b.snapshot]));}finally{await target.close();}
 }finally{await h.close();}
});
