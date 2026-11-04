import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {economicsFoundation,economicsClock} from './economics-fixture.mjs';
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
  await h.json('/reports/economics/export',undefined,h.owner,422);
  const address={line1:'100 Example Street',city:'New York',state:'NY',zip:'10001'};
  await h.json('/firm',{settings:{name:'Synthetic Satchel Counsel',email:'firm@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:20000,incrementMinutes:1,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const template=await h.json('/invoice-templates',invoiceTemplate(null,{includeTrustBalance:false}),h.owner);await h.json(base+'/invoice-template',{templateId:template.id,reason:'Approved economics prebill template'},h.owner);
  const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic economic source',minutes:60,rateCents:20000},h.owner);
  const expense=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-01',description:'Synthetic recorded cost',amountCents:1000},h.owner);
  await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic nonbillable work',minutes:30,rateCents:20000,billable:false},h.owner);
  const read=async()=>{const r=await h.json('/reports/economics',undefined,h.owner);return r.matters.find(x=>x.matterId===m.id);};
  let r=await read();assert.equal(r.unbilledCents,21000);assert.equal(r.billedCents,0);assert.equal(r.utilization,2/3);assert.equal(r.profitCents,null);assert.equal(r.realization,null);
  const costInput={email:'owner@example.test',effectiveFrom:'2026-01-01',hourlyCents:6000,reason:'Synthetic principal-reviewed loaded staff cost'};
  const draft=await h.json('/reports/staff-costs/drafts',costInput,h.owner);
  assert.equal(draft.approvedAt,null);assert.equal((await read()).profitCents,null,'A saved cost is not an approved cost');
  await h.json('/reports/staff-costs/'+draft.id+'/approve',{revision:'synthetic-satchel-stale',confirmed:true},h.owner,409);
  const firstCost=await h.json('/reports/staff-costs/'+draft.id+'/approve',{revision:draft.revision,confirmed:true},h.owner);
  assert.equal(firstCost.createdBy,'owner@example.test');assert.equal(firstCost.approvedBy,'owner@example.test');assert.ok(firstCost.approvedAt);
  assert.deepEqual(await h.json('/reports/staff-costs/'+draft.id+'/approve',{revision:draft.revision,confirmed:true},h.owner),firstCost);
  await h.json('/reports/staff-costs',{...costInput,confirmed:true},h.owner,409);
  const zero=await h.json('/reports/staff-costs',{...costInput,effectiveFrom:'2026-10-01',hourlyCents:0,confirmed:true},h.owner);
  r=await read();assert.equal(r.staffCostCents,0);assert.equal(r.profitCents,-1000);assert.ok(r.source.costBasis.every(c=>c.approvalId===zero.id&&c.hourlyCents===0));
  const replacement=await h.json('/reports/staff-costs/drafts',{...costInput,effectiveFrom:'2026-10-01',supersedesId:zero.id},h.owner);
  const competing=await h.json('/reports/staff-costs/drafts',{...costInput,effectiveFrom:'2026-10-01',supersedesId:zero.id,hourlyCents:7000},h.owner);
  assert.equal((await read()).staffCostCents,0,'A superseding draft never changes economics');
  await h.json('/reports/staff-costs/'+replacement.id+'/approve',{revision:replacement.revision,confirmed:true},h.owner);
  await h.json('/reports/staff-costs/'+competing.id+'/approve',{revision:competing.revision,confirmed:true},h.owner,409);
  const future=await h.json('/reports/staff-costs',{...costInput,effectiveFrom:'2026-10-02',hourlyCents:1000,confirmed:true},h.owner);
  assert.ok((await read()).source.costBasis.every(c=>c.approvalId===replacement.id&&c.effectiveFrom==='2026-10-01'),'Work dates select the applicable approved version');
  const history=await h.json('/reports/staff-costs',undefined,h.owner);assert.equal(history.revisions.length,5);assert.equal(history.approved.length,3);assert.ok(!history.approved.some(c=>c.id===zero.id));assert.ok(history.revisions.some(c=>c.id===zero.id&&c.approved_at===zero.approvedAt));

  r=await read();assert.equal(r.staffCostCents,9000);assert.equal(r.profitCents,-10000);assert.equal(r.source.costBasis.length,2);assert.ok(r.source.costBasis.every(c=>c.createdBy==='owner@example.test'&&c.createdAt&&c.approvedAt&&c.basis===costInput.reason));
  const run=await h.json('/prebill-runs',{title:'Synthetic economics prebill',date:'2026-10-01',items:[{matterId:m.id,payer:m.client,periodStart:'2026-10-01',periodEnd:'2026-10-31',arrangement:'hourly',entryIds:[entry.id,expense.id]}]},h.owner);
  let bill=await h.json('/bills/'+run.bills[0].id+'/review',{revision:run.bills[0].revision,action:'revise',note:'Reviewed courtesy write-down',lines:[{sourceId:entry.id,amountCents:15000}]},h.owner);
  bill=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+bill.id+'/approve'),reviewNote:'Approve exact economics prebill'},h.owner);await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  r=await read();assert.equal(r.billedCents,16000);assert.equal(r.realization,0.75);assert.equal(r.effectiveHourlyCents,15000);assert.equal(r.unbilledCents,0);assert.equal(r.profitCents,6000);assert.equal(r.source.invoices[0].agingBucket,'unknown');
  const issuedAsOf=(await h.json('/reports/economics',undefined,h.owner)).asOf;
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:5000,statementDate:'2026-10-01',documentId:f.source.id,note:'Synthetic cleared funds'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Reviewed exact opening'},h.owner);
  const transfer=await h.json('/trust/transfers',{billId:bill.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'synthetic-satchel-economics',allocation:{earnedCents:5000,taxCents:0,reference:'Reviewed partial operating allocation'}},h.owner);
  r=await read();assert.equal(r.pendingCents,5000);assert.equal(r.paidCents,0);assert.equal(r.trustCashCents,5000);assert.equal(r.collectionRate,0);
  await h.json('/trust/transfers/'+transfer.id+'/decide',{revision:transfer.revision,decision:'approved',reviewNote:'Approve partial application'},h.owner);
  const bank={revision:transfer.revision,bankDate:'2026-10-02',bankReference:'synthetic-satchel-economics-bank',documentId:f.source.id,evidence:'Synthetic bank evidence'};
  for(const outcome of ['submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome},h.owner);
  r=await read();assert.equal(r.paidCents,5000);assert.equal(r.pendingCents,0);assert.equal(r.trustCashCents,0);assert.equal(r.collectionRate,5000/16000);assert.equal(r.billedCents,16000);
  const clearedAsOf=(await h.json('/reports/economics',undefined,h.owner)).asOf;
  const reversal=await h.json('/trust/transfers/'+transfer.id+'/reversal',{reason:'Reverse exact partial settlement before correction'},h.owner);
  for(const kind of ['approved','submitted','cleared'])await h.json('/trust/transfers/'+transfer.id+'/reversal/action',{revision:reversal.revision,kind,note:'Reviewed append-only return of funds',bankDate:'2026-10-03',bankReference:'synthetic-satchel-economics-return',documentId:f.source.id},h.owner);
  r=await read();assert.equal(r.paidCents,0);assert.equal(r.collectionRate,0);assert.equal(r.trustCashCents,5000);
  await h.json('/invoices/'+bill.id+'/void',{revision:bill.revision,reason:'Correct the source rate and rebill once'},h.owner);
  r=await read();assert.equal(r.billedCents,0);assert.equal(r.wipCents,21000);
  const released=(await h.json(base+'/billing',undefined,h.owner)).entries.find(e=>e.id===entry.id);
  await h.json('/entries/'+entry.id+'/edit',{revision:released.revision,reason:'Correct explicitly reviewed hourly rate',rateCents:25000},h.owner);
  let next=await h.json(base+'/bills',{title:'Synthetic corrected-rate rebill',date:'2026-10-02',entryIds:[entry.id,expense.id]},h.owner);next=await reviewed(h,m,next);await h.json('/invoices/issue',{bills:[{id:next.id,revision:next.revision}]},h.owner);
  r=await read();assert.equal(r.billedCents,26000);assert.equal(r.realization,1);assert.equal(r.effectiveHourlyCents,25000);assert.equal(r.source.invoices.length,1);assert.equal(r.source.lines.filter(l=>l.sourceId===entry.id).length,1);assert.equal(r.profitCents,16000);assert.equal(r.collectionRate,0);assert.equal(r.pendingCents,0);assert.equal(r.trustCashCents,5000);
  assert.deepEqual(r.metricBasis,{utilization:{numerator:60,denominator:90},realization:{numerator:25000,denominator:25000},collectionRate:{numerator:0,denominator:26000},effectiveHourlyCents:{numerator:1500000,denominator:60}});assert.equal(r.aging.unknown,26000);
  const originalCsv=await(await h.request('/api/satchel/bills/'+next.id+'/export',undefined,h.owner)).text();
  const correctionSource=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===next.id);
  let correction=await h.json('/bills/'+next.id+'/correct',{revision:correctionSource.revision,sourceId:entry.id,correctedAmountCents:20000,reason:'Synthetic additive reduction',date:'2026-10-03'},h.owner);
  correction=await h.json('/bills/'+correction.id+'/approve',{revision:correction.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+correction.id+'/approve'),reviewNote:'Approve exact additive correction'},h.owner);await h.json('/invoices/issue',{bills:[{id:correction.id,revision:correction.revision}]},h.owner);
  r=await read();assert.equal(r.billedCents,21000);assert.equal(r.earnedCents,21000);assert.equal(r.realization,0.8);assert.equal(r.effectiveHourlyCents,20000);assert.equal(r.profitCents,11000);assert.equal(r.source.invoices.length,2);assert.equal(r.source.lines.filter(l=>l.sourceId===entry.id&&l.correction).length,1);assert.equal(r.unbilledCents,0);
  await h.json('/invoices/issue',{bills:[{id:correction.id,revision:correction.revision}]},h.owner);assert.deepEqual(await read(),r);
  assert.equal(await(await h.request('/api/satchel/bills/'+next.id+'/export',undefined,h.owner)).text(),originalCsv);
  const exported=await h.request('/api/satchel/reports/economics/export',undefined,h.owner);assert.equal(exported.status,200);const artifact=await exported.text(),basis=JSON.parse(artifact);assert.deepEqual(basis.matters.find(x=>x.matterId===m.id),r);
  const {createHash}=await import('node:crypto'),sha=value=>createHash('sha256').update(value).digest('hex');
  const {manifest,...payload}=basis;assert.equal(manifest.marking,'CONFIDENTIAL — INTERNAL USE ONLY');assert.equal(manifest.requestedBy.email,'owner@example.test');assert.equal(manifest.generatedAt,basis.asOf);assert.equal(basis.units.money,'USD cents');for(const metric of ['utilization','realization','collectionRate','effectiveHourlyCents']){assert.deepEqual(basis.totals.metricBasis[metric],r.metricBasis[metric]);assert.equal(basis.totals[metric],r[metric]);}assert.deepEqual(manifest.filters,basis.filters);assert.equal(manifest.firm.name,'Synthetic Satchel Counsel');assert.equal(manifest.payloadSha256,sha(JSON.stringify(payload)));assert.equal(exported.headers.get('x-satchel-sha256'),sha(artifact));assert.ok(basis.matters.flatMap(m=>m.source.entries).every(e=>e.revision&&e.workDate));
  const custody=(await h.json('/audit?action=report.economics_exported',undefined,h.owner)).records.find(e=>e.detail.artifactSha256===sha(artifact));assert.ok(custody);assert.equal(custody.actor.email,'owner@example.test');assert.equal(custody.detail.payloadSha256,manifest.payloadSha256);
  const retained=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},h.owner);
  const retainedFile=await h.request(retained.downloadPath,undefined,h.owner);assert.equal(retainedFile.status,200);const retainedBytes=await retainedFile.text();assert.equal(sha(retainedBytes),retained.artifactSha256);assert.equal(JSON.parse(retainedBytes).matters.find(x=>x.matterId===m.id).profitCents,11000);
  assert.ok((await h.json('/reports/economics/exports',undefined,h.owner)).exports.some(e=>e.id===retained.id));
  const retro=await h.json('/reports/staff-costs',{...costInput,effectiveFrom:'2026-10-01',hourlyCents:4000,supersedesId:replacement.id,confirmed:true},h.owner);
  r=await read();assert.equal(r.staffCostCents,6000);assert.equal(r.profitCents,14000);assert.ok(r.source.costBasis.every(c=>c.approvalId===retro.id));assert.equal(JSON.parse(artifact).matters.find(x=>x.matterId===m.id).profitCents,11000,'A retroactive cost does not rewrite an earlier downloaded artifact');
  await h.restart();assert.equal(await(await h.request(retained.downloadPath,undefined,h.owner)).text(),retainedBytes,'A restarted download preserves the original approved cost basis');
  const issuedHistory=(await h.json('/reports/economics?asOf='+encodeURIComponent(issuedAsOf),undefined,h.owner)).matters.find(x=>x.matterId===m.id),clearedHistory=(await h.json('/reports/economics?asOf='+encodeURIComponent(clearedAsOf),undefined,h.owner)).matters.find(x=>x.matterId===m.id);
  assert.equal(issuedHistory.billedCents,16000);assert.equal(issuedHistory.realization,0.75);assert.equal(issuedHistory.profitCents,6000);assert.equal(issuedHistory.paidCents,0);assert.equal(issuedHistory.pendingCents,0);assert.equal(issuedHistory.trustCashCents,0);assert.equal(issuedHistory.source.entries.find(e=>e.sourceId===entry.id).recordedCents,20000);
  assert.equal(clearedHistory.billedCents,16000);assert.equal(clearedHistory.paidCents,5000);assert.equal(clearedHistory.collectionRate,5000/16000);assert.equal(clearedHistory.trustCashCents,0);assert.equal(clearedHistory.source.invoices.length,1);
  const costAudit=(await h.json('/audit?action=report.staff_cost_approved',undefined,h.owner)).records.find(e=>e.objectId===retro.id);assert.equal(costAudit.revision,retro.id);assert.equal(costAudit.evidence.record.hourly_cents,4000);assert.equal(costAudit.evidence.record.approval.approvedBy,'owner@example.test');
