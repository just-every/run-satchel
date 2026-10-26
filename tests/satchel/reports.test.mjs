import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {reportFoundation,csvRows,withoutRecordedOutcomes} from './report-fixture.mjs';
test('REPORT-001 seven filtered dashboards drill and export identical permitted rows, retain unknown-practice lead denominators, report explicit outcomes and pause stage duration across closure',async()=>{
 const h=await harness();try{
  const f=await reportFoundation(h),q=new URLSearchParams({practice:'LIT',owner:'lawyer@example.test'}),report=await h.json('/reports?'+q,undefined,f.lawyer),dash=id=>report.dashboards.find(d=>d.id===id);
  assert.equal(report.cohortCount,2);assert.equal(report.dashboards.length,7);
  assert.deepEqual(dash('status').rows.map(r=>[r.matterId,r.status]),[[f.active.id,'open'],[f.closed.id,'closed']]);
  assert.deepEqual(dash('outcomes').rows.map(r=>[r.matterId,r.status,r.detail]),[[f.closed.id,'settled','Settled']]);
  assert.equal(dash('conversion').count,2);assert.equal(dash('conversion').total,1);assert.equal(dash('conversion').rows.filter(r=>r.practiceCode===null).length,1);
  assert.deepEqual(dash('evidence').rows.map(r=>[r.matterId,r.detail]),[[f.active.id,'Medical record'],[f.closed.id,'Medical record']]);
  assert.deepEqual(dash('deadlines').rows.map(r=>[r.id,r.detail]),[[f.deadline.id,'Overdue']]);
  assert.deepEqual(new Set(dash('workload').rows.map(r=>r.id)),new Set([f.deadline.id,f.task.id]));
  for(const banned of [f.hidden.id,f.hidden.title,'Restricted enforcement response','Sealed regulator inquiry',f.privateDeadline.id,f.privateDeadline.title,f.superseded.id,f.superseded.title,f.estate.id])assert.ok(!JSON.stringify(report).includes(banned),banned);
  for(const d of report.dashboards){
   assert.equal(d.count,d.rows.length);const response=await h.request('/api/satchel/reports/export?'+q+'&dashboard='+d.id,undefined,f.lawyer);assert.equal(response.status,200);
   const text=await response.text(),csv=csvRows(text);assert.deepEqual(csv.map(r=>r.id),d.rows.map(r=>r.id));assert.equal(csv.length,d.count);
   for(const banned of [f.hidden.id,f.hidden.title,f.privateDeadline.title])assert.ok(!text.includes(banned));
  }
  assert.equal((await h.json('/leads/report',undefined,f.lawyer)).converted,1,'The existing conversion report also excludes the inaccessible converted matter');
  assert.equal(dash('deadlines').overdueCount,1);assert.equal(dash('workload').overdueCount,2);
  const overdueCsv=csvRows(await(await h.request('/api/satchel/reports/export?'+q+'&dashboard=deadlines&view=overdue',undefined,f.lawyer)).text());assert.deepEqual(overdueCsv.map(r=>r.id),[f.deadline.id]);
  const convertedCsv=csvRows(await(await h.request('/api/satchel/reports/export?'+q+'&dashboard=conversion&view=converted',undefined,f.lawyer)).text());assert.equal(convertedCsv.length,dash('conversion').total);assert.ok(convertedCsv.every(r=>r.status==='converted'));
  const ownerReport=await h.json('/reports?'+q,undefined,h.owner);assert.deepEqual(ownerReport.dashboards.find(d=>d.id==='evidence').rows.map(r=>r.matterId),[f.closed.id]);
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:report.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(f.active.opened_at));
  assert.equal((await h.json('/reports?'+q+'&from='+local+'&to='+local,undefined,f.lawyer)).cohortCount,2);
  assert.equal((await h.json('/reports?'+q+'&status=closed',undefined,f.lawyer)).dashboards.find(d=>d.id==='status').count,1);
  assert.equal((await h.json('/reports?practice=__none__',undefined,f.lawyer)).dashboards.find(d=>d.id==='conversion').rows.length,1);
  await h.json('/reports?from=2026-02-30',undefined,f.lawyer,400);await h.json('/reports?from=2026-11-01&to=2026-01-01',undefined,f.lawyer,400);
  await h.json('/reports',undefined,f.assistant,403);await h.json('/reports/export?dashboard=status',undefined,f.assistant,403);

  const legacy=await harness();try{
   const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
   await legacy.json('/restore',{archive:await withoutRecordedOutcomes(archive),confirm:'RESTORE'},legacy.owner);
   const old=await legacy.json('/reports?practice=LIT',undefined,legacy.owner);
   assert.equal(old.dashboards.find(d=>d.id==='outcomes').rows.find(r=>r.matterId===f.closed.id).detail,'Outcome not recorded');
   assert.equal((await legacy.json('/matters/'+f.closed.id+'/lifecycle',undefined,legacy.owner)).outcome,null);
  }finally{await legacy.close();}

  const stage=await h.json('/matters/'+f.closed.id+'/stage',undefined,h.owner),transition=stage.history.find(e=>e.kind==='transition'),life=await h.json('/matters/'+f.closed.id+'/lifecycle',undefined,h.owner),close=life.history.find(e=>e.kind==='closed');
  assert.equal(dash('stages').rows.find(r=>r.matterId===f.closed.id).durationMs,Date.parse(close.at)-Date.parse(transition.at));
  const reopened=await h.json('/matters/'+f.closed.id+'/reopen',{revision:life.revision,reason:'Further settlement implementation',workflows:[],access:[]},h.owner),reopen=reopened.history.find(e=>e.kind==='reopened');
  const after=await h.json('/reports?'+q,undefined,f.lawyer),interval=after.dashboards.find(d=>d.id==='stages').rows.find(r=>r.matterId===f.closed.id);
  assert.equal(interval.durationMs,(Date.parse(close.at)-Date.parse(transition.at))+(Date.parse(after.asOf)-Date.parse(reopen.at)));
  assert.equal(after.dashboards.find(d=>d.id==='outcomes').count,0,'An open matter does not count as a completed legal outcome');
  await h.json('/matters/'+f.active.id+'/access',{email:'lawyer@example.test',remove:true},h.owner);
  const revoked=await h.json('/reports?'+q,undefined,f.lawyer);assert.ok(!JSON.stringify(revoked).includes(f.active.id));assert.ok(!JSON.stringify(revoked).includes('Ellis litigation inquiry'));
  const file=await(await h.request('/api/satchel/reports/export?'+q+'&dashboard=workload',undefined,f.lawyer)).text();assert.ok(!file.includes(f.task.id));
 }finally{await h.close();}
});

