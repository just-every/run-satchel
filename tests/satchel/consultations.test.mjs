import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {formInput,intakeTeam} from './intake-fixture.mjs';
const zoneDay=(offset,zone)=>{const d=new Date(Date.now()+offset*86400000),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).formatToParts(d).map(p=>[p.type,p.value]));return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1;};
const localIn=(iso,zone)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso));
const book=(h,offer,slot,who,extra={})=>h.request('/api/satchel/consult/'+offer.id+'/book',{slot:slot.start,timezone:'Asia/Tokyo',name:who,email:who.toLowerCase().replace(/\W+/g,'.')+'@example.test',phone:'',summary:'Need advice on parenting arrangements',consent:true,feeAcknowledged:true,website:'',answers:{children:'no'},...extra});
const mailText=h=>h.mails.map(m=>m.text??'').join('\n');
test('INTAKE-003 prospects book approved availability across timezones: last slot, a race, reschedule, cancel, fee, reminders, one appointment and the linked intake record',async()=>{
 const h=await harness();
 try{
  const people=await intakeTeam(h),lawyer=people['lawyer@example.test'];
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address:{line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'},timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main office',phone:'212-555-0100',timezone:'America/New_York',address:{line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'}}],practiceAreas:[{code:'FAM',name:'Family law'}]}},h.owner);
  const form=await h.json('/intake/forms',{...formInput,practiceCode:'FAM'},h.owner);
  const base={title:'Family law consultation',lawyerEmail:'lawyer@example.test',timezone:'America/New_York',durationMinutes:60,bufferBefore:15,bufferAfter:15,windows:[2,3,4].map(n=>({day:zoneDay(n,'America/New_York'),start:'09:00',end:'10:00'})),noticeHours:0,horizonDays:5,feeCents:15000,formId:form.id,consentText:'I consent to this firm reviewing my inquiry and booking a consultation.',published:true};
  await h.json('/consult/offers',base,people['other@example.test'],403);await h.json('/consult/offers',{...base,windows:[{day:9,start:'09:00',end:'10:00'}]},h.owner,400);
  const offer=await h.json('/consult/offers',base,h.owner);
  const open=await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo');assert.equal(open.slots.length,3,'One approved start per approved day');assert.equal(open.feeCents,15000);
  for(const s of open.slots)assert.equal(s.local,localIn(s.start,'Asia/Tokyo'),'Times convert to the prospect timezone');
  assert.match(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(new Date(open.slots[0].start)),/^0?9$/,'The window is the offer timezone, so the slot is 9:00 there');
  await h.json('/consult/'+offer.id+'?tz=Mars/Base',undefined,'',400);
  // Reminders are consented, bounded by the principal's settings and sent only under the firm's recorded mail authority.
  const settings=await h.json('/followups/settings',undefined,h.owner),reminder=settings.settings.find(s=>s.kind==='consultation_reminder');
  await h.json('/followups/settings',{...reminder,enabled:true,quietStart:'22:00',quietEnd:'06:00',timezone:'America/New_York'},h.owner,409);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  await h.json('/followups/settings',{...reminder,enabled:true,quietStart:'22:00',quietEnd:'06:00',timezone:'America/New_York'},h.owner);
  // Elena books the first slot; fees need acknowledgment; the same slot cannot be taken twice.
  assert.equal((await book(h,offer,open.slots[0],'Elena Rivera',{feeAcknowledged:false})).status,400);
  const first=await book(h,offer,open.slots[0],'Elena Rivera',{reminderConsent:true});assert.equal(first.status,200);const elena=await first.json();assert.equal(elena.feeStatus,'due_at_consultation');assert.equal(elena.reminders,true);assert.ok(elena.receipt);
  assert.equal((await book(h,offer,open.slots[0],'Late Prospect')).status,409);
  assert.equal((await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo')).slots.length,2,'A booked start and its buffers are no longer offered');
  // Tom takes the middle slot; the last available slot is raced by two prospects: exactly one appointment results.
  const afterElena=(await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo')).slots,tom=await (await book(h,offer,afterElena[0],'Tom Hale')).json();
  const last=(await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo')).slots;assert.equal(last.length,1);
  const race=await Promise.all([book(h,offer,last[0],'Rob Stone'),book(h,offer,last[0],'Sam Reed')]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal((await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo')).slots.length,0);
  const booked=(await h.json('/consultations',undefined,lawyer)).consultations;assert.equal(booked.length,3,'One appointment per winning booking reaches the responsible lawyer');assert.equal(new Set(booked.map(c=>c.start)).size,3);
  assert.equal((await h.json('/consultations',undefined,people['officer@example.test'],403)).error!==undefined,true);
  // Elena's linked records: one lead assigned to the lawyer, one immutable intake record with her answers.
  const mine=booked.find(c=>c.leadName==='Elena Rivera'),lead=await h.json('/leads/'+mine.leadId,undefined,lawyer);assert.equal(lead.assignedEmail,'lawyer@example.test');assert.ok(lead.history.some(e=>e.kind==='consultation_booked'&&e.detail.intakeSubmissionId));
  const intake=await h.json('/leads/'+mine.leadId+'/intake',undefined,lawyer);assert.equal(intake.submissions.length,1);assert.deepEqual(intake.submissions[0].answers.map(a=>a.value),['no']);
  await h.json('/consult/manage/not-a-token',undefined,'',404);
  // Tom cancels through his link; Elena reschedules from Los Angeles into the freed slot: still one appointment.
  const manage=t=>'/consult/manage/'+t,tomView=await h.json(manage(tom.manageToken)+'?tz=Asia/Tokyo');assert.equal(tomView.status,'booked');
  assert.equal((await h.request('/api/satchel'+manage(tom.manageToken)+'/cancel',{})).status,200);
  const view=await h.json(manage(elena.manageToken)+'?tz=America/Los_Angeles');assert.ok(view.slots.length>=1);const target=view.slots.find(s=>s.start!==view.start&&s.start===tomView.start);assert.ok(target,'The cancelled slot is available again');
  assert.equal(target.local,localIn(target.start,'America/Los_Angeles'));
  const moved=await h.json(manage(elena.manageToken)+'/reschedule',{slot:target.start,timezone:'America/Los_Angeles'});assert.equal(moved.start,target.start);assert.equal(moved.timezone,'America/Los_Angeles');
  const after=(await h.json('/consultations',undefined,lawyer)).consultations.filter(c=>c.status==='booked');assert.equal(after.filter(c=>c.leadName==='Elena Rivera').length,1);assert.equal(after.filter(c=>c.leadName==='Elena Rivera')[0].start,target.start);assert.equal(after.length,2);
  assert.ok(after.find(c=>c.leadName==='Elena Rivera').history.some(e=>e.kind==='rescheduled'));
  assert.ok((await h.json('/consult/'+offer.id+'?tz=Asia/Tokyo')).slots.some(s=>s.start===open.slots[0].start),'Her old start is free again');
  // Reminders follow the consultation: none at the old time, one at the new time naming only the appointment and links.
  const before=h.mails.length;await h.scheduled(Date.parse(open.slots[0].start)-86400000+60000);assert.equal(h.mails.length,before,'Old-time reminders were cancelled');
  await h.scheduled(Date.parse(target.start)-86400000+60000);const sent=h.mails.slice(before);assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['elena.rivera@example.test']);
  assert.ok(sent[0].text.includes(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',dateStyle:'full',timeStyle:'short'}).format(new Date(target.start))+' (America/Los_Angeles)'));assert.match(sent[0].text,/\/consultation\/[a-f0-9]{64}/);assert.match(sent[0].text,/To stop these messages, open .*\/followup\//);assert.doesNotMatch(sent[0].text,/parenting/);
  await h.restart();await h.scheduled(Date.parse(target.start)-86400000+120000);assert.equal(h.mails.length,before+1,'A restarted worker never repeats a sent reminder');
  // The lawyer's own cancellation stops the rest and leaves a human next action; the lead stays.
  const mineNow=after.find(c=>c.leadName==='Elena Rivera');await h.json('/consultations/'+mineNow.id+'/cancel',{reason:'Lawyer unavailable'},lawyer);
  await h.scheduled(Date.parse(target.start)-3600000+60000);assert.equal(h.mails.length,before+1);const cancelled=await h.json('/leads/'+mine.leadId,undefined,lawyer);assert.match(cancelled.nextAction,/Consultation cancelled/);
  await h.json('/consult/'+offer.id+'?tz=UTC',undefined,'',200);
  const stranger=await h.request('/api/satchel/consult/'+offer.id+'/book',{slot:open.slots[1].start,timezone:'UTC',name:'X',email:'x@example.test',summary:'x',consent:true,feeAcknowledged:true,website:'',answers:{children:'no'}},'',{origin:'https://evil.example'});assert.equal(stranger.status,403);
 }finally{await h.close();}
});
