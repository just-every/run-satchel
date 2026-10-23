import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {templateFixture,templateOptions,readInvoicePdf} from './billing-templates-fixture.mjs';
async function pdf(h,b){const r=await h.request('/api/satchel/bills/'+b.id+'/invoice.pdf',undefined,h.owner);assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());}
test('invoice template versions, field choices and scoped assignments freeze exact branded PDF bytes across edits and restore',async()=>{
 const h=await harness();try{
  const f=await templateFixture(h),base='/matters/'+f.m.id;
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');await h.json(base+'/access',{email:'billing@example.test'},h.owner);
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json('/invoice-templates',f.body,assistant,403);await h.json('/invoice-templates',{...f.body,options:{...templateOptions,qr:true}},h.owner,422);await h.json('/invoice-templates',{...f.body,options:{...templateOptions,trust:'balance'}},billing,403);
  const detailed=await h.json('/invoice-templates',{...f.body,options:{...templateOptions,trust:'balance',prior:'balance'}},h.owner);
  const summary=await h.json('/invoice-templates',{...f.body,name:'Summary payer invoice',options:{...templateOptions,layout:'summary',hours:false,rates:false,detail:false,noCharge:false,timekeepers:false,utbms:false}},billing);
  await h.json(base+'/invoice-templates',{scope:'firm',templateKey:detailed.template_key},billing,403);
  await h.json(base+'/invoice-templates',{scope:'firm',templateKey:detailed.template_key},h.owner);await h.json('/matters/'+f.second.id+'/invoice-templates',{scope:'client',templateKey:summary.template_key},h.owner);await h.json(base+'/invoice-templates',{scope:'matter',templateKey:detailed.template_key},h.owner);
  let d=await f.draft(f.m,'Detailed original'),s=await f.draft(f.second,'Summary original');assert.equal(d.snapshot.template.id,detailed.id);assert.equal(s.snapshot.template.id,summary.id);assert.equal(d.snapshot.template.assignmentScope,'matter');assert.equal(s.snapshot.template.assignmentScope,'client');
  const third=await f.draft(f.third,'Inherited client template');assert.equal(third.snapshot.template.id,summary.id);
  d=await f.issue(f.m,d);s=await f.issue(f.second,s);const bytes=await pdf(h,d),words=await readInvoicePdf(bytes),summaryWords=await readInvoicePdf(await pdf(h,s));
  for(const phrase of ['Barton & Lee LLP','200 Park Avenue',f.body.remittance,'Client: Barton Workshop LLC','Matter: '+d.snapshot.matterNumber,f.body.terms,'Due date: 2026-10-31','revision 1','Recorded matter trust balance USD 0.00','Hours 1.00','Rate USD 250.00/hour','Timekeeper owner@example.test','L110','Detailed original no-charge courtesy'])assert.ok(words.text.includes(phrase),phrase);
  assert.equal(words.hasLogo,true);assert.equal(summaryWords.hasLogo,true);for(const hidden of ['Hours ','Rate USD','Timekeeper ','L110','Summary original confidential work','Summary original no-charge courtesy'])assert.ok(!summaryWords.text.includes(hidden),hidden+' is hidden');assert.ok(summaryWords.text.includes('Total USD 250.00'));
  const changed=await h.json('/invoice-templates',{...f.body,name:'Detailed counsel updated',templateKey:detailed.template_key,previousId:detailed.id,remittance:'Updated operating remittance, reviewed by finance',options:{...templateOptions,rates:false}},h.owner);assert.equal(changed.version,2);
  await h.json('/invoice-templates',{...f.body,templateKey:detailed.template_key,previousId:detailed.id},h.owner,409);
  const next=await f.issue(f.m,await f.draft(f.m,'Later template bill'));assert.equal(next.snapshot.template.id,changed.id);const nextWords=await readInvoicePdf(await pdf(h,next));assert.ok(nextWords.text.includes('revision 2'));assert.ok(nextWords.text.includes('Updated operating remittance'));assert.ok(!nextWords.text.includes('Rate USD'));
  assert.deepEqual(await pdf(h,d),bytes);assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.find(x=>x.id===d.id).snapshot.template.id,detailed.id);
  await h.json('/invoice-templates/'+detailed.template_key+'/retire',{reason:'Use the revised firm billing standard'},h.owner);await h.json(base+'/entries',{kind:'time',date:'2026-10-02',description:'Next unbilled review',minutes:60,rateCents:100},h.owner);const entries=(await h.json(base+'/billing',undefined,h.owner)).entries.filter(x=>!x.reservedBy&&x.billable);await h.json(base+'/bills',{title:'Retired template refusal',date:'2026-10-02',entryIds:entries.map(x=>x.id)},h.owner,422);assert.deepEqual(await pdf(h,d),bytes);
  await h.restart();assert.deepEqual(await pdf(h,d),bytes);const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await pdf(target,d),bytes);assert.deepEqual(await target.json(base+'/invoice-templates',undefined,target.owner),await h.json(base+'/invoice-templates',undefined,h.owner));}finally{await target.close();}
 }finally{await h.close();}
});