import {open} from './harness.mjs';
import {scheme,reviewed} from './invoice-numbering-fixture.mjs';
import {invoiceTemplate} from './invoice-delivery-fixture.mjs';
import {foundation} from './trust-fixture.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';
test('Firm economics reconciles current source values, approved staff cost, void and corrected-rate rebilling without duplicate realization',async()=>{
 const h=await harness();let restored;
 try{
  await h.json('/invoice-numbering',scheme(),h.owner);
  const f=await foundation(h),m=f.m,base='/matters/'+m.id;
  const template=await h.json('/invoice-templates',invoiceTemplate(null,{includeTrustBalance:false}),h.owner);await h.json(base+'/invoice-template',{templateId:template.id,reason:'Approved economics prebill template'},h.owner);
  const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic economic source',minutes:60,rateCents:20000},h.owner);
  const expense=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-01',description:'Synthetic recorded cost',amountCents:1000},h.owner);
  await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic nonbillable work',minutes:30,rateCents:20000,billable:false},h.owner);
  const read=async()=>{const r=await h.json('/reports/economics',undefined,h.owner);return r.matters.find(x=>x.matterId===m.id);};
  let r=await read();assert.equal(r.unbilledCents,21000);assert.equal(r.billedCents,0);assert.equal(r.utilization,2/3);assert.equal(r.profitCents,null);assert.equal(r.realization,null);
  await h.json('/reports/staff-costs',{email:'owner@example.test',effectiveFrom:'2026-01-01',hourlyCents:6000,reason:'Synthetic principal-reviewed loaded staff cost',confirmed:true},h.owner);
  r=await read();assert.equal(r.staffCostCents,9000);assert.equal(r.profitCents,-10000);assert.equal(r.source.costBasis.length,2);
  const run=await h.json('/prebill-runs',{title:'Synthetic economics prebill',date:'2026-10-01',items:[{matterId:m.id,payer:m.client,periodStart:'2026-10-01',periodEnd:'2026-10-31',arrangement:'hourly',entryIds:[entry.id,expense.id]}]},h.owner);
  let bill=await h.json('/bills/'+run.bills[0].id+'/review',{revision:run.bills[0].revision,action:'revise',note:'Reviewed courtesy write-down',lines:[{sourceId:entry.id,amountCents:15000}]},h.owner);
  bill=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+bill.id+'/approve'),reviewNote:'Approve exact economics prebill'},h.owner);await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  r=await read();assert.equal(r.billedCents,16000);assert.equal(r.realization,0.75);assert.equal(r.effectiveHourlyCents,15000);assert.equal(r.unbilledCents,0);assert.equal(r.profitCents,6000);assert.equal(r.source.invoices[0].agingBucket,'unknown');
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:5000,statementDate:'2026-10-01',documentId:f.source.id,note:'Synthetic cleared funds'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Reviewed exact opening'},h.owner);
  const transfer=await h.json('/trust/transfers',{billId:bill.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'synthetic-satchel-economics',allocation:{earnedCents:5000,taxCents:0,reference:'Reviewed partial operating allocation'}},h.owner);
  r=await read();assert.equal(r.pendingCents,5000);assert.equal(r.paidCents,0);assert.equal(r.trustCashCents,5000);assert.equal(r.collectionRate,0);
  await h.json('/trust/transfers/'+transfer.id+'/decide',{revision:transfer.revision,decision:'approved',reviewNote:'Approve partial application'},h.owner);
  const bank={revision:transfer.revision,bankDate:'2026-10-02',bankReference:'synthetic-satchel-economics-bank',documentId:f.source.id,evidence:'Synthetic bank evidence'};
  for(const outcome of ['submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome},h.owner);
  r=await read();assert.equal(r.paidCents,5000);assert.equal(r.pendingCents,0);assert.equal(r.trustCashCents,0);assert.equal(r.collectionRate,5000/16000);assert.equal(r.billedCents,16000);
  const reversal=await h.json('/trust/transfers/'+transfer.id+'/reversal',{reason:'Reverse exact partial settlement before correction'},h.owner);
  for(const kind of ['approved','submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/reversal/action',{revision:reversal.revision,kind,note:'Reviewed append-only return of funds',bankDate:'2026-10-03',bankReference:'synthetic-satchel-economics-return',documentId:f.source.id},h.owner);
  r=await read();assert.equal(r.paidCents,0);assert.equal(r.collectionRate,0);assert.equal(r.trustCashCents,5000);
  await h.json('/invoices/'+bill.id+'/void',{revision:bill.revision,reason:'Correct the source rate and rebill once'},h.owner);
  r=await read();assert.equal(r.billedCents,0);assert.equal(r.wipCents,21000);
  const released=(await h.json(base+'/billing',undefined,h.owner)).entries.find(e=>e.id===entry.id);
  await h.json('/entries/'+entry.id+'/edit',{revision:released.revision,reason:'Correct explicitly reviewed hourly rate',rateCents:25000},h.owner);
  let next=await h.json(base+'/bills',{title:'Synthetic corrected-rate rebill',date:'2026-10-02',entryIds:[entry.id,expense.id]},h.owner);next=await reviewed(h,m,next);await h.json('/invoices/issue',{bills:[{id:next.id,revision:next.revision}]},h.owner);
  r=await read();assert.equal(r.billedCents,26000);assert.equal(r.realization,1);assert.equal(r.effectiveHourlyCents,25000);assert.equal(r.source.invoices.length,1);assert.equal(r.source.lines.filter(l=>l.sourceId===entry.id).length,1);assert.equal(r.profitCents,16000);assert.equal(r.collectionRate,0);assert.equal(r.pendingCents,0);assert.equal(r.trustCashCents,5000);
  const exported=await h.request('/api/satchel/reports/economics/export',undefined,h.owner);assert.equal(exported.status,200);const basis=await exported.json();assert.deepEqual(basis.matters.find(x=>x.matterId===m.id),r);assert.match(basis.formulas.realization,/Void invoices contribute zero/);assert.ok(basis.asOf);
  await h.json('/reports/economics?asOf=2026-01-01',undefined,h.owner,422);
  await h.json('/team',{email:'economics-lawyer@example.test',name:'Synthetic counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'economics-lawyer@example.test'},h.owner);const lawyer=await h.login('economics-lawyer@example.test');await h.json(base+'/access',{email:'economics-lawyer@example.test'},h.owner);
  await h.json('/reports/economics',undefined,lawyer,403);await h.json('/reports/economics/export',undefined,lawyer,403);await h.json('/reports/staff-costs',{email:'owner@example.test',effectiveFrom:'2026-02-01',hourlyCents:1,confirmed:true,reason:'Refused'},lawyer,403);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);const recovered=await restored.json('/reports/economics',undefined,restored.owner);assert.deepEqual(recovered.matters.find(x=>x.matterId===m.id),r);
 }finally{await restored?.close();await h.close();}
});
