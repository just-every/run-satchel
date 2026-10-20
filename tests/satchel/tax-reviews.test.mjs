import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
const terms=(state='NY',extra={})=>({state,jurisdiction:state+' reviewed test locality',rounding:'half_up',reference:'Synthetic accountant review fixture; not tax advice',reviewed:true,service:{eligibility:'taxable',ratePpm:50000,reference:'Synthetic service treatment'},expense:{eligibility:'exempt',ratePpm:0,reference:'Synthetic expense exemption'},...extra});
test('BILL-004 native draft tax review: two jurisdictions, explicit exemptions, exact rounding, immutable provenance, access and archive recovery (partial: no issuance integration)',async()=>{
 const h=await harness();try{
  const m=await open(h),base='/matters/'+m.id;
  const entries=[];for(const [kind,amount] of [['time',101],['disbursement',219]])entries.push(await h.json(base+'/entries',kind==='time'?{kind,date:'2026-10-01',description:'Taxable review work',minutes:60,rateCents:amount}:{kind,date:'2026-10-01',description:'Exempt recorded expense',amountCents:amount},h.owner));
  const b=await h.json(base+'/bills',{title:'Reviewed tax inputs',date:'2026-10-01',entryIds:entries.map(e=>e.id)},h.owner),door='/bills/'+b.id+'/tax-reviews';
  await h.json(base+'/tax-rules',terms('NY',{reviewed:false}),h.owner,422);
  await h.json(base+'/tax-rules',terms('NY',{service:{eligibility:'unknown',ratePpm:0,reference:'Not reviewed'}}),h.owner,422);
  await h.json(base+'/tax-rules',terms('XX'),h.owner,400);
  await h.json(base+'/tax-rules',terms('NY',{rounding:'invented'}),h.owner,400);
  await h.json(base+'/tax-rules',terms('NY',{expense:{eligibility:'exempt',ratePpm:1,reference:'Invalid'}}),h.owner,400);
  const ny=await h.json(base+'/tax-rules',terms(),h.owner),ca=await h.json(base+'/tax-rules',terms('CA',{service:{eligibility:'exempt',ratePpm:0,reference:'Synthetic service exemption'},expense:{eligibility:'taxable',ratePpm:72500,reference:'Synthetic expense rate'}}),h.owner);
  assert.equal(ny.reviewedBy,'owner@example.test');assert.equal(ny.service.ratePpm,50000);
  await h.json(door,{revision:b.revision,ruleId:'unknown'},h.owner,422);
  await h.json(door,{revision:'stale',ruleId:ny.id},h.owner,409);
  const a=await h.json(door,{revision:b.revision,ruleId:ny.id},h.owner),c=await h.json(door,{revision:b.revision,ruleId:ca.id},h.owner);
  assert.deepEqual([a.snapshot.subtotalCents,a.snapshot.taxCents,a.snapshot.totalCents],[320,5,325]);
  assert.deepEqual([c.snapshot.subtotalCents,c.snapshot.taxCents,c.snapshot.totalCents],[320,16,336]);
  assert.deepEqual(a.snapshot.lines.map(l=>[l.kind,l.baseCents,l.eligibility,l.taxCents]),[['time',101,'taxable',5],['disbursement',219,'exempt',0]]);
  assert.equal(a.billRevision,b.revision);assert.deepEqual(a.snapshot.rule,ny);assert.equal(a.snapshot.providerResult,null);assert.match(a.snapshot.provider,/native firm-reviewed/i);assert.match(a.snapshot.label,/not issued/);
  const other=await open(h,'Other confidential matter','Other client','Other opponent');await h.json('/matters/'+other.id+'/tax-rules',terms(),h.owner);
  const alien=(await h.json('/matters/'+other.id+'/tax-rules',undefined,h.owner)).rules[0];await h.json(door,{revision:b.revision,ruleId:alien.id},h.owner,422);
  const tiny=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-01',description:'Half cent rounding input',amountCents:10},h.owner);
  const tb=await h.json(base+'/bills',{title:'Rounding',date:'2026-10-01',entryIds:[tiny.id]},h.owner);
  for(const [rounding,want] of [['half_up',1],['half_even',0],['down',0]]){
   const r=await h.json(base+'/tax-rules',terms('NY',{rounding,expense:{eligibility:'taxable',ratePpm:50000,reference:'Synthetic half-cent fixture'}}),h.owner);
   assert.equal((await h.json('/bills/'+tb.id+'/tax-reviews',{revision:tb.revision,ruleId:r.id},h.owner)).snapshot.taxCents,want);
  }
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  await h.json(base+'/tax-rules',undefined,assistant,404);await h.json(door,undefined,assistant,404);
  await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json(base+'/tax-rules',terms(),assistant,403);await h.json(door,{revision:b.revision,ruleId:ny.id},assistant,403);
  assert.equal((await h.json(door,undefined,assistant)).calculations.length,2);
  assert.equal((await h.request('/api/satchel'+door)).status,401);
  await h.restart();assert.deepEqual((await h.json(door,undefined,h.owner)).calculations.find(v=>v.id===a.id),a);
  assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).snapshot.totalCents,320,'Calculation never silently issues tax or changes trust accounting');
  const audit=await h.json('/audit?matterId='+m.id+'&action=tax.calculation_reviewed',undefined,h.owner);const row=audit.records.find(v=>v.objectId===a.id);assert.equal(row.matterId,m.id);assert.equal(row.revision,b.revision);assert.deepEqual(JSON.parse(row.evidence.record.snapshot),a.snapshot);
  const target=await harness();try{const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json(door,undefined,target.owner),await h.json(door,undefined,h.owner));assert.deepEqual(await target.json(base+'/tax-rules',undefined,target.owner),await h.json(base+'/tax-rules',undefined,h.owner));}finally{await target.close();}
  await h.json('/bills/'+b.id+'/void',{revision:b.revision,reason:'Cancel unissued review fixture'},h.owner);await h.json(door,{revision:b.revision,ruleId:ny.id},h.owner,409);assert.equal((await h.json(door,undefined,h.owner)).calculations.length,2);
 }finally{await h.close();}
});
