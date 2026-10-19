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
 }finally{await restored?.close();await h.close();}
});
