import {settlementExecutionFlow} from './settlement-execution-flow.mjs';
import {settlementBillingFlow} from './settlement-billing-flow.mjs';
import {settlementRetentionFlow} from './settlement-retention-flow.mjs';
import {withTaxAllocation,exemptTaxReview} from './tax-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {readXml,xmlProfile} from './ledes-xml-reader.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';
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
  await h.json('/trust/transfers',await withTaxAllocation(h,{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'draft-refused'}),h.owner,409);
  b=await h.json('/bills/'+b.id+'/approve',{...(approve(b)),taxReviewId:await exemptTaxReview(h,'/bills/'+b.id+'/approve')},h.owner);
  const transfer=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'earned-fee-application'}),h.owner);assert.equal(transfer.cents,30000);
  await h.json('/trust/transfers/'+transfer.id+'/decide',{revision:transfer.revision,decision:'approved',reviewNote:'Reviewed event and exact permitted retainer draw'},h.owner);
  for(const outcome of ['submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/bank-result',{revision:transfer.revision,outcome,bankDate:'2026-10-01',bankReference:'FEE-300',documentId:f.source.id,evidence:'Bank confirms exact earned fee transfer'},h.owner);
  const funds=(await h.json(path+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).trustPayment;assert.deepEqual([funds.earned_cents,funds.paid_cents,funds.due_cents],[30000,30000,0]);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).balance_cents,170000);
  let ms=first.bills.find(b=>b.snapshot.feePlan.id===milestone.id);await h.json('/bills/'+ms.id+'/approve',approve(ms),h.owner,422);ms=await h.json('/bills/'+ms.id+'/approve',{...(approve(ms,{milestoneCompleted:true})),taxReviewId:await exemptTaxReview(h,'/bills/'+ms.id+'/approve')},h.owner);
  const refusal=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:ms.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'not-authorized'}),h.owner,422);assert.match(refusal.error,/prohibit.*draw-down/);
  await h.json('/invoices/'+ms.id+'/void',{revision:ms.revision,reason:'Scheduled nonhourly fees require their own release and rebill workflow'},h.owner,409);
  assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.find(b=>b.id===ms.id).trustPayment.earned_cents,50000);
  const future=await h.json(path+'/fee-plans',terms({title:'Future period',startDate:'2099-01-01',endDate:'2099-01-31'}),h.owner);const fb=(await h.json(path+'/fee-plans/run',{asOf:'2099-01-01'},h.owner)).bills.find(b=>b.snapshot.feePlan.id===future.id);await h.json('/bills/'+fb.id+'/approve',approve(fb),h.owner,409);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sameDay=await h.json(path+'/fee-plans',terms({title:'Current day must finish',recurrence:'once',startDate:today,endDate:today}),h.owner),sameDayBill=(await h.json(path+'/fee-plans/run',{asOf:today},h.owner)).bills.find(b=>b.snapshot.feePlan.id===sameDay.id);
  const boundary=await h.json('/bills/'+sameDayBill.id+'/approve',approve(sameDayBill),h.owner,409);assert.match(boundary.error,/period has not ended/);
  await h.json('/team',{email:'assistant@example.test',name:'Taylor Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(path+'/access',{email:'assistant@example.test'},h.owner);await h.json(path+'/fee-plans',terms(),assistant,403);await h.json(path+'/fee-plans/run',{asOf:'2026-10-01'},assistant,403);await h.json('/bills/'+fb.id+'/approve',approve(fb),assistant,403);
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=fee.terms_reviewed',undefined,h.owner);const reviewed=audit.records.find(a=>a.objectId===p.id);assert.equal(reviewed.matterId,f.m.id);assert.equal(reviewed.revision,p.id);assert.equal(reviewed.actor.role,'owner');assert.equal(JSON.parse(reviewed.evidence.record.terms).reference,p.reference);const earning=await h.json('/audit?matterId='+f.m.id+'&action=fee.earning_reviewed',undefined,h.owner);assert.equal(earning.records.find(a=>a.objectId===b.id).evidence.record.earned_cents,30000);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json(path+'/fee-plans',undefined,target.owner),await h.json(path+'/fee-plans',undefined,h.owner));assert.deepEqual((await target.json(path+'/billing',undefined,target.owner)).bills.map(b=>[b.id,b.snapshot,b.trustPayment]),(await h.json(path+'/billing',undefined,h.owner)).bills.map(b=>[b.id,b.snapshot,b.trustPayment]));}finally{await target.close();}
  // Each scheduled plan must retain its own reviewer's live authority, even
  // when another reviewer has an active plan on the same matter.
  const shared=await open(h,'Shared fee reviewers','Shared client','Shared opponent'),sp='/matters/'+shared.id;
  await h.json('/team',{email:'reviewer@example.test',name:'Morgan Counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'reviewer@example.test'},h.owner);const reviewer=await h.login('reviewer@example.test');await h.json(sp+'/access',{email:'reviewer@example.test'},h.owner);
  const own=await h.json(sp+'/fee-plans',terms({recurrence:'once',amountCents:7100}),h.owner),delegated=await h.json(sp+'/fee-plans',terms({recurrence:'once',amountCents:7200}),reviewer);
  await h.json('/team',{email:'reviewer@example.test',name:'Morgan Counsel',role:'assistant'},h.owner);await h.scheduled('2026-10-01T12:00:00Z');
  assert.deepEqual((await h.json(sp+'/billing',undefined,h.owner)).bills.map(b=>b.snapshot.feePlan.id),[own.id],'An active owner plan cannot supply a downgraded reviewer authority');
  await h.json('/team',{email:'reviewer@example.test',name:'Morgan Counsel',role:'lawyer'},h.owner);await h.json(sp+'/access',{email:'reviewer@example.test',remove:true},h.owner);await h.scheduled('2026-10-01T12:00:00Z');assert.equal((await h.json(sp+'/billing',undefined,h.owner)).bills.length,1,'The reviewer must still see the matter');
  await h.json(sp+'/access',{email:'reviewer@example.test'},h.owner);await h.scheduled('2026-10-01T12:00:00Z');await h.restart();await h.scheduled('2026-10-01T12:15:00Z');
  const mixed=(await h.json(sp+'/billing',undefined,h.owner)).bills;assert.deepEqual(new Set(mixed.map(b=>b.snapshot.feePlan.id)),new Set([own.id,delegated.id]));assert.equal(mixed.find(b=>b.snapshot.feePlan.id===delegated.id).createdBy,'reviewer@example.test');
  const voided=mixed.find(b=>b.snapshot.feePlan.id===own.id);await h.json('/bills/'+voided.id+'/void',{revision:voided.revision,reason:'Unissued occurrence cancelled by counsel'},h.owner);await h.scheduled('2026-10-01T12:30:00Z');assert.equal((await h.json(sp+'/billing',undefined,h.owner)).bills.length,2,'Voiding an occurrence never creates another one');
  const restored=await harness();try{const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);await restored.scheduled('2026-10-01T12:45:00Z');const replay=(await restored.json(sp+'/billing',undefined,restored.owner)).bills;assert.equal(replay.length,2);assert.equal(replay.find(b=>b.id===voided.id).status,'void');}finally{await restored.close();}
 }finally{await h.close();}
});
test('TIME-004 BILL-016 capped and blended reviewed work, exceptions, corrections and append-only void/rebill preserve the cap and prevent duplicate billing',async()=>{
 const h=await harness();try{
  const m=await open(h),p=await h.json('/matters/'+m.id+'/fee-plans',terms({kind:'capped',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30',earning:'on_approval',amountCents:45000}),h.owner);
  const a=await work(h,m),b=await work(h,m);await h.json('/matters/'+m.id+'/bills',{title:'Missing cap review',date:'2026-09-30',entryIds:[a.id]},h.owner,422);
  const expense=await h.json('/matters/'+m.id+'/entries',{kind:'disbursement',date:'2026-09-10',description:'Exact filing disbursement outside time cap',amountCents:1234},h.owner);
  let first=await bill(h,m,[a,expense],{feePlanId:p.id}),second=await bill(h,m,[b],{feePlanId:p.id});assert.deepEqual([first.snapshot.totalCents,second.snapshot.totalCents],[31234,15000]);assert.equal(first.snapshot.lines.find(l=>l.sourceId===expense.id).amountCents,1234);
  await h.json('/matters/'+m.id+'/bills',{title:'Duplicate',date:'2026-09-30',entryIds:[a.id],feePlanId:p.id},h.owner,409);
  first=await h.json('/bills/'+first.id+'/approve',{...(approve(first)),taxReviewId:await exemptTaxReview(h,'/bills/'+first.id+'/approve')},h.owner);const originalCapCsv=await(await h.request('/api/satchel/bills/'+first.id+'/export',undefined,h.owner)).text();first=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===first.id);
  await h.json('/bills/'+first.id+'/correct',{revision:first.revision,sourceId:a.id,correctedAmountCents:50000,reason:'Exceed cap without permitted exception',date:'2026-09-30'},h.owner,422);
  const c=await work(h,m);const zero=await bill(h,m,[c],{feePlanId:p.id});assert.equal(zero.snapshot.totalCents,0);
  const d=await work(h,m);await h.json('/matters/'+m.id+'/bills',{title:'Unauthorized exception',date:'2026-09-30',entryIds:[d.id],feePlanId:p.id,exceptionReason:'Invented waiver'},h.owner,422);
  let reduced=await h.json('/bills/'+first.id+'/correct',{revision:first.revision,sourceId:a.id,correctedAmountCents:25000,reason:'Reviewed courtesy reduction within cap',date:'2026-09-30'},h.owner);reduced=await h.json('/bills/'+reduced.id+'/approve',{...(approve(reduced)),taxReviewId:await exemptTaxReview(h,'/bills/'+reduced.id+'/approve')},h.owner);await h.request('/api/satchel/bills/'+reduced.id+'/export',undefined,h.owner);reduced=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===reduced.id);
  await h.json('/bills/'+reduced.id+'/correct',{revision:reduced.revision,sourceId:a.id,correctedAmountCents:30001,reason:'Cannot restore beyond remaining cap',date:'2026-09-30'},h.owner,422);
  let restored=await h.json('/bills/'+reduced.id+'/correct',{revision:reduced.revision,sourceId:a.id,correctedAmountCents:30000,reason:'Restore the reviewed amount within cap',date:'2026-09-30'},h.owner);assert.equal(restored.snapshot.totalCents,5000);restored=await h.json('/bills/'+restored.id+'/approve',{...(approve(restored)),taxReviewId:await exemptTaxReview(h,'/bills/'+restored.id+'/approve')},h.owner);await h.request('/api/satchel/bills/'+restored.id+'/export',undefined,h.owner);
  await h.json('/bills/'+reduced.id+'/correct',{revision:reduced.revision,sourceId:a.id,correctedAmountCents:30000,reason:'Replay cannot create another restoration',date:'2026-09-30'},h.owner,409);assert.equal(await(await h.request('/api/satchel/bills/'+first.id+'/export',undefined,h.owner)).text(),originalCapCsv);
  const blended=await open(h,'Blended matter','Pine Client','Oak Company'),bp=await h.json('/matters/'+blended.id+'/fee-plans',terms({kind:'blended',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30',earning:'on_approval',amountCents:20001,exceptions:'Counsel may separately approve trial work at recorded hourly rates'}),h.owner);
  const e=await work(h,blended,17,99000);let bb=await bill(h,blended,[e],{feePlanId:bp.id});assert.equal(bb.snapshot.totalCents,5667);assert.equal(bb.snapshot.lines[0].rateCents,20001);bb=await h.json('/bills/'+bb.id+'/approve',{...(approve(bb)),taxReviewId:await exemptTaxReview(h,'/bills/'+bb.id+'/approve')},h.owner);await h.request('/api/satchel/bills/'+bb.id+'/export',undefined,h.owner);bb=(await h.json('/matters/'+blended.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===bb.id);await h.json('/bills/'+bb.id+'/correct',{revision:bb.revision,sourceId:e.id,correctedAmountCents:10000,reason:'Cannot override reviewed blended rate',date:'2026-09-30'},h.owner,422);
  const ex=await work(h,blended,60,33000);const eb=await bill(h,blended,[ex],{feePlanId:bp.id,exceptionReason:'Signed trial addendum section 7, counsel reviewed'});assert.equal(eb.snapshot.totalCents,33000);assert.match(eb.snapshot.exception,/addendum/);
  await h.json('/matters/'+blended.id+'/fee-plans',terms({kind:'capped',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30'}),h.owner,409);
  // BILL-016: the same reviewed original-work void/rebill applies when a cap or
  // blended agreement supplied its price. Neither history nor terms are reset.
  await h.json('/invoice-numbering',scheme(700),h.owner);
  const retained=[];
  for(const kind of ['capped','blended']){
   const fm=await open(h,kind+' invoice replacement',kind+' client',kind+' opponent'),fp='/matters/'+fm.id;
   const plan=await h.json(fp+'/fee-plans',terms({kind,recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-30',earning:'on_approval',amountCents:kind==='capped'?45000:20001}),h.owner);
   const entry=await work(h,fm,kind==='capped'?60:17,kind==='capped'?30000:99000);
   const cost=await h.json(fp+'/entries',{kind:'disbursement',date:'2026-09-10',description:'Recorded filing cost',amountCents:1234},h.owner);
   let original=await bill(h,fm,[entry,cost],{feePlanId:plan.id});
   const expected=kind==='capped'?31234:6901;assert.equal(original.snapshot.totalCents,expected);
   // An independent live bill still consumes its part of the cap after a void.
   if(kind==='capped'){const other=await work(h,fm);assert.equal((await bill(h,fm,[other],{feePlanId:plan.id})).snapshot.totalCents,15000);}
   original=await h.json('/bills/'+original.id+'/approve',{...approve(original),taxReviewId:await exemptTaxReview(h,'/bills/'+original.id+'/approve')},h.owner);
   const issueRequest={bills:[{id:original.id,revision:original.revision}]},issue=(await h.json('/invoices/issue',issueRequest,h.owner)).issues[0];
   const pdf=Buffer.from(await(await h.request('/api/satchel/bills/'+original.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());assert.match(pdf.toString('ascii',0,8),/^%PDF-/);
   const csv=await(await h.request('/api/satchel/bills/'+original.id+'/export',undefined,h.owner)).text();
   original=(await h.json(fp+'/billing',undefined,h.owner)).bills.find(b=>b.id===original.id);
   const payload={revision:original.revision,reason:'Counsel corrects recorded work while retaining the reviewed '+kind+' terms'};
   const voids=await Promise.all([h.json('/invoices/'+original.id+'/void',payload,h.owner),h.json('/invoices/'+original.id+'/void',payload,h.owner)]);assert.deepEqual(voids[0],voids[1]);
   assert.deepEqual(await h.json('/invoices/'+original.id+'/void',payload,h.owner),voids[0]);
   await h.json('/invoices/'+original.id+'/void',{...payload,reason:'A changed request cannot replace the void reason'},h.owner,409);
   const state=await h.json(fp+'/billing',undefined,h.owner),voided=state.bills.find(b=>b.id===original.id);
   assert.equal(voided.status,'void');assert.deepEqual(voided.snapshot,original.snapshot);assert.deepEqual(voided.earningReview,original.earningReview);assert.deepEqual(voided.issue,issue);
   assert.equal(voided.trustPayment.earned_cents,0);assert.equal(voided.trustPayment.due_cents,0);
   for(const source of [entry,cost])assert.equal(state.entries.find(e=>e.id===source.id).reservedBy,null);
   assert.equal((await h.json('/invoices/issue',issueRequest,h.owner)).issues[0].number,issue.number);
   await h.json(fp+'/bills',{title:'Missing terms after void',date:'2026-09-30',entryIds:[entry.id,cost.id]},h.owner,422);
   const released=state.entries.find(e=>e.id===entry.id),edit={revision:released.revision,description:'Corrected '+kind+' work narrative',rateCents:40000,reason:'Counsel corrects the recorded work before repricing under its reviewed plan'};
   await h.json('/entries/'+entry.id+'/edit',edit,h.owner);
   let replacement=await bill(h,fm,[entry,cost],{feePlanId:plan.id});
   assert.equal(replacement.snapshot.totalCents,expected,kind==='capped'?'The other live bill consumes $150 of the $450 cap; rebilling can use only $300 plus the exact expense':'Rebilling retains the reviewed blended rate despite the corrected entry rate');
   assert.equal(replacement.snapshot.lines.find(l=>l.sourceId===entry.id).description,edit.description);assert.deepEqual(replacement.snapshot.feePlan,original.snapshot.feePlan);
   await h.json(fp+'/bills',{title:'Duplicate replacement',date:'2026-09-30',entryIds:[entry.id,cost.id],feePlanId:plan.id},h.owner,409);
   const taxReviewId=await exemptTaxReview(h,'/bills/'+replacement.id+'/approve');
   await h.json('/bills/'+replacement.id+'/approve',{revision:replacement.revision,reviewNote:'An old earning review cannot approve a replacement',taxReviewId},h.owner,422);
   replacement=await h.json('/bills/'+replacement.id+'/approve',{...approve(replacement,{earningEvidence:'Counsel freshly reviewed the corrected work and retained agreement'}),taxReviewId},h.owner);
   const replacementIssue=(await h.json('/invoices/issue',{bills:[{id:replacement.id,revision:replacement.revision}]},h.owner)).issues[0];assert.notEqual(replacementIssue.number,issue.number);
   const final=await h.json(fp+'/billing',undefined,h.owner);
   for(const source of [entry,cost]){assert.equal(final.entries.find(e=>e.id===source.id).reservedBy,replacement.id);assert.equal(final.bills.filter(b=>b.status!=='void'&&b.snapshot.lines.some(l=>l.sourceId===source.id)).length,1);}
   assert.equal(final.entries.find(e=>e.id===entry.id).editHistory.length,1);assert.equal(final.bills.find(b=>b.id===replacement.id).trustPayment.earned_cents,expected);
   const replacementPdf=Buffer.from(await(await h.request('/api/satchel/bills/'+replacement.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());assert.notDeepEqual(replacementPdf,pdf);
   assert.equal((await h.json(fp+'/fee-plans',undefined,h.owner)).plans.length,1);
   retained.push({fp,original,payload,voidRecord:voids[0],csv,pdf,replacementId:replacement.id,replacementPdf,state:final});
  }
  await h.restart();
  const target=await harness();try{
   const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
   for(const source of [h,target])for(const r of retained){
    assert.deepEqual(await source.json(r.fp+'/billing',undefined,source.owner),r.state,'Capped/blended snapshots, earnings, source reservations, edits, void journal and new numbers survive recovery');
    assert.deepEqual(await source.json('/invoices/'+r.original.id+'/void',r.payload,source.owner),r.voidRecord);
    assert.equal(await(await source.request('/api/satchel/bills/'+r.original.id+'/export',undefined,source.owner)).text(),r.csv);
    assert.deepEqual(Buffer.from(await(await source.request('/api/satchel/bills/'+r.original.id+'/invoice.pdf',undefined,source.owner)).arrayBuffer()),r.pdf);
    assert.deepEqual(Buffer.from(await(await source.request('/api/satchel/bills/'+r.replacementId+'/invoice.pdf',undefined,source.owner)).arrayBuffer()),r.replacementPdf);
   }
  }finally{await target.close();}

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
  const surviving=await h.json(path+'/fee-plans',terms({title:'Valid plan beside a blocked plan',recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-01',earning:'on_approval',utbmsTask:'L110',utbmsActivity:'A101'}),h.owner);await h.scheduled('2026-10-01T12:15:00Z');assert.deepEqual((await h.json(path+'/billing',undefined,h.owner)).bills.map(b=>b.snapshot.feePlan.id),[surviving.id],'A blocked plan does not starve another plan on the same matter');
  const clean=await open(h,'Coded fee','Other coded client','Other adverse'),cp='/matters/'+clean.id;
  await h.json(cp+'/ledes-guideline',{clientLedesId:'CLIENT02',lawFirmId:'13-1234567',requireTask:true,requireActivity:true,requireExpense:false,narrativeMin:10,bannedPhrases:[],maxRates:{PT:20000},incrementMinutes:6,note:'Nonhourly client guideline',xmlProfile},h.owner);
  await h.json(cp+'/fee-plans',terms({recurrence:'once',startDate:'2026-09-01',endDate:'2026-09-01',earning:'on_approval',utbmsTask:'L110',utbmsActivity:'A101'}),h.owner);
  let b=(await h.json(cp+'/fee-plans/run',{asOf:'2026-09-01'},h.owner)).bills[0];b=await h.json('/bills/'+b.id+'/approve',{...(approve(b)),taxReviewId:await exemptTaxReview(h,'/bills/'+b.id+'/approve')},h.owner);
  const csv=await(await h.request('/api/satchel/bills/'+b.id+'/ledes',undefined,h.owner)).text(),xml=await(await h.request('/api/satchel/bills/'+b.id+'/ledes-xml',undefined,h.owner)).text();
  const lines=csv.trim().split('\r\n'),keys=lines[1].slice(0,-2).split('|'),line=Object.fromEntries(keys.map((k,i)=>[k,lines[2].slice(0,-2).split('|')[i]]));assert.equal(line['EXP/FEE/INV_ADJ_TYPE'],'F');assert.equal(Number(line.LINE_ITEM_NUMBER_OF_UNITS),1);assert.equal(line.LINE_ITEM_TOTAL,'300.00');assert.equal(line.LINE_ITEM_TASK_CODE,'L110');assert.equal(line.LINE_ITEM_ACTIVITY_CODE,'A101');await readXml(xml);assert.match(xml,/<charge_type>F<\/charge_type>/);
  b=(await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id);
  await h.json('/bills/'+b.id+'/correct',{revision:b.revision,sourceId:b.snapshot.lines[0].sourceId,correctedAmountCents:35000,reason:'Cannot override reviewed flat price',date:'2026-09-30'},h.owner,422);
  let correction=await h.json('/bills/'+b.id+'/correct',{revision:b.revision,sourceId:b.snapshot.lines[0].sourceId,correctedAmountCents:25000,reason:'Reviewed courtesy adjustment',date:'2026-09-30'},h.owner);correction=await h.json('/bills/'+correction.id+'/approve',{...(approve(correction)),taxReviewId:await exemptTaxReview(h,'/bills/'+correction.id+'/approve')},h.owner);
  const replacement=await(await h.request('/api/satchel/bills/'+correction.id+'/ledes-xml',undefined,h.owner)).text();await readXml(replacement);assert.match(replacement,/<inv_total_net_due>250.00<\/inv_total_net_due>/);
  assert.equal(await(await h.request('/api/satchel/bills/'+b.id+'/ledes',undefined,h.owner)).text(),csv);assert.equal(await(await h.request('/api/satchel/bills/'+b.id+'/ledes-xml',undefined,h.owner)).text(),xml);
  assert.equal((await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).trustPayment.earned_cents,25000);
  correction=(await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===correction.id);
  const restoreBody={revision:correction.revision,sourceId:b.snapshot.lines[0].sourceId,correctedAmountCents:30000,reason:'Restore the original reviewed flat fee',date:'2026-09-30'};await h.json('/bills/'+correction.id+'/correct',{...restoreBody,correctedAmountCents:30001},h.owner,422);
  let restored=await h.json('/bills/'+correction.id+'/correct',restoreBody,h.owner);assert.equal(restored.snapshot.totalCents,5000);restored=await h.json('/bills/'+restored.id+'/approve',{...(approve(restored)),taxReviewId:await exemptTaxReview(h,'/bills/'+restored.id+'/approve')},h.owner);const restoredXml=await(await h.request('/api/satchel/bills/'+restored.id+'/ledes-xml',undefined,h.owner)).text();await readXml(restoredXml);assert.match(restoredXml,/<inv_total_net_due>300.00<\/inv_total_net_due>/);
  await h.json('/bills/'+correction.id+'/correct',restoreBody,h.owner,409);assert.equal(await(await h.request('/api/satchel/bills/'+correction.id+'/ledes-xml',undefined,h.owner)).text(),replacement);assert.equal(await(await h.request('/api/satchel/bills/'+b.id+'/ledes-xml',undefined,h.owner)).text(),xml);assert.equal((await h.json(cp+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id).trustPayment.earned_cents,30000);

 }finally{await h.close();}
});

test('Settlement statements reconcile recovery and refuse spending without current approvals and cleared funds',async()=>{
 const h=await harness();try{
  const f=await foundation(h),p='/matters/'+f.m.id+'/settlements';
  await h.json('/team',{email:'counsel@example.test',name:'Case Counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'counsel@example.test'},h.owner);const counsel=await h.login('counsel@example.test');await h.json('/matters/'+f.m.id+'/access',{email:'counsel@example.test'},h.owner);
  const terms={previousVersion:0,reviewed:true,feeBasis:'after_expenses',reference:'Signed contingency agreement section 4',earningEvidence:'Executed settlement release and recovered funds',outcomes:[{name:'Pretrial',bps:2500},{name:'Trial',bps:4000}]};
  await h.json(p+'/terms',{...terms,reviewed:false},counsel,422);await h.json(p+'/terms',{...terms,feeBasis:'unknown'},counsel,422);
  const t=await h.json(p+'/terms',terms,counsel);await h.json(p+'/terms',terms,counsel,409);
  const body={previousVersion:0,termsId:t.id,outcome:'Pretrial',grossCents:1000000,reference:'Recovery agreement exhibit A',earnedConfirmed:true,earningEvidence:'Release executed, source release paragraph 3',allocations:[{kind:'expense',payee:'Firm advanced filing costs',originalCents:100000,reductionCents:0,reference:'Cost receipts 1 through 4'},{kind:'lien',payee:'Health lien holder',originalCents:200000,reductionCents:50000,reference:'Signed reduction agreement'},{kind:'medical',payee:'Medical clinic',originalCents:50000,reductionCents:10000,reference:'Provider final account'}],referrals:[{payee:'Referring counsel',bps:2000,reference:'Counsel reviewed referral agreement'}]};
  await h.json(p+'/statements',{...body,earnedConfirmed:false},counsel,422);await h.json(p+'/statements',{...body,outcome:'Unknown'},counsel,422);await h.json(p+'/statements',{...body,grossCents:1000},counsel,422);await h.json(p+'/statements',{...body,referrals:[{...body.referrals[0],bps:10001}]},counsel,400);
  const s=await h.json(p+'/statements',body,counsel);assert.equal(s.snapshot.grossCents,1000000);assert.equal(s.snapshot.feeBaseCents,900000);assert.equal(s.snapshot.feeCents,225000);assert.equal(s.snapshot.expensesCents,100000);
  assert.deepEqual(s.snapshot.allocations.map(r=>[r.kind,r.amountCents]),[['expense',100000],['lien',150000],['medical',40000],['referral',45000],['counsel',180000],['client',485000]]);
  assert.equal(s.snapshot.allocations.reduce((n,r)=>n+r.amountCents,0),1000000);assert.equal(s.snapshot.allocations[1].reductionCents,50000);
  assert.deepEqual(s.snapshot.allocations.slice(0,3),[
   {kind:'expense',payee:'Firm advanced filing costs',originalCents:100000,reductionCents:0,amountCents:100000,reference:'Cost receipts 1 through 4'},
   {kind:'lien',payee:'Health lien holder',originalCents:200000,reductionCents:50000,amountCents:150000,reference:'Signed reduction agreement'},
   {kind:'medical',payee:'Medical clinic',originalCents:50000,reductionCents:10000,amountCents:40000,reference:'Provider final account'},
  ],'The restricted statement preserves each original obligation, reduction and source beside the net allocation');
  const check={statementId:s.id,ledgerId:f.ledger.id};await h.json(p+'/check-funds',check,h.owner,409);
  await h.json(p+'/approve',{statementId:s.id,capacity:'finance',note:'Unauthorized counsel cannot approve finance'},counsel,403);
  await h.json(p+'/approve',{statementId:s.id,capacity:'counsel',note:'Exact statement and earning reviewed'},counsel);
  await h.json(p+'/approve',{statementId:s.id,capacity:'finance',note:'Exact recovery and allocations reviewed'},h.owner);
  await h.json(p+'/check-funds',check,h.owner,409);
  const receipt=await h.json('/trust/transactions',{accountId:f.account.id,ledgerId:f.ledger.id,direction:'receipt',kind:'wire',cents:1000000,counterparty:'Recovery payer',bankReference:'synthetic-satchel-928',receivedDate:'2026-09-01',depositDate:'2026-09-01',documentId:f.source.id,purpose:'Settlement recovery',requestKey:'synthetic-satchel-928'},h.owner);
  await h.json('/trust/transactions/'+receipt.id+'/decide',{revision:receipt.revision,decision:'approved',reviewNote:'Recorded bank receipt, not yet cleared'},h.owner);await h.json(p+'/check-funds',check,h.owner,409);
  const entry=(await h.json('/trust',undefined,h.owner)).entries.find(e=>e.source_id===receipt.id);await h.json('/trust/entries/'+entry.id+'/clear',{clearedDate:'2026-09-02',bankReference:'Cleared bank receipt 928',documentId:f.source.id},h.owner);
  await h.json(p+'/check-funds',{...check,ledgerId:f.otherLedger.id},h.owner,409);
  const before=await h.json('/trust',undefined,h.owner),ready=await h.json(p+'/check-funds',check,h.owner);assert.equal(ready.moneyMoved,false);assert.equal(ready.reserved,false);assert.equal(ready.availableCents,1000000);assert.equal((await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).bills.length,0);assert.deepEqual(await h.json('/trust',undefined,h.owner),before);
  await h.json('/matters/'+f.m.id+'/access',{email:'counsel@example.test',remove:true},h.owner);await h.json(p+'/check-funds',check,h.owner,404);await h.json('/matters/'+f.m.id+'/access',{email:'counsel@example.test'},h.owner);
  const pending=await h.json('/trust/transactions',{accountId:f.account.id,ledgerId:f.ledger.id,direction:'disbursement',kind:'wire',cents:150000,counterparty:'Health lien holder',bankReference:'synthetic-satchel-pending',receivedDate:'2026-09-02',depositDate:'2026-09-02',documentId:f.source.id,purpose:'Exact reduced lien allocation awaiting final review',requestKey:'synthetic-satchel-pending',settlement:{statementId:s.id,allocationIndex:1}},h.owner);
  const pendingState=await h.json(p,undefined,h.owner),pendingTrust=await h.json('/trust',undefined,h.owner);
  assert.equal(pendingState.transactions.length,1);assert.equal(pendingState.transactions[0].decision,null);
  assert.equal(pendingState.transactions[0].statement_id,s.id);assert.equal(pendingState.transactions[0].cents,150000);
  const refusedReplacement=await h.json(p+'/statements',{...body,previousVersion:1},counsel,409);
  assert.match(refusedReplacement.error,/Decline pending allocations/);
  await h.json(p+'/terms',{...terms,previousVersion:1,feeBasis:'gross'},counsel,409);
  assert.deepEqual(await h.json(p,undefined,h.owner),pendingState,'Refused replacement leaves the exact statement, terms, approvals and pending allocation unchanged');
  assert.deepEqual(await h.json('/trust',undefined,h.owner),pendingTrust,'Refused replacement cannot alter custody or reservations');
  await h.json('/trust/transactions/'+pending.id+'/decide',{revision:pending.revision,decision:'declined',reviewNote:'Decline the pending allocation before reviewing replacement terms'},h.owner);
  const t2=await h.json(p+'/terms',{...terms,previousVersion:1,feeBasis:'gross'},counsel);await h.json(p+'/statements',{...body,previousVersion:1},counsel,409);
  const s2=await h.json(p+'/statements',{...body,previousVersion:1,termsId:t2.id,outcome:'Trial'},counsel);assert.equal(s2.snapshot.feeCents,400000);assert.equal(s2.snapshot.allocations.at(-1).amountCents,310000);await h.json(p+'/approve',{statementId:s.id,capacity:'counsel',note:'Old statement'},counsel,409);await h.json(p+'/check-funds',{...check,statementId:s2.id},h.owner,409);
  await h.json(p+'/approve',{statementId:s2.id,capacity:'counsel',note:'Principal exact review'},h.owner);await h.json(p+'/approve',{statementId:s2.id,capacity:'finance',note:'Same actor not allowed'},h.owner,403);
  for(const role of ['assistant','billing','accountant']){const email=role+'-settlement@example.test';await h.json('/team',{email,name:role,role},h.owner);await h.json('/team/invite',{email},h.owner);const cookie=await h.login(email);await h.json('/matters/'+f.m.id+'/access',{email},h.owner);await h.json(p,undefined,cookie,403);await h.json(p+'/approve',{statementId:s2.id,capacity:'finance',note:'Denied'},cookie,403);}
  const termsAudit=await h.json('/audit?matterId='+f.m.id+'&action=settlement.terms_reviewed',undefined,h.owner);
  assert.equal(termsAudit.total,2);assert.equal(termsAudit.records.length,2,'Both successful terms reviews have attributable audit records; refusals add none');
  assert.deepEqual(termsAudit.records.map(r=>[r.objectId,r.revision,r.actor.email,r.actor.role,r.actor.channel,r.evidence.context.version]).sort(),[[t.id,'1','counsel@example.test','lawyer','person',1],[t2.id,'2','counsel@example.test','lawyer','person',2]].sort());
  for(const r of termsAudit.records){
   const reviewed=r.objectId===t.id?t:t2;
   assert.equal(r.matterId,f.m.id);assert.ok(r.actor.id&&r.at);assert.equal(r.legacy,false);assert.equal(r.detail,'');
   assert.equal(r.evidence.record.recordType,'s_contingency_terms');assert.equal(r.evidence.record.id,reviewed.id);
   assert.equal(r.evidence.record.version,reviewed.version);assert.equal(r.evidence.record.created_by,'counsel@example.test');assert.equal(r.evidence.record.created_at,reviewed.created_at);
  }
  const state=await h.json(p,undefined,h.owner);assert.equal(state.transactions[0].decision,'declined');assert.equal(state.statements.length,2);assert.deepEqual(state.statements.find(v=>v.id===s.id).snapshot,s.snapshot);assert.equal(state.terms.length,2);
  await h.restart();assert.deepEqual(await h.json(p,undefined,h.owner),state);
  const restored=await harness();try{const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(await restored.json(p,undefined,restored.owner),state);assert.deepEqual(await restored.json('/audit?matterId='+f.m.id+'&action=settlement.terms_reviewed',undefined,restored.owner),termsAudit);}finally{await restored.close();}
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=settlement.approved',undefined,h.owner);assert.equal(audit.records.length,3);assert.deepEqual(audit.records.map(r=>r.evidence.record.version).sort(),[1,1,2]);
  await settlementExecutionFlow();await settlementBillingFlow();await settlementRetentionFlow(h);
 }finally{await h.close();}
});
