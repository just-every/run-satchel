import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation,earnedBill} from './trust-fixture.mjs';

test('MATTER-007 counsel reviews live trust, court work, final bills, original return and promises, carries exact exceptions, closes and reopens without losing history',async()=>{
 const h=await harness();let restored;
 try{
  const f=await foundation(h),base='/matters/'+f.m.id;
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:150001,statementDate:'2026-09-30',documentId:f.source.id,note:'Closing trust balance statement'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Reviewed allocation'},h.owner);
  let legal=await h.json(base+'/deadlines',{title:'Open court deadline',date:'2026-12-01',timezone:'America/New_York',source:'Order paragraph 7'},h.owner);legal=await h.json('/deadlines/'+legal.id+'/confirm',{revision:legal.revision,note:'Reviewed order'},h.owner);
  const task=await h.json(base+'/tasks',{title:'Open court task',deadlineId:legal.id,ownerEmail:'owner@example.test'},h.owner);
  const bill=await earnedBill(h,f.m,30000,'Final legal services');await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-01',description:'Unbilled courier expense',amountCents:2500},h.owner);
  const extra=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-01',description:'Draft costs',amountCents:1000},h.owner);await h.json(base+'/bills',{title:'Unreviewed closing costs',date:'2026-10-01',entryIds:[extra.id]},h.owner);
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json(base+'/lifecycle',undefined,assistant,403);
  const returnSource=await h.json(base+'/documents',{name:'Signed closeout receipt.txt',mime:'text/plain',contentBase64:Buffer.from('Client signed receipt for returned originals and delivery of closing letter.').toString('base64'),visibility:'matter'},h.owner);
  await h.json('/deadlines/'+legal.id+'/reminders',{revision:legal.revision,recipient:'lawyer@example.test',backup:'owner@example.test',advanceDays:7,sendTime:'09:00',quietStart:'18:00',quietEnd:'08:00',channels:['workspace'],escalateHours:24},h.owner);
  const appointment=await h.json(base+'/appointments',{title:'Closing consultation',date:'2026-11-20',time:'10:00',durationMinutes:30,timezone:'America/New_York',frequency:'once',location:'Main office',attendees:['lawyer@example.test']},h.owner);
  await h.json(base+'/tasks',{title:'Handed-off closeout review',ownerEmail:'lawyer@example.test'},h.owner);const handoff=await h.json('/handoffs',{from:'lawyer@example.test',to:'owner@example.test',matterIds:[f.m.id],reason:'Principal retains closeout responsibilities'},h.owner);
  const declarations={clientPromisesReviewed:true,clientPromises:[{id:'closing-letter',title:'Deliver closing letter',status:'open',dueDate:'2026-12-03'}],originalReturn:{status:'returned',documentId:returnSource.id,note:'Signed return receipt reviewed'}};
  const preview=body=>h.json(base+'/closure-preview',body,h.owner);
  let p=await preview({});assert.ok(p.checks.some(c=>c.kind==='client-promises'));assert.ok(p.checks.some(c=>c.kind==='originals'));
  p=await preview(declarations);for(const kind of ['task','deadline','handoff','bill-balance','draft-bill','unbilled-entry','trust-balance','client-promise'])assert.ok(p.checks.some(c=>c.kind===kind),kind);
  assert.equal(p.checks.find(c=>c.kind==='trust-balance').state.balanceCents,150001);assert.equal(p.checks.find(c=>c.kind==='bill-balance').sourceId,bill.id);
  const close=(p,exceptions=[],who=h.owner,expected=200)=>h.json(base+'/close',{previewId:p.id,digest:p.digest,revision:p.revision,reason:'Counsel reviewed exact closeout, continuing expressly carried items',exceptions},who,expected);
  await close(p,[],h.owner,409);await close(p,p.checks.map(c=>({key:c.key,reason:'Carried under responsible counsel'})),lawyer,409);
  await h.json(base+'/tasks',{title:'New work after preview',ownerEmail:'owner@example.test'},h.owner);await close(p,p.checks.map(c=>({key:c.key,reason:'Carried'})),h.owner,409);
  await h.json('/tasks/'+task.id+'/complete',{evidence:'Court work completed; filed receipt checked'},h.owner);
  p=await preview({...declarations,clientPromises:[{id:'closing-letter',title:'Deliver closing letter',status:'fulfilled',documentId:returnSource.id}]});assert.ok(!p.checks.some(c=>c.sourceId===task.id));assert.ok(!p.checks.some(c=>c.kind==='client-promise'));
  const prior={reminders:await h.json('/deadlines/'+legal.id+'/reminders',undefined,h.owner),calendar:await h.json(base+'/calendar',undefined,h.owner),notifications:await h.json('/notifications',undefined,lawyer),workload:await h.json('/workload',undefined,h.owner),tasks:await h.json(base+'/tasks',undefined,h.owner),deadlines:await h.json(base+'/deadlines',undefined,h.owner),billing:await h.json(base+'/billing',undefined,h.owner),trust:await h.json('/trust',undefined,h.owner),detail:await h.json(base,undefined,h.owner)};
  let state=await close(p,p.checks.map(c=>({key:c.key,reason:'Principal retains responsibility; resolve in continuing workflow'})));assert.equal(state.status,'closed');assert.equal(state.history.length,1);assert.equal(state.history[0].exceptions.length,p.checks.length);await close(p,[],h.owner,409);
  assert.ok(state.workflows.some(w=>w.id==='appointment:'+appointment.id));assert.ok(state.workflows.some(w=>w.id.startsWith('reminder:')));
  assert.ok(state.history[0].snapshot.checks.some(c=>c.kind==='handoff'&&c.sourceId===handoff.id));
  const closedRevision=state.revision;await h.json(base+'/reopen',{revision:closedRevision,reason:'Reopen for additional court work',workflows:['task:invented'],access:[]},h.owner,409);
  state=await h.json(base+'/reopen',{revision:closedRevision,reason:'Additional court work approved',workflows:[`deadline:${legal.id}`],access:['lawyer@example.test']},h.owner);assert.equal(state.status,'open');assert.equal(state.history.length,2);assert.deepEqual(state.history[1].restoration,{workflows:[`deadline:${legal.id}`],access:['lawyer@example.test']});
  await h.json(base+'/reopen',{revision:closedRevision,reason:'Replay',workflows:[],access:[]},h.owner,409);
  assert.deepEqual(await h.json('/deadlines/'+legal.id+'/reminders',undefined,h.owner),prior.reminders);assert.deepEqual(await h.json(base+'/calendar',undefined,h.owner),prior.calendar);assert.deepEqual(await h.json('/notifications',undefined,lawyer),prior.notifications);assert.deepEqual(await h.json('/workload',undefined,h.owner),prior.workload);
  assert.deepEqual(await h.json(base+'/tasks',undefined,h.owner),prior.tasks);assert.deepEqual(await h.json(base+'/deadlines',undefined,h.owner),prior.deadlines);assert.deepEqual(await h.json(base+'/billing',undefined,h.owner),prior.billing);assert.deepEqual(await h.json('/trust',undefined,h.owner),prior.trust);assert.deepEqual((await h.json(base,undefined,h.owner)).access,prior.detail.access);
  const audit=await h.json('/audit?matterId='+f.m.id,undefined,h.owner);for(const action of ['matter.closure_previewed','matter.closed','matter.reopened'])assert.ok(audit.records.some(r=>r.action===action&&r.evidence.record.recordType.startsWith('s_matter_')));
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(await restored.json(base+'/lifecycle',undefined,restored.owner),state);
 }finally{await restored?.close();await h.close();}
});

