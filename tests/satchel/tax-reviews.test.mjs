import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {capturePanel} from './browser-shots.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';
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


test('BILL-004 configured-matter approval freezes exact two-jurisdiction tax provenance and CSV totals; unknown, stale, cross-bill, LEDES and trust gaps refuse; additive corrections retain rounded original treatment',async()=>{
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
  await h.json(base+'/ledes-guideline',{clientLedesId:'TAX-CLIENT',lawFirmId:'FIRM-TEST',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Synthetic client guideline without reviewed tax mapping'},h.owner);
  const expense=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-02',description:'LEDES tax mapping cannot be inferred',amountCents:100},h.owner),coded=await h.json(base+'/bills',{title:'Missing tax mapping',date:'2026-10-02',entryIds:[expense.id]},h.owner),codedReview=await h.json('/bills/'+coded.id+'/tax-reviews',{revision:coded.revision,ruleId:ca.id},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);
  const originals=[],corrections=[];
  for(const [draft,review,tax,total] of [[first,a,5,325],[second,b,16,336]]){
   const approved=await approve(draft,review.id);assert.deepEqual([approved.snapshot.subtotalCents,approved.snapshot.taxCents,approved.snapshot.totalCents],[320,tax,total]);assert.deepEqual(approved.snapshot.taxReview,review);
   const funds=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===draft.id).trustPayment;assert.equal(funds.earned_cents,320,'Tax is payable but never earned service revenue');assert.equal(funds.due_cents,total);assert.equal(funds.paid_cents,0);
   const issued=await h.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},h.owner);
   const counter=(await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number;
   const file=await h.request('/api/satchel/bills/'+draft.id+'/export',undefined,h.owner);assert.equal(file.status,200);const bytes=await file.text();assert.match(bytes,new RegExp('"TAX USD cents","'+tax+'"'));assert.match(bytes,new RegExp('"TOTAL","","","","","","","'+total+'"'));assert.ok(bytes.includes(review.id)&&bytes.includes(review.snapshot.rule.reference)&&bytes.includes('native firm-reviewed calculation'));
   const current=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===draft.id);originals.push({id:current.id,bytes,snapshot:current.snapshot});
   let parent=current;
   for(const [index,correctedAmountCents] of [10,101].entries()){
    const correction=await h.json('/bills/'+parent.id+'/correct',{revision:parent.revision,sourceId:parent.snapshot.lines[0].sourceId,correctedAmountCents,reason:index?'Restore reviewed source amount':'Courtesy reduction with tax delta',date:'2026-10-02'},h.owner);
    assert.deepEqual(correction.snapshot.taxBasis.rule,review.snapshot.rule);
    await h.json('/bills/'+correction.id+'/approve',{revision:correction.revision,reviewNote:'Tax is still unreviewed'},h.owner,422);
    await h.json('/bills/'+correction.id+'/tax-reviews',{revision:'stale'},h.owner,409);
    await h.json('/bills/'+correction.id+'/tax-reviews',{revision:correction.revision,ruleId:review===a?ca.id:ny.id},h.owner,422);
    const delta=await h.json('/bills/'+correction.id+'/tax-reviews',{revision:correction.revision},h.owner),wantTax=review===a?(index?4:-4):0;
    assert.equal(delta.snapshot.taxCents,wantTax,'Tax is rounded on the corrected and prior bases separately, then subtracted');
    assert.deepEqual([delta.snapshot.lines[0].priorTaxCents,delta.snapshot.lines[0].correctedTaxCents],review===a?(index?[1,5]:[5,1]):[0,0]);
    assert.equal(delta.snapshot.subtotalCents,index?91:-91);assert.equal(delta.snapshot.totalCents,(index?91:-91)+wantTax);
    const changed=await h.json('/bills/'+correction.id+'/approve',{revision:correction.revision,reviewNote:'Reviewed original rule and exact additive tax difference',taxReviewId:delta.id},h.owner);
    const issue=await h.json('/invoices/issue',{bills:[{id:changed.id,revision:changed.revision}]},h.owner);
    assert.equal(issue.issues[0].number,issued.issues[0].number+'-R'+(index+1));
    assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,counter,'Tax corrections consume no new sequence number');
    const pdf=await h.request('/api/satchel/bills/'+changed.id+'/invoice.pdf',undefined,h.owner);assert.equal(pdf.status,200);const pdfBytes=Buffer.from(await pdf.arrayBuffer());assert.ok(pdfBytes.length>100);
    const csv=await h.request('/api/satchel/bills/'+changed.id+'/export',undefined,h.owner);assert.equal(csv.status,200);const correctionBytes=await csv.text();assert.ok(correctionBytes.includes(delta.id));assert.ok(correctionBytes.includes('"TAX USD cents","'+wantTax+'"'));
    parent=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===changed.id);
    corrections.push({id:parent.id,bytes:correctionBytes,snapshot:parent.snapshot,pdfBytes});
    const funds=(await h.json(base+'/billing',undefined,h.owner)).bills.find(v=>v.id===draft.id).trustPayment;
    assert.equal(funds.earned_cents,320+(index?0:-91));assert.equal(funds.tax_cents,tax+(index?0:wantTax));assert.equal(funds.due_cents,total+(index?0:-91+wantTax));
   }
   assert.match((await h.json('/trust/transfers',{billId:draft.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:draft.id},h.owner,422)).error,/tax trust eligibility and allocation/);
   await h.json('/bills/'+draft.id+'/approve',{revision:draft.revision,reviewNote:'Replay',taxReviewId:review.id},h.owner,409);
  }
  assert.match((await h.json('/bills/'+coded.id+'/approve',{revision:coded.revision,reviewNote:'Must retain tax in every format',taxReviewId:codedReview.id},h.owner,422)).error,/LEDES 1998B\/XML tax mapping/);
  assert.equal((await h.request('/api/satchel/bills/'+coded.id+'/ledes',undefined,h.owner)).status,409);
  assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.length,7,'Only reviewed additive corrections and the refused LEDES draft exist');
  assert.equal((await h.json('/trust/transfers',undefined,h.owner)).length,0);assert.equal((await h.json('/trust',undefined,h.owner)).entries.length,0);
  await h.json(base+'/tax-rules',terms('NY',{service:{eligibility:'taxable',ratePpm:999999,reference:'Later review must not rewrite original'}}),h.owner);
  await h.restart();const restored=await harness();try{const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
   for(const o of [...originals,...corrections]){for(const target of [h,restored]){assert.equal(await(await target.request('/api/satchel/bills/'+o.id+'/export',undefined,target.owner)).text(),o.bytes);assert.deepEqual((await target.json(base+'/billing',undefined,target.owner)).bills.find(v=>v.id===o.id).snapshot,o.snapshot);if(o.pdfBytes)assert.deepEqual(Buffer.from(await(await target.request('/api/satchel/bills/'+o.id+'/invoice.pdf',undefined,target.owner)).arrayBuffer()),o.pdfBytes);}}
  }finally{await restored.close();}
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=bill.approved',undefined,h.owner);for(const o of originals){const row=audit.records.find(v=>v.objectId===o.id);assert.deepEqual(row.evidence.record.taxApproval.snapshot,o.snapshot);assert.equal(JSON.parse(row.evidence.record.snapshot).totalCents,320,'The original pre-tax draft snapshot remains immutable');}
 }finally{await h.close();}
});

