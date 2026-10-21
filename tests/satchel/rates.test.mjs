import {exemptTaxReview} from './tax-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('TIME-003 versioned client, attorney, matter and task rates with increments and discounts price work either side of a change, cross the budget once per level and never rewrite issued bills',async()=>{
 const h=await harness();let restored;
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const a=await open(h,'Harper v. Reed','Harper family','Reed Logistics'),sibling=await open(h,'Harper lease','Harper family','Elm Landlord'),other=await open(h,'Pine estate','Pine family','Elm Trustee');
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
  for(const m of [a,other])for(const email of ['lawyer@example.test','assistant@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);
  const rate=(m,body,who=h.owner,expected=200)=>h.json('/matters/'+m.id+'/rates',{incrementMinutes:6,discountBps:0,billable:true,note:'Engagement letter',...body},who,expected);
  const entry=(m,body,who=h.owner)=>h.json('/matters/'+m.id+'/entries',{kind:'time',description:'Work',minutes:50,...body},who);

  // Only the principal sets firm and client agreements; a lawyer who sees the matter sets its own.
  await rate(a,{scope:'client',effectiveFrom:'2026-01-01',rateCents:25000},lawyer,403);
  await rate(a,{scope:'matter',effectiveFrom:'2026-01-01',rateCents:25000},assistant,403);
  await rate(a,{scope:'matter',effectiveFrom:'2026-01-01',rateCents:25000,timekeeperEmail:'stranger@example.test'},h.owner,400);
  await rate(a,{scope:'client',effectiveFrom:'2026-01-01',rateCents:25000,note:'Harper engagement letter: client override'});
  await rate(a,{scope:'client',effectiveFrom:'2026-11-01',rateCents:27500,note:'Harper 2026 rate increase'});
  await rate(a,{scope:'client',effectiveFrom:'2026-11-01',rateCents:28000},h.owner,409);
  await rate(other,{scope:'firm',effectiveFrom:'2026-01-01',rateCents:40000,timekeeperEmail:'lawyer@example.test',note:'Associate standard rate'});
  await rate(a,{scope:'matter',effectiveFrom:'2026-01-01',rateCents:35000,timekeeperEmail:'lawyer@example.test',note:'Associate rate on this matter'},lawyer);
  await rate(a,{scope:'matter',effectiveFrom:'2026-01-01',rateCents:20000,incrementMinutes:15,discountBps:1000,utbmsTask:'L210',note:'Pleadings at a 10% discount'},lawyer);
  let rates=await rate(a,{scope:'matter',effectiveFrom:'2026-01-01',rateCents:0,utbmsTask:'L100',billable:false,note:'Case assessment is not billed'},lawyer);
  assert.equal(rates.rules.length,6);assert.deepEqual(rates.firmDefault,{rateCents:30000,incrementMinutes:6});

  // Work either side of the client's future rate change; the firm increment rounds 50 minutes up to 54.
  const before=await entry(a,{date:'2026-10-15',description:'Draft discovery requests'}),after=await entry(a,{date:'2026-11-02',description:'Review production'});
  assert.deepEqual([before.rateCents,before.billedMinutes,before.amountCents,before.rateSource],[25000,54,22500,'rule']);
  assert.deepEqual([after.rateCents,after.billedMinutes,after.amountCents,after.rateSource],[27500,54,24750,'rule']);
  // The client agreement applies to the client's other matters; other clients use the firm default.
  assert.equal((await entry(sibling,{date:'2026-10-15'})).amountCents,22500);
  const firmDefault=await entry(other,{date:'2026-10-15'});assert.deepEqual([firmDefault.rateCents,firmDefault.amountCents,firmDefault.rateSource],[30000,27000,'firm-default']);
  // Attorney rate: a firm rule for the timekeeper beats the firm default, a matter rule for them beats the client's.
  assert.equal((await entry(other,{date:'2026-10-15'},lawyer)).rateCents,40000);
  // Task rate with a 15-minute increment and a 10% discount; nonbillable task work is recorded, never billed.
  const pleading=await entry(a,{date:'2026-10-15',description:'Answer',utbmsTask:'L210'});assert.deepEqual([pleading.rateCents,pleading.billedMinutes,pleading.discountBps,pleading.amountCents],[20000,60,1000,18000]);
  const assessment=await entry(a,{date:'2026-10-15',description:'Case assessment',minutes:30,utbmsTask:'L100'});assert.equal(assessment.billable,false);
  // An explicit hourly rate is still recorded exactly as entered (SAT-004 door).
  const explicit=await entry(a,{date:'2026-10-15',description:'Agreed flat call',minutes:90,rateCents:25000});assert.deepEqual([explicit.billedMinutes,explicit.amountCents,explicit.rateSource],[90,37500,'entry']);

  // Issue a bill, then change the rate retroactively: recorded work and the issued bill keep their price.
  let bill=await h.json('/matters/'+a.id+'/bills',{title:'October services',date:'2026-10-31',entryIds:[before.id,pleading.id]},h.owner);
  const line=id=>bill.snapshot.lines.find(l=>l.sourceId===id);assert.match(line(before.id).rounding,/^54 billed minutes \(50 worked, rounded up to the agreed increment\)/);assert.match(line(pleading.id).rounding,/less 10% discount/);assert.equal(bill.snapshot.totalCents,40500);
  bill=await h.json('/bills/'+bill.id+'/approve',{...({revision:bill.revision,reviewNote:'Rates match the engagement letter'}),taxReviewId:await exemptTaxReview(h,'/bills/'+bill.id+'/approve')},h.owner);
  const issued=await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text();
  await rate(a,{scope:'client',effectiveFrom:'2026-10-01',rateCents:26000,note:'Amended engagement letter'});
  const billing=await h.json('/matters/'+a.id+'/billing',undefined,h.owner);
  assert.deepEqual(billing.entries.find(e=>e.id===before.id),{...before,reservedBy:bill.id});assert.deepEqual(billing.bills.find(b=>b.id===bill.id).snapshot,bill.snapshot);
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text(),issued);
  assert.equal((await entry(a,{date:'2026-10-16',description:'Later October work'})).amountCents,23400);

  // Budget: $1,600 with an alert at 80%. Used = every billable entry's recorded cents.
  rates=await h.json('/matters/'+a.id+'/budget',{cents:160000,alertPercent:80,note:'Client approved budget'},lawyer);
  assert.deepEqual([rates.budget.usedCents,rates.budget.remainingCents,rates.alerts.length],[126150,33850,0]);
  const crossing=await entry(a,{date:'2026-10-16',description:'Associate research',minutes:30},lawyer);assert.deepEqual([crossing.rateCents,crossing.amountCents],[35000,17500]);
  rates=await h.json('/matters/'+a.id+'/rates',undefined,lawyer);assert.deepEqual(rates.alerts.map(x=>[x.level,x.usedCents,x.budgetCents,x.entryId]),[['threshold',143650,160000,crossing.id]]);
  // Timesheet drafts are priced by the agreement on their work date; posting freezes the price and crosses the budget.
  let sheet=await h.json('/time/drafts',{matterId:a.id,date:'2026-11-03',minutes:60,description:'Trial preparation',billable:true},h.owner);
  const draft=sheet.days.find(d=>d.date==='2026-11-03').drafts[0];assert.deepEqual([draft.rateCents,draft.billedMinutes,draft.amountCents,draft.rateSource],[27500,60,27500,'rule']);
  sheet=await h.json('/time/post',{from:'2026-11-03',to:'2026-11-03'},h.owner);const posted=sheet.days.find(d=>d.date==='2026-11-03').drafts[0];
  rates=await h.json('/matters/'+a.id+'/rates',undefined,h.owner);assert.deepEqual(rates.alerts.map(x=>[x.level,x.usedCents,x.entryId]),[['threshold',143650,crossing.id],['exceeded',171150,posted.entryId]]);
  await entry(a,{date:'2026-11-04',minutes:6});assert.equal((await h.json('/matters/'+a.id+'/rates',undefined,h.owner)).alerts.length,2,'Each level alerts once per budget version');
  rates=await h.json('/matters/'+a.id+'/budget',{cents:250000,alertPercent:90,note:'Budget increase approved'},h.owner);assert.deepEqual([rates.budget.version,rates.alerts.length,rates.budgetHistory.length],[2,2,2]);
  await h.json('/matters/'+sibling.id+'/rates',undefined,lawyer,404);

  const audit=await h.json('/audit?matterId='+a.id,undefined,h.owner);for(const action of ['rate.rule_added','budget.set'])assert.ok(audit.records.some(r=>r.action===action),action);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json('/matters/'+a.id+'/rates',undefined,restored.owner),rates);
 }finally{await restored?.close();await h.close();}
});
