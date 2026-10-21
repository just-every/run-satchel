import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
async function lawyer(h,email,name,matterId){await h.json('/team',{email,name,role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);const cookie=await h.login(email);await h.json('/matters/'+matterId+'/access',{email},h.owner);return cookie;}
async function deadline(h,matterId,title='Serve notice',day='2026-11-20'){
 const d=await h.json('/matters/'+matterId+'/deadlines',{title,date:day,timezone:'America/New_York',source:'Served order, paragraph 8'},h.owner);
 return h.json('/deadlines/'+d.id+'/confirm',{revision:d.revision,note:'Counsel independently confirmed the order'},h.owner);
}
const rule=(d,patch={})=>({recipient:'marcus@example.test',backup:'owner@example.test',advanceDays:7,sendTime:'09:00',quietStart:'18:00',quietEnd:'08:00',channels:['email','workspace'],escalateHours:24,revision:d.revision,...patch});
const state=(h,d,cookie=h.owner)=>h.json('/deadlines/'+d.id+'/reminders',undefined,cookie);
const reminders=h=>h.mails.filter(m=>m.subject==='Satchel deadline reminder'||m.subject==='Satchel deadline escalation');
test('CAL-007 scheduled seven-day delivery, durable failed outcome, restart and one backup escalation; only filing evidence completes the deadline',async()=>{
 let failed=false;const h=await harness({mailResponse:message=>{if(message.subject==='Satchel deadline reminder'&&!failed){failed=true;return Response.json({name:'validation_error',message:'Mailbox refused'},{status:422});}return Response.json({id:'provider-'+message.to[0]});}});
 try{
  const m=await open(h),marcus=await lawyer(h,'marcus@example.test','Marcus Lee',m.id),d=await deadline(h,m.id);
  await h.json('/deadlines/'+d.id+'/reminders',rule(d),h.owner);
  await h.scheduled('2026-11-13T13:59:00Z');assert.equal(reminders(h).length,0);
  await h.scheduled('2026-11-13T14:00:00Z');let s=await state(h,d);
  assert.equal(reminders(h).length,1);assert.deepEqual(reminders(h)[0].to,['marcus@example.test']);
  assert.equal(s.deliveries.find(v=>v.channel==='email').status,'failed');assert.equal(s.deliveries.find(v=>v.channel==='workspace').status,'available');
  assert.ok(s.deliveries.every(v=>v.recipient==='marcus@example.test'&&v.attemptedAt));
  const primary=s.deliveries.find(v=>v.channel==='workspace');await h.json('/reminders/'+primary.id+'/acknowledge',{},h.owner,403);
  await h.restart();await h.scheduled('2026-11-14T13:59:00Z');assert.equal((await state(h,d)).deliveries.filter(v=>v.stage==='escalation').length,0);
  await h.scheduled('2026-11-14T14:00:00Z');await h.scheduled('2026-11-14T14:15:00Z');s=await state(h,d);
  const escalation=s.deliveries.filter(v=>v.stage==='escalation');assert.equal(escalation.length,2);assert.ok(escalation.every(v=>v.recipient==='owner@example.test'));
  assert.equal(reminders(h).length,2);assert.deepEqual(reminders(h)[1].to,['owner@example.test']);assert.equal(escalation.find(v=>v.channel==='email').status,'accepted');assert.ok(escalation.find(v=>v.channel==='email').providerId);
  const backup=escalation.find(v=>v.channel==='workspace');await h.json('/reminders/'+backup.id+'/acknowledge',{},h.owner);
  assert.equal((await h.json('/matters/'+m.id+'/deadlines',undefined,h.owner))[0].status,'confirmed');
  await h.json('/deadlines/'+d.id+'/complete',{revision:d.revision},h.owner,400);
  const done=await h.json('/deadlines/'+d.id+'/complete',{revision:d.revision,evidence:'Court filing receipt ECF-182, 2026-11-14'},h.owner);assert.equal(done.status,'done');
  assert.equal((await state(h,d,marcus)).deliveries.find(v=>v.id===backup.id).acknowledgedBy,'owner@example.test');
  assert.equal((await state(h,d)).deliveries.find(v=>v.id===s.deliveries.find(v=>v.channel==='email'&&v.stage==='reminder').id).status,'failed');
  await h.scheduled('2026-11-15T14:00:00Z');assert.equal(reminders(h).length,2);
 }finally{await h.close();}
});
test('CAL-007 reassignment, quiet hours, acknowledgment and access revocation fence future sends without hiding delivery history',async()=>{
 const h=await harness();try{
  const m=await open(h),marcus=await lawyer(h,'marcus@example.test','Marcus Lee',m.id),nora=await lawyer(h,'nora@example.test','Nora Woods',m.id),d=await deadline(h,m.id);
  await h.json('/deadlines/'+d.id+'/reminders',rule(d,{channels:['email'],sendTime:'07:00'}),h.owner);
  await h.json('/deadlines/'+d.id+'/reminders',rule(d,{recipient:'nora@example.test',channels:['email'],sendTime:'07:00'}),h.owner);
  await h.scheduled('2026-11-13T12:00:00Z');assert.equal(reminders(h).length,0,'Quiet hours defer the scheduled send');
  await h.scheduled('2026-11-13T13:00:00Z');assert.equal(reminders(h).length,1);assert.deepEqual(reminders(h)[0].to,['nora@example.test']);
  let s=await state(h,d);assert.equal(s.rules.filter(r=>r.status==='active').length,1);assert.ok(s.deliveries.some(v=>v.recipient==='marcus@example.test'&&v.status==='cancelled'));
  const sent=s.deliveries.find(v=>v.recipient==='nora@example.test');await h.json('/reminders/'+sent.id+'/acknowledge',{},nora);
  await h.scheduled('2026-11-15T13:00:00Z');assert.equal((await state(h,d)).deliveries.filter(v=>v.stage==='escalation').length,0);
  const revoked=await deadline(h,m.id,'Return signed affidavit','2026-11-22');await h.json('/deadlines/'+revoked.id+'/reminders',rule(revoked,{recipient:'nora@example.test',channels:['email']}),h.owner);
  await h.json('/matters/'+m.id+'/access',{email:'nora@example.test',remove:true},h.owner);await h.scheduled('2026-11-15T14:00:00Z');assert.equal(reminders(h).length,1);
  assert.equal((await state(h,revoked)).deliveries[0].status,'cancelled');await h.json('/deadlines/'+revoked.id+'/reminders',undefined,nora,404);
  await h.json('/deadlines/'+revoked.id+'/reminders',rule(revoked),marcus);
  const active=(await state(h,revoked)).rules.find(r=>r.status==='active');await h.json('/reminders/rules/'+active.id+'/cancel',{reason:'Counsel rescheduled service'},marcus);await h.scheduled('2026-11-15T14:15:00Z');assert.equal(reminders(h).length,1);
  const recipientScreen=await deadline(h,m.id,'Screened recipient reminder','2026-11-24'),sponsorScreen=await deadline(h,m.id,'Screened sponsor reminder','2026-11-24');
  await h.json('/deadlines/'+recipientScreen.id+'/reminders',rule(recipientScreen,{recipient:'owner@example.test',backup:'marcus@example.test',channels:['email','workspace']}),marcus);
  await h.json('/deadlines/'+sponsorScreen.id+'/reminders',rule(sponsorScreen,{channels:['email','workspace']}),h.owner);
  await h.json('/matters/'+m.id+'/wall',{custodianEmail:'marcus@example.test',members:[],reason:'Screen adverse work before scheduled delivery',revision:null},h.owner);
  await h.scheduled('2026-11-17T14:00:00Z');assert.equal(reminders(h).length,1,'Neither an excluded recipient nor an excluded scheduling principal can cause a send');
  for(const screened of [recipientScreen,sponsorScreen]){await h.json('/deadlines/'+screened.id+'/reminders',undefined,h.owner,404);assert.ok((await state(h,screened,marcus)).deliveries.every(delivery=>delivery.status==='cancelled'));}

 }finally{await h.close();}
});
test('CAL-007 uncertain provider outcomes remain visible and need evidence; assistants cannot schedule or resolve',async()=>{
 const h=await harness({mailResponse:message=>message.subject==='Satchel deadline reminder'?new Response('Provider unavailable',{status:503}):Response.json({id:'accepted'})});try{
  const m=await open(h);await lawyer(h,'marcus@example.test','Marcus Lee',m.id);const d=await deadline(h,m.id);
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/matters/'+m.id+'/access',{email:'assistant@example.test'},h.owner);
  await h.json('/deadlines/'+d.id+'/reminders',rule(d),assistant,403);
  await h.json('/deadlines/'+d.id+'/reminders',rule(d,{sendTime:'02:30',advanceDays:257}),h.owner,400); // 8 March: nonexistent New York local time.
  await h.json('/deadlines/'+d.id+'/reminders',rule(d,{channels:['email']}),h.owner);await h.scheduled('2026-11-13T14:00:00Z');let s=await state(h,d);const uncertain=s.deliveries[0];assert.equal(uncertain.status,'uncertain');
  await h.scheduled('2026-11-13T14:15:00Z');assert.equal(reminders(h).length,1,'An uncertain send is never blindly retried');
  await h.json('/reminders/'+uncertain.id+'/resolve',{outcome:'not_delivered',evidence:'Provider log confirms request was never accepted'},assistant,403);
  await h.json('/reminders/'+uncertain.id+'/resolve',{outcome:'not_delivered'},h.owner,400);
  await h.json('/reminders/'+uncertain.id+'/resolve',{outcome:'not_delivered',evidence:'Provider incident report INC-22 confirms no accepted message'},h.owner);s=await state(h,d);
  assert.equal(s.deliveries[0].status,'uncertain');assert.equal(s.deliveries[0].resolution,'not_delivered');assert.ok(s.deliveries[0].evidence);assert.ok(s.deliveries[0].resolvedAt);
  assert.equal((await h.json('/matters/'+m.id+'/deadlines',undefined,h.owner))[0].status,'confirmed');
 }finally{await h.close();}
});