assert.match(basis.formulas.realization,/Void invoices contribute zero/);assert.ok(basis.asOf);
  await h.json('/reports/economics?asOf=2026-01-01',undefined,h.owner,422);
  await h.json('/team',{email:'economics-lawyer@example.test',name:'Synthetic counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'economics-lawyer@example.test'},h.owner);const lawyer=await h.login('economics-lawyer@example.test');await h.json(base+'/access',{email:'economics-lawyer@example.test'},h.owner);
  const nonPrincipals={};
  for(const role of ['lawyer','assistant','trust_officer','billing','accountant','client']){
   const email='cost-'+role+'@example.test';await h.json('/team',{email,name:'Synthetic '+role,role},h.owner);await h.json('/team/invite',{email},h.owner);const member=await h.login(email);nonPrincipals[role]=member;
   for(const path of ['/reports/economics','/reports/economics/export','/reports/economics?asOf='+encodeURIComponent(issuedAsOf),'/reports/staff-costs','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,member,403);
   await h.json('/reports/economics/exports',{confirmed:true,filters:{}},member,403);
   await h.json('/reports/staff-costs/drafts',costInput,member,403);await h.json('/reports/staff-costs/'+draft.id+'/approve',{revision:draft.id,confirmed:true},member,403);
  }
  const broadRole=await h.json('/roles',{name:'Synthetic economics manager',permissions:{rates:'all',bank:'full',reports:'firm',contacts:'write',documents:'write',billing:'write',settings:'write'},reason:'Widest ceiling confers no principal authority'},h.owner);
  await h.json('/team',{email:'economics-lawyer@example.test',name:'Synthetic counsel',role:'lawyer',customRoleId:broadRole.id},h.owner);
  await h.json('/reports/staff-costs',undefined,lawyer,403);
  const agent=await h.json('/keys',{label:'Synthetic costing agent'},h.owner);
  for(const path of ['/reports/economics','/reports/economics/export','/reports/staff-costs','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,'',401,{authorization:'Bearer '+agent.key});
  await h.json('/reports/economics',undefined,lawyer,403);await h.json('/reports/economics/export',undefined,lawyer,403);await h.json('/reports/staff-costs',{email:'owner@example.test',effectiveFrom:'2026-02-01',hourlyCents:1,confirmed:true,reason:'Refused'},lawyer,403);
  const auth=async(path,body,cookie=h.owner,status=200)=>{const response=await h.request(path,body,cookie);assert.equal(response.status,status,await response.clone().text());return response.status===204?null:response.json();};
  await auth('/auth/step-up',{action:'owner:transfer'},h.owner,202);
  const stepMail=h.mails.toReversed().find(mail=>mail.to.includes('owner@example.test')),stepToken=(stepMail.text??stepMail.html).match(/token=([^\s"&<]+)/)[1];
  assert.equal((await h.request('/auth/confirm',{token:stepToken},h.owner)).status,303);
  const nativeManager=(await auth('/auth/operators')).find(o=>o.email==='economics-lawyer@example.test');
  await auth('/auth/operator/role',{operatorId:nativeManager.id,role:'owner'});
  const grantedPrincipal=await h.login('economics-lawyer@example.test');
  await h.json('/reports/staff-costs',undefined,grantedPrincipal);await h.json('/reports/economics',undefined,grantedPrincipal);
  const beforeRemoval=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},grantedPrincipal);assert.equal((await h.request(beforeRemoval.downloadPath,undefined,grantedPrincipal)).status,200);
  await auth('/auth/operator/role',{operatorId:nativeManager.id,role:'admin'});
  assert.equal((await h.request(beforeRemoval.downloadPath,undefined,grantedPrincipal)).status,401);
  for(const path of ['/reports/staff-costs','/reports/economics','/reports/economics/export','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,grantedPrincipal,401);
  const administrator=await h.login('economics-lawyer@example.test');await h.json('/reports/staff-costs',undefined,administrator,403);
  await auth('/auth/operator/role',{operatorId:nativeManager.id,role:'owner'});
  const activePrincipal=await h.login('economics-lawyer@example.test');
  const beforeDeactivation=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},activePrincipal);
  await auth('/auth/operator/status',{operatorId:nativeManager.id,status:'inactive'});
  assert.equal((await h.request(beforeDeactivation.downloadPath,undefined,activePrincipal)).status,401);
  for(const path of ['/reports/staff-costs','/reports/economics','/reports/economics/export','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,activePrincipal,401);
  await auth('/auth/operator/status',{operatorId:nativeManager.id,status:'active'});
  const beforeRevoke=await h.login('economics-lawyer@example.test'),nativeSession=await auth('/auth/session',undefined,beforeRevoke);
  const beforeSessionRevoke=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},beforeRevoke);
  await auth('/auth/session/revoke',{sessionId:nativeSession.id},h.owner,204);
  for(const path of ['/reports/staff-costs','/reports/economics','/reports/economics/export','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,beforeRevoke,401);
  assert.equal((await h.request(beforeSessionRevoke.downloadPath,undefined,beforeRevoke)).status,401);
  await auth('/auth/operator/role',{operatorId:nativeManager.id,role:'member'});
  const retainedCosts=await h.json('/reports/staff-costs',undefined,h.owner);assert.equal(retainedCosts.revisions.find(c=>c.id===draft.id).approved_at,firstCost.approvedAt);
  const integration=await h.json('/integrations',{label:'Synthetic economics exclusion',matterIds:[m.id],scopes:['matters:read','finance:read']},h.owner),integrationAuth={authorization:'Bearer '+integration.key};
  for(const path of ['/reports/staff-costs','/reports/economics','/reports/economics/export','/reports/economics/exports','/reports/economics/exports/'+retained.id+'/file'])await h.json(path,undefined,'',401,integrationAuth);
  const noCosts=wire=>{for(const value of [retro.id,costInput.reason,'hourly_cents','costBasis','profitCents'])assert.ok(!JSON.stringify(wire).includes(value),value);};
  noCosts(await h.json('/agent/context',undefined,'',200,{authorization:'Bearer '+agent.key}));
  noCosts(await h.json('/v1/matters/'+m.id+'/finance',undefined,'',200,integrationAuth));
  const costSearch=await h.json('/search?q='+encodeURIComponent(costInput.reason),undefined,nonPrincipals.lawyer);assert.equal(costSearch.total,0);
  await h.json('/saved-reports',{name:'Synthetic forbidden economics export',dashboard:'economics',filters:{}},h.owner,400);
  for(const channel of ['email','portal'])await h.json('/report-schedules',{dashboard:'economics',channel},h.owner,400);
  const uncosted=await open(h,'Synthetic uncosted economics','Synthetic separate client','Synthetic separate adverse');
  const empty=(await h.json('/reports/economics',undefined,h.owner)).matters.find(x=>x.matterId===uncosted.id);assert.equal(empty.utilization,null);assert.equal(empty.realization,null);assert.equal(empty.collectionRate,null);assert.equal(empty.effectiveHourlyCents,null);
  await h.json('/matters/'+uncosted.id+'/access',{email:'cost-lawyer@example.test'},h.owner);
  const missing=await h.json('/matters/'+uncosted.id+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic uncosted source',minutes:30,rateCents:10000},nonPrincipals.lawyer);
  const coverage=await h.json('/reports/economics',undefined,h.owner),uncostedRow=coverage.matters.find(x=>x.matterId===uncosted.id);
  assert.equal(uncostedRow.profitCents,null);assert.deepEqual(uncostedRow.costCoverage.missingSourceIds,[missing.id]);assert.equal(coverage.totals.profitCents,null);assert.equal(coverage.totals.staffCostCents,null);assert.equal(coverage.totals.costCoverage.complete,false);assert.equal(coverage.totals.costCoverage.coveredCostCents,6000);assert.deepEqual(coverage.totals.metricBasis.utilization,{numerator:90,denominator:120});assert.equal(coverage.totals.utilization,0.75);assert.deepEqual(coverage.totals.costCoverage.missingSourceIds,[missing.id]);
  const missingExport=await(await h.request('/api/satchel/reports/economics/export',undefined,h.owner)).json();assert.deepEqual(missingExport.manifest.missingCostSourceIds,[missing.id]);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);const recovered=await restored.json('/reports/economics',undefined,restored.owner);assert.deepEqual(recovered.matters.find(x=>x.matterId===m.id),r);
  assert.equal(await(await restored.request(retained.downloadPath,undefined,restored.owner)).text(),retainedBytes,'Restored retained artifacts remain byte-identical');
  assert.deepEqual(await restored.json('/reports/staff-costs',undefined,restored.owner),await h.json('/reports/staff-costs',undefined,h.owner));
  assert.deepEqual((await restored.json('/audit?action=report.staff_cost_approved',undefined,restored.owner)).records,(await h.json('/audit?action=report.staff_cost_approved',undefined,h.owner)).records);
  await restored.json('/team/invite',{email:'economics-lawyer@example.test'},restored.owner);const custodian=await restored.login('economics-lawyer@example.test');
  await restored.json('/reports/staff-costs',undefined,custodian,403);await restored.json('/reports/economics',undefined,custodian,403);
  await restored.json('/agent/context',undefined,'',401,{authorization:'Bearer '+agent.key});
  assert.deepEqual((await restored.json('/audit?action=report.economics_exported',undefined,restored.owner)).records,(await h.json('/audit?action=report.economics_exported',undefined,h.owner)).records);
  const wall=await restored.json(base+'/wall',{custodianEmail:'economics-lawyer@example.test',members:['owner@example.test'],reason:'Synthetic confidential costing custody',revision:null},restored.owner);
  for(const action of ['report.staff_cost_saved','report.staff_cost_approved','report.economics_exported']){const audit=await restored.json('/audit?action='+action,undefined,custodian);assert.equal(audit.total,0);assert.deepEqual(audit.records,[]);const file=await restored.request('/api/satchel/audit/export?action='+action,undefined,custodian);assert.equal(await file.text(),'');}
  await restored.json(base+'/wall',{custodianEmail:'economics-lawyer@example.test',members:[],reason:'Exclude principal contributions',revision:wall.revision},custodian);
  assert.equal((await restored.request(retained.downloadPath,undefined,restored.owner)).status,404,'A changed ethical wall refuses a separately retained artifact');
  assert.ok(!(await restored.json('/reports/economics/exports',undefined,restored.owner)).exports.some(e=>e.id===retained.id));
  const excluded=await restored.json('/reports/economics',undefined,restored.owner);assert.ok(!JSON.stringify(excluded).includes(m.id));assert.ok(!JSON.stringify(excluded).includes(entry.id));assert.equal(excluded.totals.billedCents,0);assert.equal(excluded.totals.costCoverage.coveredCostCents,0);assert.deepEqual(excluded.totals.costCoverage.missingSourceIds,[missing.id]);
  const excludedHistorical=await restored.json('/reports/economics?asOf='+encodeURIComponent(excluded.asOf),undefined,restored.owner);assert.ok(!JSON.stringify(excludedHistorical).includes(m.id));assert.ok(!JSON.stringify(excludedHistorical).includes(entry.id));assert.equal(excludedHistorical.totals.billedCents,0);
  const excludedExport=await(await restored.request('/api/satchel/reports/economics/export',undefined,restored.owner)).text();assert.ok(!excludedExport.includes(m.id));assert.ok(!excludedExport.includes(entry.id));
 }finally{await restored?.close();await h.close();}
 await proveEconomicsAging();
});

// The aging journey uses fixed issue dates and advances a fixed worker clock.
// It follows real issue, delivery and partial-settlement doors, without database writes.
async function proveEconomicsAging(){
 const h=await harness({clock:'2030-06-01T16:00:00Z'});try{
  const f=await economicsFoundation(h),report=await h.json('/reports/economics',undefined,h.owner),m=report.matters.find(m=>m.matterId===f.m.id);
  await h.json('/matters/'+f.m.id+'/documents',{name:'Synthetic current economics capture.txt',mime:'text/plain',contentBase64:Buffer.from(JSON.stringify(report)).toString('base64'),visibility:'matter'},h.owner,422);
  const historicalCut='2030-09-01T16:00:00.000Z',historical=await h.json('/reports/economics?asOf='+encodeURIComponent(historicalCut),undefined,h.owner);
  assert.equal(historical.asOf,historicalCut);assert.equal(historical.calculatedAt,economicsClock);assert.equal(historical.totals.billedCents,87000);assert.equal(historical.totals.paidCents,0);assert.equal(historical.totals.pendingCents,0);assert.equal(historical.totals.trustCashCents,0);assert.equal(historical.totals.profitCents,null);assert.deepEqual(historical.totals.aging,{current:12000,'1–30':27000,'31–60':31000,'61–90':17000,'91+':0,unknown:0});assert.equal(historical.matters.find(m=>m.matterId===f.m.id).source.invoices.length,6);
  await h.json('/reports/economics?asOf=1999-01-01T00:00:00.000Z',undefined,h.owner,422);await h.json('/reports/economics?asOf=2031-01-01T00:00:00.000Z',undefined,h.owner,422);
  assert.equal(report.asOf,economicsClock);assert.deepEqual(m.aging,f.expectedAging);assert.deepEqual(report.totals.aging,f.expectedAging);
  assert.deepEqual(m.source.invoices.map(i=>i.agingBucket).sort(),['current','1–30','1–30','31–60','31–60','61–90','61–90','91+','unknown'].sort());
  assert.equal(m.billedCents,126000);assert.equal(m.earnedCents,126000);assert.equal(m.paidCents,500);assert.equal(m.pendingCents,200);assert.equal(m.trustCashCents,4500);assert.equal(m.collectionRate,500/126000);assert.equal(m.profitCents,null);assert.equal(m.costCoverage.approvedTimeEntries,0);
  assert.equal(Object.values(m.aging).reduce((a,b)=>a+b,0),125500,'Pending allocations do not erase an unpaid receivable');
  const before=await h.json('/reports/staff-costs',undefined,h.owner);
  await h.json('/reports/staff-costs/'+f.draft.id+'/approve',{revision:'synthetic-satchel-stale',confirmed:true},h.owner,409);
  assert.deepEqual(await h.json('/reports/staff-costs',undefined,h.owner),before);assert.deepEqual((await h.json('/reports/economics',undefined,h.owner)).totals,report.totals);
  await h.json('/reports/staff-costs/'+f.draft.id+'/approve',{revision:f.draft.id,confirmed:true},h.owner);
  const approved=await h.json('/reports/economics',undefined,h.owner);assert.equal(approved.totals.staffCostCents,54000);assert.equal(approved.totals.profitCents,72000);assert.deepEqual(approved.totals.aging,f.expectedAging);
  const lawyer=await h.login('lawyer@example.test');for(const path of ['/reports/economics','/reports/economics/export','/reports/staff-costs'])await h.json(path,undefined,lawyer,403);
  assert.deepEqual((await h.json('/reports/economics',undefined,h.owner)).totals,approved.totals);
  const artifact=await(await h.request('/api/satchel/reports/economics/export',undefined,h.owner)).json();assert.deepEqual(artifact.totals,approved.totals);assert.equal(artifact.asOf,economicsClock);
  const earlier=await h.json('/reports/staff-costs',{...f.costInput,effectiveFrom:'2029-01-01',hourlyCents:1000,reason:'Synthetic older approved basis',confirmed:true},h.owner);
  const firstConcurrent=await h.json('/reports/staff-costs/drafts',{...f.costInput,effectiveFrom:'2031-01-01',reason:'Synthetic future staff-cost review one'},h.owner),secondConcurrent=await h.json('/reports/staff-costs/drafts',{...f.costInput,effectiveFrom:'2031-01-01',hourlyCents:7000,reason:'Synthetic future staff-cost review two'},h.owner);
  const concurrent=await Promise.all([firstConcurrent,secondConcurrent].map(d=>h.request('/api/satchel/reports/staff-costs/'+d.id+'/approve',{revision:d.id,confirmed:true},h.owner)));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.equal((await h.json('/reports/staff-costs',undefined,h.owner)).approved.filter(c=>c.effective_from==='2031-01-01').length,1,'Concurrent approvals cannot create two active costs for one work date');assert.equal((await h.json('/reports/economics',undefined,h.owner)).totals.profitCents,72000);
  const retained=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},h.owner),dependent=await h.json('/reports/economics/exports',{confirmed:true,filters:{}},h.owner);
  const original=await(await h.request(retained.downloadPath,undefined,h.owner)).text();assert.equal(JSON.parse(original).totals.profitCents,72000);

  const copies=[original,JSON.stringify(JSON.parse(original)),JSON.stringify((({manifest,...payload})=>payload)(JSON.parse(original)))],costRecord=(await h.json('/reports/staff-costs',undefined,h.owner)).revisions.find(r=>r.id===f.draft.id);
  const ordinary=await h.json('/matters/'+f.m.id+'/documents',{name:'Synthetic ordinary text.txt',mime:'text/plain',contentBase64:Buffer.from('Synthetic ordinary client evidence').toString('base64'),visibility:'matter'},h.owner);assert.ok(ordinary.id);
  await h.json('/matters/'+f.m.id+'/threads',{subject:'Synthetic ordinary portal message',body:'The retained client task is ready for review.'},h.owner);
  const beforeDocuments=await h.json('/matters/'+f.m.id+'/documents',undefined,h.owner),beforeThreads=await h.json('/matters/'+f.m.id+'/threads',undefined,h.owner),beforeMails=h.mails.length;
  for(const text of [...copies,JSON.stringify(costRecord)]){
   await h.json('/matters/'+f.m.id+'/documents',{name:'Synthetic attempted capture.txt',mime:'text/plain',contentBase64:Buffer.from(text).toString('base64'),visibility:'matter'},h.owner,422);
   await h.json('/matters/'+f.m.id+'/threads',{subject:'Synthetic attempted capture',body:'Review this attached record',attachments:[{name:'Synthetic attempted capture.txt',contentBase64:Buffer.from(text).toString('base64')}]},h.owner,422);
  }
  await h.json('/matters/'+f.m.id+'/threads',{subject:'Synthetic attempted cost message',body:JSON.stringify(costRecord)},h.owner,422);
  await h.json('/matters/'+f.m.id+'/correspondence',{recipient:costRecord.email,subject:'Synthetic refused cost letter',body:JSON.stringify(costRecord),reviewNote:'This private cost payload must not become correspondence'},h.owner,422);
  assert.deepEqual(await h.json('/matters/'+f.m.id+'/documents',undefined,h.owner),beforeDocuments);assert.deepEqual(await h.json('/matters/'+f.m.id+'/threads',undefined,h.owner),beforeThreads);assert.equal(h.mails.length,beforeMails);
  const {movePackage}=await import('./migration-fixture.mjs'),source=await movePackage(costRecord.email,f.account.id);await h.json('/migration/preview',{package:source},h.owner);
  const bytes=Buffer.from(original),{createHash}=await import('node:crypto');source.files[1]={...source.files[1],contentBase64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};await h.json('/migration/preview',{package:source},h.owner,422);assert.equal((await h.json('/migration',undefined,h.owner)).jobs.length,0);
  const beforeDisposal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  const disposalClock='2030-10-01T17:00:00.000Z';await h.setClock(disposalClock);assert.equal((await h.json('/reports/economics?asOf='+encodeURIComponent(economicsClock),undefined,h.owner)).totals.profitCents,72000);
  const disposeCost={confirm:f.draft.id,reason:'Principal approved expired cost payload disposal'},disposeReport={confirm:retained.id,reason:'Principal approved expired report disposal'};
  const unused=(await h.json('/reports/staff-costs',undefined,h.owner)).approved.find(c=>c.effective_from==='2031-01-01'),emptyExport=await h.json('/reports/economics/exports',{confirmed:true,filters:{status:'closed'}},h.owner),disposeUnused={confirm:unused.id,reason:'Principal approved unused cost setting disposal'},disposeEmpty={confirm:emptyExport.id,reason:'Principal approved empty report disposal'};
  await h.json('/reports/economics/retention',undefined,lawyer,403);await h.json('/reports/economics/retention',{disposeAfter:'2030-09-30',basis:'Refused non-principal setting'},lawyer,403);
  await h.json('/reports/staff-costs/'+unused.id+'/dispose',disposeUnused,h.owner,409);await h.json('/reports/economics/exports/'+emptyExport.id+'/dispose',disposeEmpty,h.owner,409);
  const futurePolicy=await h.json('/reports/economics/retention',{revision:null,disposeAfter:'2030-10-02',basis:'Synthetic future firm retention decision'},h.owner);
  await h.json('/reports/economics/retention',{revision:null,disposeAfter:'2030-09-30',basis:'Refused stale policy decision'},h.owner,409);assert.equal((await h.json('/reports/economics/retention',undefined,h.owner)).current.id,futurePolicy.id);
  await h.json('/reports/economics/exports/'+emptyExport.id+'/dispose',disposeEmpty,h.owner,409);await h.json('/reports/staff-costs/'+unused.id+'/dispose',disposeUnused,h.owner,409);
  const expiredPolicy=await h.json('/reports/economics/retention',{revision:futurePolicy.id,disposeAfter:'2030-09-30',basis:'Synthetic expired firm retention decision'},h.owner);

  await h.json('/reports/staff-costs/'+f.draft.id+'/dispose',disposeCost,lawyer,403);
  await h.json('/reports/economics/exports/'+retained.id+'/dispose',disposeReport,lawyer,403);
  await h.json('/reports/staff-costs/'+f.draft.id+'/dispose',disposeCost,h.owner,409);
  for(const matterId of [f.m.id,f.other.id])await h.json('/retention',{matterId,disposeAfter:'2030-10-02',basis:'Synthetic firm retention decision'},h.owner);
  await h.json('/reports/economics/exports/'+retained.id+'/dispose',disposeReport,h.owner,409);
  for(const matterId of [f.m.id,f.other.id])await h.json('/retention',{matterId,disposeAfter:'2030-09-30',basis:'Synthetic expired firm retention decision'},h.owner);
  const hold=await h.json('/holds',{matterId:f.m.id,reason:'Synthetic counsel hold on financial report evidence'},h.owner);
  const beforeHeldCosts=await h.json('/reports/staff-costs',undefined,h.owner);
  await h.json('/reports/staff-costs/'+f.draft.id+'/dispose',disposeCost,h.owner,409);await h.json('/reports/economics/exports/'+retained.id+'/dispose',disposeReport,h.owner,409);
  await h.json('/reports/staff-costs/'+unused.id+'/dispose',disposeUnused,h.owner,409);await h.json('/reports/economics/exports/'+emptyExport.id+'/dispose',disposeEmpty,h.owner,409);
  assert.deepEqual(await h.json('/reports/staff-costs',undefined,h.owner),beforeHeldCosts);assert.equal(await(await h.request(retained.downloadPath,undefined,h.owner)).text(),original);
  await h.json('/holds/'+hold.id+'/release',{reason:'Counsel released exact hold after review'},h.owner);
  const emptyDisposed=await h.json('/reports/economics/exports/'+emptyExport.id+'/dispose',disposeEmpty,h.owner),unusedDisposed=await h.json('/reports/staff-costs/'+unused.id+'/dispose',disposeUnused,h.owner);assert.equal(emptyDisposed.journal.reportArtifacts,1);assert.equal(unusedDisposed.journal.costVersions,1);assert.equal(unusedDisposed.journal.reportArtifacts,0);assert.equal((await h.json('/reports/economics',undefined,h.owner)).totals.profitCents,72000);
  const reportDisposed=await h.json('/reports/economics/exports/'+retained.id+'/dispose',disposeReport,h.owner);assert.equal(reportDisposed.journal.reportArtifacts,1);assert.equal(reportDisposed.journal.bytes,Buffer.byteLength(original));
  assert.equal((await h.request(retained.downloadPath,undefined,h.owner)).status,404);
  const disposed=await h.json('/reports/staff-costs/'+f.draft.id+'/dispose',disposeCost,h.owner);assert.equal(disposed.journal.costVersions,1);assert.equal(disposed.journal.approvedCostVersions,1);assert.equal(disposed.journal.auditPayloads,2);assert.equal(disposed.journal.reportArtifacts,1);
  assert.equal((await h.request(dependent.downloadPath,undefined,h.owner)).status,404);assert.equal((await h.json('/reports/economics/exports',undefined,h.owner)).exports.length,0);
  const costsAfter=await h.json('/reports/staff-costs',undefined,h.owner);assert.ok(!JSON.stringify(costsAfter).includes(f.costInput.reason));assert.ok(costsAfter.approved.some(c=>c.id===earlier.id));
  assert.equal((await h.json('/reports/economics?asOf='+encodeURIComponent(economicsClock),undefined,h.owner)).totals.profitCents,null,'Historical reads cannot revive a disposed cost basis');
  const after=await h.json('/reports/economics',undefined,h.owner);assert.equal(after.totals.staffCostCents,null,'Disposal cannot fall back to an older approved cost');assert.equal(after.totals.profitCents,null);assert.equal(after.totals.costCoverage.approvedTimeEntries,0);assert.deepEqual(after.totals.aging,f.expectedAging);
  await h.json('/reports/staff-costs/'+f.draft.id+'/approve',{revision:f.draft.id,confirmed:true},h.owner,404);await h.json('/reports/staff-costs/'+f.draft.id+'/dispose',disposeCost,h.owner,404);
  const disposedAudit=(await h.json('/audit?action=report.staff_cost_approved',undefined,h.owner)).records.find(r=>r.objectId===f.draft.id);assert.equal(disposedAudit.evidence.disposedStaffCostPayload,true);assert.ok(!JSON.stringify(disposedAudit).includes(f.costInput.reason));
  await h.json('/matters/'+f.m.id+'/documents',{name:'Synthetic erased report replay.txt',mime:'text/plain',contentBase64:Buffer.from(original).toString('base64'),visibility:'matter'},h.owner,422);
  await h.restart();assert.equal((await h.json('/reports/economics',undefined,h.owner)).totals.profitCents,null);assert.equal((await h.request(dependent.downloadPath,undefined,h.owner)).status,404);
  const afterDisposal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!afterDisposal.includes(f.costInput.reason),'Current archives contain no disposed cost payload or report derivative');
  const restored=await harness({clock:disposalClock});try{
   await restored.json('/restore',{archive:beforeDisposal,journal:afterDisposal,confirm:'RESTORE'},restored.owner,409);
   await restored.json('/restore',{archive:afterDisposal,confirm:'RESTORE'},restored.owner);
   assert.equal((await restored.json('/reports/economics/retention',undefined,restored.owner)).current.id,expiredPolicy.id,'Recovery preserves the latest explicit retention revision, independent of row order');
   assert.equal((await restored.json('/reports/economics',undefined,restored.owner)).totals.profitCents,null);assert.equal((await restored.request(dependent.downloadPath,undefined,restored.owner)).status,404);assert.deepEqual(await restored.json('/reports/staff-costs',undefined,restored.owner),costsAfter);
  }finally{await restored.close();}

 }finally{await h.close();}
}
