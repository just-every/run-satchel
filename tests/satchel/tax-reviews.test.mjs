import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const terms=(state='NY',extra={})=>({state,jurisdiction:state+' reviewed test locality',rounding:'half_up',reference:'Synthetic accountant review fixture; not tax advice',reviewed:true,service:{eligibility:'taxable',ratePpm:50000,reference:'Synthetic service treatment'},expense:{eligibility:'exempt',ratePpm:0,reference:'Synthetic expense exemption'},...extra});
test('BILL-004 native draft tax review: two jurisdictions, explicit exemptions, exact rounding, immutable provenance, access and archive recovery (calculation-only door)',async()=>{
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


test('BILL-004 configured-matter approval freezes exact two-jurisdiction tax provenance and CSV totals; unknown, stale, cross-bill, LEDES, correction and trust gaps refuse without effects',async()=>{
 const h=await harness();try{
  const f=await foundation(h),base='/matters/'+f.m.id;
  const make=async title=>{const ids=[];for(const [kind,cents] of [['time',101],['disbursement',219]]){const e=await h.json(base+'/entries',{kind,date:'2026-10-01',description:title+' '+kind,...(kind==='time'?{minutes:60,rateCents:cents}:{amountCents:cents})},h.owner);ids.push(e.id);}return h.json(base+'/bills',{title,date:'2026-10-01',entryIds:ids},h.owner);};
  const ny=await h.json(base+'/tax-rules',terms(),h.owner),ca=await h.json(base+'/tax-rules',terms('CA',{service:{eligibility:'exempt',ratePpm:0,reference:'Synthetic service exemption'},expense:{eligibility:'taxable',ratePpm:72500,reference:'Synthetic expense rate'}}),h.owner);
  const first=await make('New York reviewed invoice'),second=await make('California reviewed invoice');
  const approve=(b,taxReviewId,who=h.owner)=>h.json('/bills/'+b.id+'/approve',{revision:b.revision,reviewNote:'Reviewed exact calculation and all source lines',taxReviewId},who,taxReviewId===undefined||taxReviewId==='unknown'?422:200);
  assert.match((await approve(first)).error,/Unknown tax treatment/);await approve(first,'unknown');
  const a=await h.json('/bills/'+first.id+'/tax-reviews',{revision:first.revision,ruleId:ny.id},h.owner),b=await h.json('/bills/'+second.id+'/tax-reviews',{revision:second.revision,ruleId:ca.id},h.owner);
  await h.json('/bills/'+first.id+'/approve',{revision:first.revision,reviewNote:'Wrong bill calculation',taxReviewId:b.id},h.owner,422);
  await h.json('/bills/'+first.id+'/approve',{revision:'obsolete',reviewNote:'Stale revision',taxReviewId:a.id},h.owner,409);
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json('/bills/'+first.id+'/approve',{revision:first.revision,reviewNote:'No legal authority',taxReviewId:a.id},assistant,403);
  const before=(await h.json(base+'/billing',undefined,h.owner)).bills;assert.ok(before.every(v=>v.status==='draft'&&v.artifact===null&&v.snapshot.totalCents===320));
  const originals=[];
  for(const [draft,review,tax,total] of [[first,a,5,325],[second,b,16,336]]){
   const approved=await approve(draft,review.id);assert.deepEqual([approved.snapshot.subtotalCents,approved.snapshot.taxCents,approved.snapshot.totalCents],[320,tax,total]);assert.deepEqual(approved.snapshot.taxReview,review);
   const funds=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===draft.id).trustPayment;assert.equal(funds.earned_cents,320,'Tax is payable but never earned service revenue');assert.equal(funds.due_cents,total);assert.equal(funds.paid_cents,0);
   const file=await h.request('/api/satchel/bills/'+draft.id+'/export',undefined,h.owner);assert.equal(file.status,200);const bytes=await file.text();assert.match(bytes,new RegExp('"TAX USD cents","'+tax+'"'));assert.match(bytes,new RegExp('"TOTAL","","","","","","","'+total+'"'));assert.ok(bytes.includes(review.id)&&bytes.includes(review.snapshot.rule.reference)&&bytes.includes('native firm-reviewed calculation'));
   const current=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===draft.id);originals.push({id:current.id,bytes,snapshot:current.snapshot});
   await h.json('/bills/'+draft.id+'/correct',{revision:current.revision,sourceId:current.snapshot.lines[0].sourceId,correctedAmountCents:100,reason:'Cannot omit the tax delta',date:'2026-10-02'},h.owner,422);
   assert.match((await h.json('/trust/transfers',{billId:draft.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:draft.id},h.owner,422)).error,/tax trust eligibility and allocation/);
   await h.json('/bills/'+draft.id+'/approve',{revision:draft.revision,reviewNote:'Replay',taxReviewId:review.id},h.owner,409);
  }
  await h.json(base+'/ledes-guideline',{clientLedesId:'TAX-CLIENT',lawFirmId:'FIRM-TEST',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Synthetic client guideline without reviewed tax mapping'},h.owner);
  const expense=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-02',description:'LEDES tax mapping cannot be inferred',amountCents:100},h.owner),coded=await h.json(base+'/bills',{title:'Missing tax mapping',date:'2026-10-02',entryIds:[expense.id]},h.owner),codedReview=await h.json('/bills/'+coded.id+'/tax-reviews',{revision:coded.revision,ruleId:ca.id},h.owner);
  assert.match((await h.json('/bills/'+coded.id+'/approve',{revision:coded.revision,reviewNote:'Must retain tax in every format',taxReviewId:codedReview.id},h.owner,422)).error,/LEDES 1998B\/XML tax mapping/);
  assert.equal((await h.request('/api/satchel/bills/'+coded.id+'/ledes',undefined,h.owner)).status,409);
  assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.length,3,'Refused corrections create no taxless draft');
  assert.equal((await h.json('/trust/transfers',undefined,h.owner)).length,0);assert.equal((await h.json('/trust',undefined,h.owner)).entries.length,0);
  await h.json(base+'/tax-rules',terms('NY',{service:{eligibility:'taxable',ratePpm:999999,reference:'Later review must not rewrite original'}}),h.owner);
  await h.restart();const restored=await harness();try{const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
   for(const o of originals){for(const target of [h,restored]){assert.equal(await(await target.request('/api/satchel/bills/'+o.id+'/export',undefined,target.owner)).text(),o.bytes);assert.deepEqual((await target.json(base+'/billing',undefined,target.owner)).bills.find(v=>v.id===o.id).snapshot,o.snapshot);}}
  }finally{await restored.close();}
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=bill.approved',undefined,h.owner);for(const o of originals){const row=audit.records.find(v=>v.objectId===o.id);assert.deepEqual(row.evidence.record.taxApproval.snapshot,o.snapshot);assert.equal(JSON.parse(row.evidence.record.snapshot).totalCents,320,'The original pre-tax draft snapshot remains immutable');}
 }finally{await h.close();}
});

// The billing form selects a retained exact calculation and shows tax separately.
// Omitting that selection must never silently approve a configured matter.
for(const width of [1440,390])test(`BILL-004 configured tax refusal, exact approved total and immutable CSV on the billing screen at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{
  const m=await open(h),base='/matters/'+m.id,entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Reviewed taxable legal work',minutes:60,rateCents:10000},h.owner),draft=await h.json(base+'/bills',{title:'Reviewed New York tax invoice',date:'2026-10-01',entryIds:[entry.id]},h.owner),rule=await h.json(base+'/tax-rules',terms(),h.owner),review=await h.json('/bills/'+draft.id+'/tax-reviews',{revision:draft.revision,ruleId:rule.id},h.owner);
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const navigate=async()=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByRole('heading',{level:1,name:'Time & bills',exact:true}).waitFor();await page.getByLabel('Current matter').selectOption(m.id);};
  await navigate();const bill=page.locator('section.bill-packages article.record').filter({hasText:'Reviewed New York tax invoice'});await bill.getByLabel('Review note',{exact:true}).fill('Exact source review');await bill.getByRole('button',{name:'Approve exact bill'}).click();await page.getByRole('alert').getByText(/Unknown tax treatment/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-error.png'});await bill.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-refusal-0.png'});}
  await bill.getByLabel('Reviewed tax calculation',{exact:true}).selectOption(review.id);await bill.getByLabel('Review note',{exact:true}).fill('Exact tax and service calculation reviewed');await bill.getByRole('button',{name:'Approve exact bill'}).click();await page.getByRole('status').getByText('Bill approved. The reviewed package is ready to export.',{exact:true}).waitFor();await bill.getByText('Reviewed New York tax invoice · $105.00',{exact:true}).waitFor();await bill.getByText('Before tax: $100.00 · Tax: $5.00',{exact:false}).waitFor();
  const download=page.waitForEvent('download');await bill.getByRole('button',{name:'Download reviewed CSV'}).click();const file=await download;assert.equal(await file.failure(),null);const stream=await file.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.match(Buffer.concat(chunks).toString(),/"TAX USD cents","500"/);
  await page.getByRole('status').getByText('Reviewed bill exported',{exact:true}).waitFor();await bill.getByText('exported',{exact:true}).waitFor();await bill.getByText('Reviewed New York tax invoice · $105.00',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);assert.deepEqual(errors,[]);if(process.env.SATCHEL_SCREENSHOTS){await bill.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-approved-0.png'});}
 }finally{await browser.close();await h.close();}
});