// The billing form selects a retained exact calculation and shows tax separately.
// Omitting that selection must never silently approve a configured matter.
for(const width of [1440,390])test(`BILL-004 reviewed tax setup, calculation, refusal, exact approval and additive correction on the billing screen at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{
  const m=await open(h),base='/matters/'+m.id,entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Reviewed taxable legal work',minutes:60,rateCents:10000},h.owner),draft=await h.json(base+'/bills',{title:'Reviewed New York tax invoice',date:'2026-10-01',entryIds:[entry.id]},h.owner);
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const navigate=async()=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByRole('heading',{level:1,name:'Time & bills',exact:true}).waitFor();await page.getByLabel('Current matter').selectOption(m.id);};
  await navigate();
  const tax=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Reviewed tax rules',exact:true})});
  await tax.getByText('Save a reviewed tax rule',{exact:true}).click();
  await tax.getByLabel('Reviewed US state or DC (two-letter code)').fill('NY');await tax.getByLabel('Reviewed jurisdiction including locality').fill('New York reviewed fixture locality');await tax.getByLabel('Counsel/accountant review reference').fill('Synthetic counsel review fixture; not tax advice');
  await tax.getByLabel('Services reviewed treatment',{exact:true}).selectOption('taxable');await tax.getByLabel('Services rate (exact parts per million)',{exact:true}).fill('50000');await tax.getByLabel('Services treatment or exemption reference',{exact:true}).fill('Synthetic reviewed service treatment');
  await tax.getByLabel('Expenses reviewed treatment',{exact:true}).selectOption('exempt');await tax.getByLabel('Expenses rate (exact parts per million)',{exact:true}).fill('0');await tax.getByLabel('Expenses treatment or exemption reference',{exact:true}).fill('Synthetic reviewed expense exemption');await tax.getByLabel('Reviewed per-line rounding',{exact:true}).selectOption('half_up');await tax.getByRole('checkbox').check();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,tax,process.env.SATCHEL_SCREENSHOTS,width+'-tax-setup');
  await tax.getByRole('button',{name:'Save reviewed tax rule',exact:true}).click();await page.getByRole('status').getByText('Immutable reviewed tax rule saved',{exact:true}).waitFor();
  const bill=page.locator('section.bill-packages article.record').filter({has:page.locator('strong').filter({hasText:/^Reviewed New York tax invoice ·/})});await bill.getByLabel('Review note',{exact:true}).fill('Exact source review');await bill.getByRole('button',{name:'Approve exact bill'}).click();await page.getByRole('alert').getByText(/Unknown tax treatment/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-error.png'});await bill.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-refusal-0.png'});}
  await bill.getByText('Review exact tax calculation',{exact:true}).click();await bill.getByLabel('Immutable reviewed tax rule',{exact:true}).selectOption({index:1});await bill.getByRole('button',{name:'Calculate tax for this revision',exact:true}).click();await page.getByRole('status').getByText('Tax calculation saved for this exact bill revision',{exact:true}).waitFor();
  const review=(await h.json('/bills/'+draft.id+'/tax-reviews',undefined,h.owner)).calculations[0];assert.equal(review.snapshot.taxCents,500);assert.equal(review.snapshot.rule.service.ratePpm,50000);assert.equal(review.snapshot.rule.expense.eligibility,'exempt');
  await bill.getByText('Review exact tax calculation',{exact:true}).click();await bill.getByText(/\$5.00 tax · \$105.00 total · revision/).click();if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,bill,process.env.SATCHEL_SCREENSHOTS,width+'-tax-calculation');
  await bill.getByLabel('Reviewed tax calculation',{exact:true}).selectOption(review.id);await bill.getByLabel('Review note',{exact:true}).fill('Exact tax and service calculation reviewed');await bill.getByRole('button',{name:'Approve exact bill'}).click();await page.getByRole('status').getByText('Bill approved. The reviewed package is ready to export.',{exact:true}).waitFor();await bill.getByText('Reviewed New York tax invoice · $105.00',{exact:true}).waitFor();await bill.getByText('Before tax: $100.00 · Tax: $5.00',{exact:false}).waitFor();
  const download=page.waitForEvent('download');await bill.getByRole('button',{name:'Download reviewed CSV'}).click();const file=await download;assert.equal(await file.failure(),null);const stream=await file.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.match(Buffer.concat(chunks).toString(),/"TAX USD cents","500"/);
  await page.getByRole('status').getByText('Reviewed bill exported',{exact:true}).waitFor();await bill.getByText('exported',{exact:true}).waitFor();await bill.getByText('Reviewed New York tax invoice · $105.00',{exact:true}).waitFor();
  await bill.getByText('Prepare a correction',{exact:true}).click();await bill.getByLabel('Correct total for this source (USD cents)',{exact:true}).fill('9000');await bill.getByLabel('Reason',{exact:true}).fill('Reviewed courtesy reduction with original-rule tax delta');await bill.getByRole('button',{name:'Prepare correction for review',exact:true}).click();await page.getByRole('status').getByText('Correction prepared; original export preserved',{exact:true}).waitFor();
  const correction=page.locator('section.bill-packages article.record').filter({has:page.locator('strong').filter({hasText:/^Correction: Reviewed New York tax invoice ·/})});
  await correction.getByText('Review exact tax calculation',{exact:true}).click();await correction.getByText("This correction uses the original bill's immutable reviewed tax rule.",{exact:true}).waitFor();await correction.getByRole('button',{name:'Calculate tax for this revision',exact:true}).click();await page.getByRole('status').getByText('Tax calculation saved for this exact bill revision',{exact:true}).waitFor();
  await correction.getByText('Review exact tax calculation',{exact:true}).click();await correction.getByText(/-\$0.50 tax · -\$10.50 total · revision/).click();if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,correction,process.env.SATCHEL_SCREENSHOTS,width+'-tax-correction-review');
  await correction.getByLabel('Reviewed tax calculation',{exact:true}).selectOption({index:1});await correction.getByLabel('Review note',{exact:true}).fill('Reviewed source, original tax rule and exact negative delta');await correction.getByRole('button',{name:'Approve exact bill',exact:true}).click();await page.getByRole('status').getByText('Bill approved. The reviewed package is ready to export.',{exact:true}).waitFor();await correction.getByText('Correction: Reviewed New York tax invoice · -$10.50',{exact:true}).waitFor();await correction.getByText('Before tax: -$10.00 · Tax: -$0.50',{exact:false}).waitFor();
  const creditDownload=page.waitForEvent('download');await correction.getByRole('button',{name:'Download reviewed CSV',exact:true}).click();const creditFile=await creditDownload;assert.equal(await creditFile.failure(),null);const creditChunks=[];for await(const chunk of await creditFile.createReadStream())creditChunks.push(chunk);assert.match(Buffer.concat(creditChunks).toString(),/"TAX USD cents","-50"/);await correction.getByText('exported',{exact:true}).waitFor();
  assert.equal(await(await h.request('/api/satchel/bills/'+draft.id+'/export',undefined,h.owner)).text(),Buffer.concat(chunks).toString(),'The original reviewed CSV remains byte-identical after correction');
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,correction,process.env.SATCHEL_SCREENSHOTS,width+'-tax-corrected');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);assert.deepEqual(errors,[]);if(process.env.SATCHEL_SCREENSHOTS){await bill.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-tax-approved-0.png'});}
 }finally{await browser.close();await h.close();}
});
