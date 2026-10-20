import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {readXml,xmlProfile} from './ledes-xml-reader.mjs';
const terms=(extra={})=>({title:'Monthly counsel',kind:'flat',recurrence:'monthly',startDate:'2026-08-01',endDate:'2026-09-30',earning:'period_end',trustDraw:'permitted',amountCents:30000,includedWork:'Monthly employment advice and client conference',exceptions:'none',reference:'Counsel-reviewed engagement section 4',reviewed:true,...extra});
const approve=(b,extra={})=>({revision:b.revision,reviewNote:'Exact fee and terms reviewed',earnedConfirmed:true,earningEvidence:'Source conference notes and agreed period completed',...extra});
async function work(h,m,minutes=60,rateCents=30000){return h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-09-10',description:'Reviewed legal advice',minutes,rateCents},h.owner);}
async function bill(h,m,entries,extra={}){return h.json('/matters/'+m.id+'/bills',{title:'Reviewed services',date:'2026-09-30',entryIds:entries.map(e=>e.id),...extra},h.owner);}
test('TIME-004 monthly flat and retainer schedules and milestone fees: once per period across restart, drafts earn nothing, reviewed earning and draw-down, immutable archive',async()=>{
 const h=await harness();try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const f=await foundation(h),path='/matters/'+f.m.id;
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:200000,statementDate:'2026-08-01',documentId:f.source.id,note:'Client advance remains trust property'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Statement reconciled'},h.owner);
  await h.json(path+'/fee-plans',terms({earning:'unknown'}),h.owner,422);
  await h.json(path+'/fee-plans',terms({trustDraw:'unknown'}),h.owner,422);
  await h.json(path+'/fee-plans',terms({reviewed:false}),h.owner,422);
  await h.json(path+'/fee-plans',terms({startDate:'2026-08-02'}),h.owner,400);
  const p=await h.json(path+'/fee-plans',terms(),h.owner);
  const milestone=await h.json(path+'/fee-plans',terms({title:'Demand milestone',kind:'milestone',recurrence:'once',startDate:'2026-09-15',endDate:'2026-09-15',earning:'milestone',amountCents:50000,trustDraw:'prohibited'}),h.owner);
  await h.json(path+'/fee-plans',terms({title:'Ongoing retainer',kind:'retainer',amountCents:10000}),h.owner);
  await h.scheduled('2026-09-01T00:00:00Z');assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.length,2,'Firm-local August 31 has no September drafts or milestone');
  await h.scheduled('2026-10-01T12:00:00Z');await h.restart();await h.scheduled('2026-10-01T12:15:00Z');
  const first=await h.json(path+'/fee-plans/run',{asOf:'2026-10-01'},h.owner),second=await h.json(path+'/fee-plans/run',{asOf:'2026-10-01'},h.owner);
  assert.equal(first.bills.length,5);assert.deepEqual(first.bills.map(b=>b.id).sort(),second.bills.map(b=>b.id).sort());
  const state=await h.json(path+'/billing',undefined,h.owner);assert.equal(state.bills.length,5);assert.ok(state.bills.every(b=>b.status==='draft'&&b.trustPayment.earned_cents===0));assert.equal(state.bills.reduce((n,b)=>n+b.snapshot.totalCents,0),130000);
  assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).balance_cents,200000);
  let b=first.bills.find(b=>b.snapshot.feePlan.id===p.id);await h.json('/bills/'+b.id+'/approve',{revision:b.revision,reviewNote:'Not reviewed earning'},h.owner,422);
  await h.json('/trust/transfers',{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'draft-refused'},h.owner,409);
  b=await h.json('/bills/'+b.id+'/approve',approve(b),h.owner);
  const transfer=await h.json('/trust/transfers',{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'earned-fee-application'},h.owner);assert.equal(transfer.cents,30000);
  await h.json('/trust/transfers/'+transfer.id+'/decide',{revision:transfer.revision,decision:'approved',reviewNote:'Reviewed event and exact permitted retainer draw'},h.owner);
  for(const outcome of ['submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/bank-result',{revision:transfer.revision,outcome,bankDate:'2026-10-01',bankReference:'FEE-300',documentId:f.source.id,evidence:'Bank confirms exact earned fee transfer'},h.owner);
  const funds=(await h.json(path+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).trustPayment;assert.deepEqual([funds.earned_cents,funds.paid_cents,funds.due_cents],[30000,30000,0]);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).balance_cents,170000);
  let ms=first.bills.find(b=>b.snapshot.feePlan.id===milestone.id);await h.json('/bills/'+ms.id+'/approve',approve(ms),h.owner,422);ms=await h.json('/bills/'+ms.id+'/approve',approve(ms,{milestoneCompleted:true}),h.owner);
  const refusal=await h.json('/trust/transfers',{billId:ms.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'not-authorized'},h.owner,422);assert.match(refusal.error,/prohibit.*draw-down/);
  assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.find(b=>b.id===ms.id).trustPayment.earned_cents,50000);
  const future=await h.json(path+'/fee-plans',terms({title:'Future period',startDate:'2099-01-01',endDate:'2099-01-31'}),h.owner);const fb=(await h.json(path+'/fee-plans/run',{asOf:'2099-01-01'},h.owner)).bills.find(b=>b.snapshot.feePlan.id===future.id);await h.json('/bills/'+fb.id+'/approve',approve(fb),h.owner,409);
  await h.json('/team',{email:'assistant@example.test',name:'Taylor Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(path+'/access',{email:'assistant@example.test'},h.owner);await h.json(path+'/fee-plans',terms(),assistant,403);await h.json(path+'/fee-plans/run',{asOf:'2026-10-01'},assistant,403);await h.json('/bills/'+fb.id+'/approve',approve(fb),assistant,403);
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=fee.terms_reviewed',undefined,h.owner);const reviewed=audit.records.find(a=>a.objectId===p.id);assert.equal(reviewed.matterId,f.m.id);assert.equal(reviewed.revision,p.id);assert.equal(reviewed.actor.role,'owner');assert.equal(JSON.parse(reviewed.evidence.record.terms).reference,p.reference);const earning=await h.json('/audit?matterId='+f.m.id+'&action=fee.earning_reviewed',undefined,h.owner);assert.equal(earning.records.find(a=>a.objectId===b.id).evidence.record.earned_cents,30000);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json(path+'/fee-plans',undefined,target.owner),await h.json(path+'/fee-plans',undefined,h.owner));assert.deepEqual((await target.json(path+'/billing',undefined,target.owner)).bills.map(b=>[b.id,b.snapshot,b.trustPayment]),(await h.json(path+'/billing',undefined,h.owner)).bills.map(b=>[b.id,b.snapshot,b.trustPayment]));}finally{await target.close();}
 }finally{await h.close();}
});
test('TIME-004 capped and blended reviewed work, explicit exceptions, reservation and corrections prevent over-cap or duplicate billing',async()=>{
 const h=await harness();try{
  const m=await open(h),p=await h.json('/matters/'+m.id+'/fee-plans',terms({kind:'capped',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30',earning:'on_approval',amountCents:45000}),h.owner);
  const a=await work(h,m),b=await work(h,m);await h.json('/matters/'+m.id+'/bills',{title:'Missing cap review',date:'2026-09-30',entryIds:[a.id]},h.owner,422);
  let first=await bill(h,m,[a],{feePlanId:p.id}),second=await bill(h,m,[b],{feePlanId:p.id});assert.deepEqual([first.snapshot.totalCents,second.snapshot.totalCents],[30000,15000]);
  await h.json('/matters/'+m.id+'/bills',{title:'Duplicate',date:'2026-09-30',entryIds:[a.id],feePlanId:p.id},h.owner,409);
  first=await h.json('/bills/'+first.id+'/approve',approve(first),h.owner);await h.request('/api/satchel/bills/'+first.id+'/export',undefined,h.owner);first=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===first.id);
  await h.json('/bills/'+first.id+'/correct',{revision:first.revision,sourceId:a.id,correctedAmountCents:50000,reason:'Exceed cap without permitted exception',date:'2026-09-30'},h.owner,422);
  const c=await work(h,m);const zero=await bill(h,m,[c],{feePlanId:p.id});assert.equal(zero.snapshot.totalCents,0);
  const d=await work(h,m);await h.json('/matters/'+m.id+'/bills',{title:'Unauthorized exception',date:'2026-09-30',entryIds:[d.id],feePlanId:p.id,exceptionReason:'Invented waiver'},h.owner,422);
  const blended=await open(h,'Blended matter','Pine Client','Oak Company'),bp=await h.json('/matters/'+blended.id+'/fee-plans',terms({kind:'blended',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30',earning:'on_approval',amountCents:20001,exceptions:'Counsel may separately approve trial work at recorded hourly rates'}),h.owner);
  const e=await work(h,blended,17,99000);const bb=await bill(h,blended,[e],{feePlanId:bp.id});assert.equal(bb.snapshot.totalCents,5667);assert.equal(bb.snapshot.lines[0].rateCents,20001);
  const ex=await work(h,blended,60,33000);const eb=await bill(h,blended,[ex],{feePlanId:bp.id,exceptionReason:'Signed trial addendum section 7, counsel reviewed'});assert.equal(eb.snapshot.totalCents,33000);assert.match(eb.snapshot.exception,/addendum/);
  await h.json('/matters/'+blended.id+'/fee-plans',terms({kind:'capped',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30'}),h.owner,409);
 }finally{await h.close();}
});
test('TIME-004 and inherited TIME-007 nonhourly fees need actual fee codes, export as fees with one unit and retain original LEDES/XML bytes through correction',async()=>{
 const h=await harness();try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const m=await open(h),path='/matters/'+m.id;
  for(const [kind,code] of [['task','L110'],['activity','A101']])await h.json('/ledes/codes',{kind,code,label:'Counsel approved code'},h.owner);
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Principal, Pat',classification:'PT'},h.owner);
  await h.json(path+'/ledes-guideline',{clientLedesId:'CLIENT01',lawFirmId:'13-1234567',requireTask:true,requireActivity:true,requireExpense:false,narrativeMin:10,bannedPhrases:[],maxRates:{PT:20000},incrementMinutes:6,note:'Reviewed nonhourly client guideline',xmlProfile},h.owner);
  await h.json(path+'/fee-plans',terms({title:'Missing fee coding',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-01',earning:'on_approval'}),h.owner);
  const failed=await h.json(path+'/fee-plans/run',{asOf:'2026-09-01'},h.owner,422);assert.match(failed.error,/task code.*activity code/);await h.scheduled('2026-10-01T12:00:00Z');assert.match((await h.json(path+'/fee-plans',undefined,h.owner)).errors[0].reason,/task code/);const errors=await h.json('/audit?matterId='+m.id+'&action=fee.schedule_blocked',undefined,h.owner);assert.equal(errors.records[0].actor.channel,'agent');assert.match(errors.records[0].evidence.record.reason,/activity code/);
  const clean=await open(h,'Coded fee','Other coded client','Other adverse'),cp='/matters/'+clean.id;
  await h.json(cp+'/ledes-guideline',{clientLedesId:'CLIENT02',lawFirmId:'13-1234567',requireTask:true,requireActivity:true,requireExpense:false,narrativeMin:10,bannedPhrases:[],maxRates:{PT:20000},incrementMinutes:6,note:'Nonhourly client guideline',xmlProfile},h.owner);
  await h.json(cp+'/fee-plans',terms({recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-01',earning:'on_approval',utbmsTask:'L110',utbmsActivity:'A101'}),h.owner);
  let b=(await h.json(cp+'/fee-plans/run',{asOf:'2026-09-01'},h.owner)).bills[0];b=await h.json('/bills/'+b.id+'/approve',approve(b),h.owner);
  const csv=await(await h.request('/api/satchel/bills/'+b.id+'/ledes',undefined,h.owner)).text(),xml=await(await h.request('/api/satchel/bills/'+b.id+'/ledes-xml',undefined,h.owner)).text();
  const lines=csv.trim().split('\r\n'),keys=lines[1].slice(0,-2).split('|'),line=Object.fromEntries(keys.map((k,i)=>[k,lines[2].slice(0,-2).split('|')[i]]));assert.equal(line['EXP/FEE/INV_ADJ_TYPE'],'F');assert.equal(Number(line.LINE_ITEM_NUMBER_OF_UNITS),1);assert.equal(line.LINE_ITEM_TOTAL,'300.00');assert.equal(line.LINE_ITEM_TASK_CODE,'L110');assert.equal(line.LINE_ITEM_ACTIVITY_CODE,'A101');await readXml(xml);assert.match(xml,/<charge_type>F<\/charge_type>/);
  b=(await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id);
  let correction=await h.json('/bills/'+b.id+'/correct',{revision:b.revision,sourceId:b.snapshot.lines[0].sourceId,correctedAmountCents:25000,reason:'Reviewed courtesy adjustment',date:'2026-09-30'},h.owner);correction=await h.json('/bills/'+correction.id+'/approve',approve(correction),h.owner);
  const replacement=await(await h.request('/api/satchel/bills/'+correction.id+'/ledes-xml',undefined,h.owner)).text();await readXml(replacement);assert.match(replacement,/<inv_total_net_due>250.00<\/inv_total_net_due>/);
  assert.equal(await(await h.request('/api/satchel/bills/'+b.id+'/ledes',undefined,h.owner)).text(),csv);assert.equal(await(await h.request('/api/satchel/bills/'+b.id+'/ledes-xml',undefined,h.owner)).text(),xml);
  assert.equal((await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).trustPayment.earned_cents,25000);
 }finally{await h.close();}
});
