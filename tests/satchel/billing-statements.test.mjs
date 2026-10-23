import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {paymentFixture} from './billing-payments-fixture.mjs';
import {readInvoicePdf} from './billing-templates-fixture.mjs';
test('internal consolidated statement retains selected matter allocations and exact PDF while every read rechecks all matter access',async()=>{
 const h=await harness();try{
  const f=await paymentFixture(h),b=await f.issue(3000,'Second selected matter advice',f.sibling),excluded=await open(h,'Excluded third matter'),third=await f.issue(9000,'Excluded confidential third-matter work',excluded),base='/matters/'+f.m.id;
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');await h.json(base+'/access',{email:'billing@example.test'},h.owner);
  await h.json('/team',{email:'client@example.test',name:'Client',role:'client'},h.owner);await h.json('/team/invite',{email:'client@example.test'},h.owner);const client=await h.login('client@example.test');
  const body={requestKey:'synthetic-satchel-201',invoices:[{id:f.bills[0].id,feeReference:'Reviewed first-matter engagement',responsibleAttorney:'owner@example.test'},{id:b.id,feeReference:'Reviewed second-matter engagement',responsibleAttorney:'owner@example.test'}]};
  await h.json(base+'/statements',body,billing,404);await h.json(base+'/statements',body,client,403);
  const [s,replayed]=await Promise.all([h.json(base+'/statements',body,h.owner),h.json(base+'/statements',body,h.owner)]);assert.equal(s.id,replayed.id);assert.equal(s.snapshot.totalDueCents,13000);assert.deepEqual(s.snapshot.items.map(x=>[x.billId,x.dueCents]),[[f.bills[0].id,10000],[b.id,3000]]);assert.equal(s.snapshot.recipient,null);assert.ok(!s.snapshot.items.some(x=>x.matterId===excluded.id));
  assert.equal((await h.json(base+'/statements',undefined,h.owner)).statements.length,1);await h.json(base+'/statements',{...body,invoices:[...body.invoices,{id:third.id,feeReference:'Other reviewed agreement',responsibleAttorney:'owner@example.test'}]},h.owner,409);
  await h.json('/matters/'+f.sibling.id+'/access',{email:'billing@example.test'},h.owner);
  const read=async(cookie)=>{const r=await h.request('/api/satchel/statements/'+s.id+'/pdf',undefined,cookie);assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());};
  const bytes=await read(billing),words=(await readInvoicePdf(bytes)).text;for(const phrase of ['Consolidated statement','First lease advice','Second selected matter advice','Reviewed first-matter engagement','Reviewed second-matter engagement','Responsible attorney: owner@example.test','Total due USD 130.00'])assert.ok(words.includes(phrase),phrase);assert.ok(!words.includes('Excluded confidential third-matter work'));assert.ok(!words.includes('Second lease advice'));
  assert.equal((await h.request('/api/satchel/statements/'+s.id+'/pdf',undefined,client)).status,403);
  await h.json('/matters/'+f.sibling.id+'/access',{email:'billing@example.test',remove:true},h.owner);assert.equal((await h.request('/api/satchel/statements/'+s.id+'/pdf',undefined,billing)).status,404);assert.deepEqual((await h.json(base+'/statements',undefined,billing)).statements,[]);
  const audit=await h.json('/audit?action=billing.statement_downloaded',undefined,h.owner);assert.ok(audit.records.length);assert.ok(audit.records.every(x=>x.evidence.context.recipientView===false&&x.evidence.record.recordType==='s_billing_statements'));
  await h.restart();assert.deepEqual(await read(h.owner),bytes);const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const r=await target.request('/api/satchel/statements/'+s.id+'/pdf',undefined,target.owner);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal((await target.json(base+'/statements',undefined,target.owner)).statements[0].snapshot.totalDueCents,13000);}finally{await target.close();}
 }finally{await h.close();}
});
