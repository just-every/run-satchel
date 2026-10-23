import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {paymentFixture,receipt} from './billing-payments-fixture.mjs';
// One lifecycle: allocation/finance/credit/reversal with durable replay across the public doors.
test('offline receipts allocate once, retain credit, require finance write-off and reverse append-only across invoices',async()=>{
 const h=await harness();try{
  const f=await paymentFixture(h),base='/matters/'+f.m.id,body=receipt(f);
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing'},h.owner);await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);
  const billing=await h.login('billing@example.test'),assistant=await h.login('assistant@example.test');
  await h.json(base+'/access',{email:'billing@example.test'},h.owner);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json(base+'/payments',body,assistant,403);
  await h.json(base+'/payments',{...body,destination:'trust'},billing,400);await h.json(base+'/payments',{...body,accountId:f.trust.id},billing,400);
  await h.json(base+'/payments',{...body,confirmedReceived:false},billing,400);
  const [p,repeated]=await Promise.all([h.json(base+'/payments',body,billing),h.json(base+'/payments',body,billing)]);assert.equal(repeated.id,p.id);assert.deepEqual(p.allocations.map(x=>x.cents),[10000,20000,15000]);assert.equal(p.unapplied_cents,0);
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
  const before=await h.json(base+'/billing',undefined,h.owner),pdf=Buffer.from(await(await h.request('/api/satchel/bills/'+f.bills[0].id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());
  const beforeRestart=await state();await h.restart();assert.deepEqual(await state(),beforeRestart);assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+f.bills[0].id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),pdf);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json(base+'/payments',undefined,target.owner);assert.equal(restored.receipts.length,3);assert.equal(restored.receipts.find(x=>x.id===p.id).reversal.reason,reversed.reason);assert.equal(restored.writeoffs[0].approved_by,'owner@example.test');assert.deepEqual(restored.invoices, (await h.json(base+'/payments',undefined,h.owner)).invoices);assert.deepEqual((await target.json(base+'/billing',undefined,target.owner)).bills.map(b=>[b.id,b.artifact,b.snapshot]),before.bills.map(b=>[b.id,b.artifact,b.snapshot]));}finally{await target.close();}
 }finally{await h.close();}
});
