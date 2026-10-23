import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
test('provider charges: every provider bills the firm directly, review of its terms is principal-only and audited, and a native bill carries no Satchel charge',async()=>{
 const h=await harness();
 try{
  const first=await h.json('/providers',undefined,h.owner);
  assert.match(first.statement,/free, MIT-licensed software/);
  for(const id of ['lawpay','stripe','docusign','inkwell','quickbooks-online','xero','cloudflare','mail','sms','court-rules'])assert.ok(first.providers.some(p=>p.id===id),id);
  for(const p of first.providers){assert.equal(p.satchelCharge,'none');assert.match(p.billing,/directly by the provider under its own terms/);assert.equal(p.review,null);}
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  await h.json('/providers',undefined,assistant,403);await h.json('/providers/stripe/review',{termsUrl:'https://stripe.com/legal',confirmed:true},assistant,403);
  const terms='https://stripe.com/legal/ssa';
  await h.json('/providers/stripe/review',{termsUrl:terms},h.owner,400);
  await h.json('/providers/stripe/review',{termsUrl:'http://stripe.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/stripe/review',{termsUrl:'https://user:pass@stripe.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/unknown/review',{termsUrl:terms,confirmed:true},h.owner,404);
  await h.json('/providers/stripe/review',{termsUrl:terms,confirmed:true},h.owner);
  const after=await h.json('/providers',undefined,h.owner);
  assert.equal(after.providers.find(p=>p.id==='stripe').review.termsUrl,terms);assert.equal(after.providers.find(p=>p.id==='stripe').review.reviewedBy,'owner@example.test');assert.equal(after.providers.find(p=>p.id==='xero').review,null);
  const trail=await h.json('/audit?action=provider.reviewed',undefined,h.owner);assert.equal(trail.records.length,1);assert.equal(trail.records[0].actor.email,'owner@example.test');assert.match(JSON.stringify(trail.records[0]),/Satchel charge none/);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes(terms));
  const m=await open(h),entry=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',description:'Review lease',minutes:60,rateCents:25000},h.owner);
  const bill=await h.json('/matters/'+m.id+'/bills',{title:'October',date:'2026-10-15',entryIds:[entry.id]},h.owner);
  assert.equal(bill.snapshot.totalCents,25000,'The bill is exactly the recorded work: no Satchel fee, plan or markup');
  for(const path of ['/plan','/license','/subscription','/upgrade','/pricing','/billing/plan'])assert.equal((await h.request('/api/satchel'+path,undefined,h.owner)).status,404,path);
 }finally{await h.close();}
});
