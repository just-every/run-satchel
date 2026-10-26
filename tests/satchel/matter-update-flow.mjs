import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {updateFixture,updateEdit,updateTick,updateWording} from './matter-update-fixture.mjs';

const declarations={clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'Only native copies are held'}};
const closeBody=(p,exceptions=p.checks.map(c=>({key:c.key,reason:'Counsel individually carries this exact obligation'})))=>({previewId:p.id,digest:p.digest,revision:p.revision,reason:'Counsel reviewed continuing duties',exceptions,outcome:'other',outcomeNote:'Representation paused with reviewed continuing duties'});
export async function proveMatterUpdates(){
 let lost=true,sequence=0;const h=await harness({mailResponse:message=>lost&&message.subject==='Reviewed trial update'?new Response('unavailable',{status:503}):Response.json({id:'synthetic-satchel-'+(++sequence)}),mailReadback:request=>Response.json({id:new URL(request.url).pathname.split('/').at(-1),to:['client@example.test'],last_event:'delivered'})});let restored;
 try{
  const f=await updateFixture(h),door='/matter-updates/'+f.draft.id,portal='/portal/matters/'+f.m.id+'/updates';
  assert.equal(f.draft.previous_date,'2027-01-10');assert.equal(f.draft.new_date,'2027-02-12');assert.equal(f.draft.source_version,2);assert.equal(f.draft.source_digest,f.order.versions[1].sha256);assert.equal(f.draft.source_citation,'Revised order paragraph 7');assert.equal(f.draft.outstandingActions[0].title,'Confirm contact details');
  const before=h.mails.length;await h.scheduled(updateTick);assert.equal(h.mails.length,before);assert.deepEqual((await h.json(portal,undefined,f.client)).updates,[]);
  await h.json(door+'/edit',updateEdit(f.draft),f.client,403);await h.json(door+'/approve',{revision:f.draft.revision,confirmed:true,reviewNote:'Not responsible counsel'},f.lawyer,403);
  let saved=await h.json(door+'/edit',updateEdit(f.draft,{body:updateWording+'\nsynthetic-satchel-11 privileged strategy'}),h.owner);
  await h.json(door+'/approve',{revision:f.draft.revision,confirmed:true,reviewNote:'Stale wording'},h.owner,409);
  saved=await h.json(door+'/edit',updateEdit({...f.draft,revision:saved.revision}),h.owner);
  await h.json(door+'/approve',{revision:saved.revision,confirmed:true,reviewNote:'Consent missing'},h.owner,409);
  await f.consent('allowed');await h.json(door+'/approve',{revision:saved.revision,confirmed:true,reviewNote:'Reviewed exact public wording, recipient, promise and delivery time'},h.owner);
  await h.json(door+'/edit',updateEdit({...f.draft,revision:saved.revision}),h.owner,409);
  let u=(await f.state()).updates.find(u=>u.id===f.draft.id);assert.equal(u.jobs.length,1);assert.equal(u.jobs[0].portal_published_at,null);
  let p=await h.json(f.base+'/closure-preview',declarations,h.owner),promise=p.checks.find(c=>c.kind==='client-update-promise');assert.equal(promise.title,u.promises[0].text);
  await h.json(f.base+'/close',closeBody(p,p.checks.filter(c=>c.key!==promise.key).map(c=>({key:c.key,reason:'Other exact continuing duty'}))),h.owner,409);
  await h.json(f.base+'/close',closeBody(p),h.owner);await h.scheduled(updateTick);assert.equal(h.mails.length,before);
  let lifecycle=await h.json(f.base+'/lifecycle',undefined,h.owner),job=lifecycle.workflows.find(w=>w.id.startsWith('client-update-job:'));assert.ok(job);
  await h.json(f.base+'/reopen',{revision:lifecycle.revision,reason:'Counsel explicitly retains this approved schedule',workflows:[job.id],access:[]},h.owner);assert.equal(h.mails.length,before);
  await h.scheduled(updateTick);u=(await f.state()).updates.find(u=>u.id===f.draft.id);assert.equal(u.jobs[0].mail_outcome,'uncertain');assert.ok(u.jobs[0].portal_published_at);assert.equal(h.mails.length,before+1);assert.equal(h.mails.at(-1).text,updateWording);assert.ok(!JSON.stringify(h.mails.at(-1)).includes('synthetic-satchel-11'));
  const visible=(await h.json(portal,undefined,f.client)).updates[0];assert.equal(visible.body,updateWording);assert.equal(visible.previousDate,'2027-01-10');assert.equal(visible.newDate,'2027-02-12');assert.equal(visible.sourceCitation,'Revised order paragraph 7');assert.deepEqual((await h.json(portal,undefined,f.other)).updates,[]);
  await h.json('/portal/matter-updates/'+u.id+'/replies',{body:'Another recipient may not reply'},f.other,404);
  await h.restart();await h.scheduled(updateTick);assert.equal(h.mails.length,before+1,'Unknown acknowledgments never retry automatically');
  const retry=await h.json('/mail-attempts/'+u.jobs[0].attempt_id+'/resend-review',{reason:'Provider checked; responsible counsel authorizes one further attempt'},h.owner);lost=false;await h.json('/mail-attempts/'+retry.attemptId+'/send',{},h.owner);assert.equal(h.mails.length,before+2);await h.json('/mail-attempts/'+retry.attemptId+'/send',{},h.owner);assert.equal(h.mails.length,before+2);await h.json('/mail-attempts/'+retry.attemptId+'/reconcile',{},h.owner);
  u=(await f.state()).updates.find(u=>u.id===f.draft.id);assert.equal(u.jobs[0].mail_outcome,'delivered');
  const invoiceTemplate=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Responsible counsel approves generic invoice notice'},h.owner),appointmentTemplate=await h.json('/client-reminder-templates',{kind:'appointment',confirmed:true,reason:'Responsible counsel approves generic appointment notice'},h.owner);
  await h.json(f.base+'/client-reminders',{enabled:true,invoiceTemplate:invoiceTemplate.id,appointmentTemplate:appointmentTemplate.id,maxContacts:1,reason:'Share the recipient contact budget with approved updates'},h.owner);
  const appointment=await h.json(f.base+'/appointments',{title:'Trial preparation call',date:'2026-11-05',time:'10:00',durationMinutes:30,timezone:'UTC',frequency:'once',attendees:['owner@example.test']},h.owner),reminder=await h.json(f.base+'/client-reminders/schedule',{recipient:'client@example.test',appointmentId:appointment.id,dueAt:updateTick},h.owner);
  await h.scheduled(updateTick);assert.equal(h.mails.length,before+2,'Prior update contacts consume the reminder budget');assert.equal((await h.json(f.base+'/client-reminders',undefined,h.owner)).jobs.find(j=>j.id===reminder.id).status,'stopped');
  const notice=await f.upload('Hearing-notice.txt','Court notice paragraph 3: preparation hearing on March 1, 2027.');let pending=await h.json(f.base+'/deadlines',{title:'Preparation hearing',kind:'hearing',date:'2027-03-01',timezone:'America/New_York',source:'Hearing notice paragraph 3',documentId:notice.id,version:1},h.owner);pending=await h.json('/deadlines/'+pending.id+'/confirm',{revision:pending.revision,note:'Counsel reviewed the hearing notice'},h.owner);
  let gated=(await f.state()).updates.find(x=>x.deadline_id===pending.id);const changed=await h.json('/matter-updates/'+gated.id+'/edit',updateEdit(gated,{title:'Consent gated update',promises:[]}),h.owner);await h.json('/matter-updates/'+gated.id+'/approve',{revision:changed.revision,confirmed:true,reviewNote:'Counsel approves the exact update before consent withdrawal'},h.owner);
  await f.consent('denied');await h.scheduled(updateTick);assert.equal(h.mails.length,before+2);gated=(await f.state()).updates.find(x=>x.id===gated.id);assert.equal(gated.jobs[0].status,'stopped');assert.equal(gated.jobs[0].portal_published_at,null);await f.consent('allowed');await h.scheduled(updateTick);assert.equal(h.mails.length,before+2,'Renewed consent does not resume a stopped update');
  const reply=await h.json('/portal/matter-updates/'+f.draft.id+'/replies',{body:'Please call me about the new trial date.'},f.client);let state=await f.state();assert.equal(state.followups[0].responsible_email,'owner@example.test');
  await h.json('/matter-update-replies/'+reply.id+'/complete',{evidence:'Counsel called and explained the revised date'},h.owner);assert.equal((await f.state()).followups.length,0);
  await h.json('/portal/matter-updates/'+f.draft.id+'/replies',{body:'I have one more question.'},f.client);assert.equal((await f.state()).followups.length,1,'A new reply reopens responsible work');
  p=await h.json(f.base+'/closure-preview',declarations,h.owner);const evidence=await f.upload('Checklist-delivery.txt','Client received the reviewed hearing preparation checklist.',{visibility:'private'});
  await h.json('/matter-update-promises/'+u.promises[0].id+'/fulfil',{documentId:evidence.id,version:1,digest:evidence.versions[0].sha256,evidence:'Signed checklist delivery confirmation'},h.owner);
  await h.json(f.base+'/close',closeBody(p),h.owner,409);p=await h.json(f.base+'/closure-preview',declarations,h.owner);assert.ok(!p.checks.some(c=>c.kind==='client-update-promise'));
  const restricted=await h.json(f.base+'/closure-preview',declarations,f.lawyer);assert.equal(restricted.checks.filter(c=>c.restricted).length,1);assert.ok(!JSON.stringify(restricted).includes(evidence.id));assert.ok(!JSON.stringify(restricted).includes(evidence.title));await h.json(f.base+'/close',closeBody(restricted),f.lawyer,403);
  assert.ok(!JSON.stringify(await h.json(f.base+'/matter-updates',undefined,f.lawyer)).includes(evidence.id));
  const audit=(await h.json('/audit?matterId='+f.m.id+'&action=matter_update.approved',undefined,h.owner)).records[0];assert.equal(audit.detail.body,updateWording);assert.deepEqual(audit.detail.recipients,['client@example.test']);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.equal((await restored.json(f.base+'/matter-updates',undefined,restored.owner)).updates.find(x=>x.id===f.draft.id).promises[0].status,'fulfilled');const mails=restored.mails.length;await restored.scheduled(updateTick);assert.equal(restored.mails.length,mails);
 }finally{await restored?.close();await h.close();}
}
