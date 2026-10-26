import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('TIME-001 cross-device timers never overlap, intervals draft one entry each, timesheets post a day or week once with exact totals',async()=>{
 const h=await harness();let restored;
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const a=await open(h,'Harper v. Reed','Harper family','Reed Logistics'),b=await open(h,'Pine estate','Pine family','Elm Trustee');
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test'},h.owner);

  // One running timer per person; starting or resuming another pauses it visibly.
  const first=await h.json('/timers',{matterId:a.id,description:'Draft complaint',billable:true},h.owner);
  const second=await h.json('/timers',{matterId:b.id,description:'Estate inventory',billable:false},h.owner);
  const ta=first.timers[0];assert.equal(second.paused.id,ta.id);
  assert.deepEqual(second.timers.map(t=>[t.matterId,t.status]),[[a.id,'paused'],[b.id,'running']]);
  await h.json('/timers',{matterId:b.id,description:'No access',billable:true},assistant,404);
  const tb=second.timers[1];let resumed=await h.json('/timers/'+ta.id+'/resume',{revision:second.timers[0].revision},h.owner);
  assert.equal(resumed.paused.id,tb.id);assert.equal(resumed.timers.filter(t=>t.status==='running').length,1);
  await h.json('/timers/'+ta.id+'/pause',{revision:ta.revision},h.owner,409);
  let state=await h.json('/time',undefined,h.owner);const runningA=state.timers.find(t=>t.id===ta.id);
  assert.equal(runningA.status,'running');assert.ok(runningA.runningSince);
  await h.json('/time/post',{from:state.week.start,to:state.week.end},h.owner,409);
  await h.json('/timers/'+ta.id+'/pause',{revision:runningA.revision},h.owner);
  await h.json('/timers/'+tb.id+'/stop',{revision:state.timers.find(t=>t.id===tb.id).revision},h.owner);
  state=await h.json('/time',undefined,h.owner);const today=state.days.find(d=>d.drafts.length).date;
  const timerDrafts=state.days.flatMap(d=>d.drafts);
  assert.deepEqual(timerDrafts.map(d=>[d.matterId,d.source,d.minutes,d.billable]),[[a.id,'timer',1,true],[b.id,'timer',1,false],[a.id,'timer',1,true]]);
  assert.equal(new Set(timerDrafts.map(d=>d.date)).size,1);assert.deepEqual(state.timers.map(t=>t.status),['paused']);

  // Timesheet entries, review edits, rejection and exact totals.
  const day=state.week.start===today?state.days[1].date:state.week.start;
  await h.json('/time/drafts',{matterId:a.id,date:day,minutes:90,description:'Deposition outline',billable:true,utbmsTask:'X1'},h.owner,400);
  await h.json('/time/drafts',{matterId:a.id,date:day,minutes:0,description:'Deposition outline',billable:true},h.owner,400);
  state=await h.json('/time/drafts',{matterId:a.id,date:day,minutes:90,description:'Deposition outline',billable:true,utbmsTask:'L110',utbmsActivity:'A101'},h.owner);
  state=await h.json('/time/drafts',{matterId:b.id,date:day,minutes:30,description:'Internal file review',billable:false},h.owner);
  let outline=state.days.find(d=>d.date===day).drafts.find(d=>d.description==='Deposition outline');
  await h.json('/time/drafts/'+outline.id,{revision:'stale',minutes:120},h.owner,409);
  await h.json('/time/drafts/'+outline.id,{revision:outline.revision,utbmsActivity:'B1'},h.owner,400);
  state=await h.json('/time/drafts/'+outline.id,{revision:outline.revision,minutes:120,utbmsTask:'L120'},h.owner);
  const rejectedDraft=state.days.find(d=>d.date===today).drafts[2];
  state=await h.json('/time/drafts/'+rejectedDraft.id,{revision:rejectedDraft.revision,reject:true},h.owner);
  assert.deepEqual(state.days.find(d=>d.date===day).totals,{minutes:150,billableMinutes:120,billableCents:60000,postedMinutes:0,postedBillableCents:0});

  // Post day: one attributed entry per accepted draft; a repeat posts nothing.
  let posted=await h.json('/time/post',{from:day,to:day},h.owner);assert.equal(posted.posted,2);
  assert.deepEqual(posted.days.find(d=>d.date===day).totals,{minutes:150,billableMinutes:120,billableCents:60000,postedMinutes:150,postedBillableCents:60000});
  assert.equal((await h.json('/time/post',{from:day,to:day},h.owner)).posted,0);
  outline=posted.days.find(d=>d.date===day).drafts.find(d=>d.description==='Deposition outline');
  await h.json('/time/drafts/'+outline.id,{revision:outline.revision,minutes:30},h.owner,409);
  let billing=await h.json('/matters/'+a.id+'/billing',undefined,h.owner);
  const entry=billing.entries.find(e=>e.id===outline.entryId);
  assert.deepEqual([entry.minutes,entry.rateCents,entry.amountCents,entry.createdBy,entry.billable,entry.utbmsTask,entry.utbmsActivity,entry.date],[120,30000,60000,'owner@example.test',true,'L120','A101',day]);

  // Submit week: remaining timer intervals post; the rejected one never does.
  posted=await h.json('/time/post',{from:state.week.start,to:state.week.end},h.owner);assert.equal(posted.posted,2);
  assert.equal((await h.json('/time/post',{from:state.week.start,to:state.week.end},h.owner)).posted,0);
  const finalDrafts=posted.days.flatMap(d=>d.drafts);assert.equal(finalDrafts.filter(d=>d.status==='posted').length,4);
  assert.equal(finalDrafts.find(d=>d.id===rejectedDraft.id).status,'rejected');assert.equal(finalDrafts.find(d=>d.id===rejectedDraft.id).entryId,null);
  billing=await h.json('/matters/'+a.id+'/billing',undefined,h.owner);assert.equal(billing.entries.length,2);
  const nonbillable=(await h.json('/matters/'+b.id+'/billing',undefined,h.owner)).entries;assert.deepEqual(nonbillable.map(e=>e.billable),[false,false]);
  await h.json('/matters/'+b.id+'/bills',{title:'Estate bill',date:day,entryIds:[nonbillable[0].id]},h.owner,409);

  // A timekeeper sees and posts only their own time on matters they still see.
  const own=await h.json('/timers',{matterId:a.id,description:'Assistant indexing',billable:true},assistant);
  await h.json('/timers/'+own.timers[0].id+'/stop',{revision:own.timers[0].revision},assistant);
  await h.json('/timers/'+own.timers[0].id+'/stop',{revision:own.timers[0].revision},h.owner,404);
  assert.equal((await h.json('/time',undefined,assistant)).week.totals.minutes,1);
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test',remove:true},h.owner);
  assert.equal((await h.json('/time',undefined,assistant)).week.totals.minutes,0);
  await h.json('/time/post',{from:state.week.start,to:state.week.end},assistant,404);

  const archived=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive:archived,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json('/time?week='+state.week.start,undefined,restored.owner),await h.json('/time?week='+state.week.start,undefined,h.owner));

  // TIME-008: a real weekly import retains original attribution, validates every
  // row before an atomic post, and preserves an expense's vendor and source details.
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test'},h.owner);
  const bulkReceipt=await h.json('/matters/'+a.id+'/documents',{name:'County copy receipt.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('County Records, copy charge USD 25.00, receipt CR-1042').toString('base64')},h.owner);
  await h.json('/reports/staff-costs',{email:'assistant@example.test',effectiveFrom:'2026-01-01',hourlyCents:6000,confirmed:true,reason:'Principal approved hourly staff cost'},h.owner);
  await h.json('/ledes/codes',{kind:'task',code:'L110',label:'Case review'},h.owner);
  const bulkRows=[
   {matterId:a.id,kind:'time',date:'2026-10-19',minutes:90,description:'Monday witness chronology',billable:true,timekeeperEmail:'assistant@example.test',sourceId:'week43-mon'},
   {matterId:a.id,kind:'time',date:'2026-10-20',minutes:45,description:'Tuesday deposition index',billable:true,timekeeperEmail:'assistant@example.test',sourceId:'week43-tue'},
   {matterId:a.id,kind:'disbursement',date:'2026-10-21',amountCents:2500,description:'County records copy charge',billable:true,timekeeperEmail:'assistant@example.test',sourceId:'week43-copy',expense:{category:'advanced_cost',vendor:'County Records',vendorReference:'CR-1042',accountingCode:'COURT-COPY',sourceSystem:'County statement',sourceId:'CR-1042',receipt:{documentId:bulkReceipt.id,version:1}}},
   {matterId:a.id,kind:'time',date:'2026-10-22',minutes:0,description:'Thursday exhibit check',billable:true,timekeeperEmail:'assistant@example.test',sourceId:'week43-thu'},
  ];
  const uncoded=await h.json('/time/bulk',{requestId:'unknown-bulk-code',sourceSystem:'Weekly code validation',rows:[{...bulkRows[0],utbmsTask:'L999'}]},h.owner);assert.ok(uncoded.rows[0].errors.some(e=>e.includes('active code set')));
  const bulkRequest={requestId:'weekly-assistant-2026-w43',sourceSystem:'Reviewed weekly workbook',rows:bulkRows};
  let bulk=await h.json('/time/bulk',bulkRequest,h.owner);
  assert.deepEqual(bulk.rows.map(r=>r.errors.length),[0,0,0,1]);
  const beforeBulk=(await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries.length;
  const postBulk=(b,requestId='post-week43',who=h.owner,status=200)=>h.json('/time/bulk/'+b.id+'/post',{revision:b.revision,reviewDigest:b.reviewDigest,requestId},who,status);
  await postBulk(bulk,'post-week43',h.owner,422);
  assert.equal((await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries.length,beforeBulk);
  await h.json('/time/bulk',{...bulkRequest,rows:[{...bulkRows[0],minutes:100}]},h.owner,409);
  await h.json('/time/bulk/'+bulk.id+'/rows',{revision:'old-review',rowId:bulk.rows[3].id,row:{...bulkRows[3],minutes:12}},h.owner,409);
  const invalidReview=bulk;
  bulk=await h.json('/time/bulk/'+bulk.id+'/rows',{revision:bulk.revision,rowId:bulk.rows[3].id,row:{...bulkRows[3],minutes:12}},h.owner);
  assert.equal(bulk.rows[3].original.minutes,0);assert.equal(bulk.rows[3].input.minutes,12);assert.ok(bulk.rows.every(r=>r.errors.length===0));
  await postBulk(invalidReview,'post-week43',h.owner,409);
  // The original timekeeper must still see the matter at posting. No row posts
  // when one person's access has been revoked since review.
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test',remove:true},h.owner);
  await postBulk(bulk,'post-week43',h.owner,422);
  assert.equal((await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries.length,beforeBulk);
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test'},h.owner);
  bulk=await postBulk(bulk);
  assert.deepEqual(await postBulk(bulk),bulk);
  await postBulk(bulk,'changed-post-request',h.owner,409);
  assert.deepEqual(await h.json('/time/bulk',bulkRequest,h.owner),bulk);
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test',remove:true},h.owner);
  assert.ok(!(await h.json('/time/bulk',undefined,h.owner)).batches.some(b=>b.id===bulk.id),'Posted reads recheck the original timekeeper access');
  await postBulk(bulk,'post-week43',h.owner,404);
  await h.json('/matters/'+a.id+'/access',{email:'assistant@example.test'},h.owner);
  const imported=(await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries.filter(e=>bulk.rows.some(r=>r.entryId===e.id));
  assert.equal(imported.length,4);
  const frozenCost=bulk.rows[0].value.costBasis;assert.equal(frozenCost.costCents,9000);
  await h.json('/reports/staff-costs',{email:'assistant@example.test',effectiveFrom:'2026-10-01',hourlyCents:9000,confirmed:true,reason:'Later reviewed cost basis'},h.owner);
  assert.deepEqual((await h.json('/time/bulk',undefined,h.owner)).batches.find(b=>b.id===bulk.id).rows[0].value.costBasis,frozenCost);
  assert.ok(imported.every(e=>e.createdBy==='owner@example.test'&&e.timekeeperEmail==='assistant@example.test'));
  assert.deepEqual(imported.filter(e=>e.kind==='time').map(e=>[e.date,e.minutes,e.amountCents]).sort(),[['2026-10-19',90,45000],['2026-10-20',45,24000],['2026-10-22',12,6000]]);
  const cost=imported.find(e=>e.kind==='disbursement');assert.deepEqual([cost.expense.category,cost.expense.vendor,cost.expense.vendorReference,cost.expense.accountingCode,cost.expense.sourceSystem,cost.expense.sourceId],['advanced_cost','County Records','CR-1042','COURT-COPY','County statement','CR-1042']);
  assert.deepEqual(cost.expense.receipt,{documentId:bulkReceipt.id,title:'County copy receipt.txt',version:1,sha256:bulkReceipt.versions[0].sha256});
  const duplicate=await h.json('/time/bulk',{requestId:'second-import',sourceSystem:bulkRequest.sourceSystem,rows:[bulkRows[0]]},h.owner);
  assert.ok(duplicate.rows[0].errors.length);await postBulk(duplicate,'second-post',h.owner,422);
  const impersonated=await h.json('/time/bulk',{requestId:'assistant-attribution-attempt',sourceSystem:'Own workbook',rows:[{...bulkRows[0],timekeeperEmail:'owner@example.test'}]},assistant);
  assert.ok(impersonated.rows[0].errors.some(e=>e.includes('principal')));
  await postBulk(bulk,'post-week43',assistant,404);
  assert.ok(!(await h.json('/time/bulk',undefined,assistant)).batches.some(b=>b.id===bulk.id));
  // A retroactive agreement change cannot silently change the reviewed money.
  let stalePrice=await h.json('/time/bulk',{requestId:'later-week',sourceSystem:'Reviewed weekly workbook',rows:[{...bulkRows[0],date:'2026-11-02',sourceId:'week45-mon'}]},h.owner);
  await h.json('/matters/'+a.id+'/rates',{scope:'matter',timekeeperEmail:'assistant@example.test',effectiveFrom:'2026-11-01',rateCents:20000,incrementMinutes:6,discountBps:0,billable:true,note:'Updated client agreement'},h.owner);
  await postBulk(stalePrice,'post-week45',h.owner,409);
  stalePrice=await h.json('/time/bulk/'+stalePrice.id+'/rows',{revision:stalePrice.revision,rowId:stalePrice.rows[0].id,row:stalePrice.rows[0].input},h.owner);
  assert.equal(stalePrice.rows[0].value.amountCents,30000);
  await postBulk(stalePrice,'post-week45');
  const retainedBulk=await h.json('/time/bulk',undefined,h.owner);await h.restart();assert.deepEqual(await h.json('/time/bulk',undefined,h.owner),retainedBulk);
  await restored.close();restored=await harness();await restored.json('/restore',{archive:await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json('/time/bulk',undefined,restored.owner),retainedBulk);
  assert.deepEqual(await restored.json('/time/bulk/'+bulk.id+'/post',{revision:bulk.revision,reviewDigest:bulk.reviewDigest,requestId:'post-week43'},restored.owner),bulk);
  assert.deepEqual((await restored.json('/matters/'+a.id+'/billing',undefined,restored.owner)).entries.filter(e=>bulk.rows.some(r=>r.entryId===e.id)),imported);
 }finally{await restored?.close();await h.close();}
});
