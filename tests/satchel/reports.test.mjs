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