test('MATTER-007 private source checks and immutable history retain current visibility without granting closure authority',async()=>{
 const h=await harness();try{
  const m=await open(h),base='/matters/'+m.id;
  await h.json('/team',{email:'lawyer@example.test',name:'Associate counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test');await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  const privateDoc=await h.json(base+'/documents',{name:'Sealed source original',visibility:'private',mime:'text/plain',contentBase64:Buffer.from('Confidential court order, paragraph 7.').toString('base64')},h.owner);
  const d=await h.json(base+'/deadlines',{title:'Confidential compliance deadline',date:'2026-12-01',timezone:'America/New_York',source:'Sealed source citation',documentId:privateDoc.id},h.owner);await h.json(base+'/tasks',{title:'Confidential source task',deadlineId:d.id},h.owner);
  const body={clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'No client originals held'}};
  const p=await h.json(base+'/closure-preview',body,lawyer);assert.equal(p.hasRestrictedItems,true);assert.ok(p.checks.some(c=>c.restricted));for(const term of ['Confidential','Sealed source',privateDoc.id])assert.ok(!JSON.stringify(p).includes(term),term);
  assert.equal(p.checks.filter(c=>c.restricted).length,1,'Restricted sources have one opaque review blocker, without a source count');
  await h.json(base+'/close',{previewId:p.id,digest:p.digest,revision:p.revision,reason:'Cannot review hidden sources',exceptions:p.checks.map(c=>({key:c.key,reason:'Attempted carry'}))},lawyer,403);
  const ownerPreview=await h.json(base+'/closure-preview',body,h.owner);
  await h.json(base+'/close',{previewId:ownerPreview.id,digest:ownerPreview.digest,revision:ownerPreview.revision,reason:'Confidential source reviewed by principal',exceptions:ownerPreview.checks.map(c=>({key:c.key,reason:'Private source duty retained by principal'}))},h.owner);
  const correction=await h.json(base+'/tasks',{title:'Post-close corrective court work'},h.owner);assert.equal(correction.status,'open','Closing retains the existing lawful write doors');
  const visible=await h.json(base+'/lifecycle',undefined,lawyer);for(const term of ['Confidential','Sealed source',privateDoc.id,'Private source duty'])assert.ok(!JSON.stringify(visible).includes(term),term);
  assert.equal(visible.status,'closed');assert.ok(visible.history[0].snapshot.checks.every(c=>c.restricted));
  await h.json(base+'/access',{email:'lawyer@example.test',remove:true},h.owner);await h.json(base+'/lifecycle',undefined,lawyer,404);
 }finally{await h.close();}
});
