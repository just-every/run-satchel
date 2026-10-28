import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
const hour=60*60000,minute=60000;
// Deliveries run at the first 09:00 UTC at or after a due time: outside the 22:00-06:00 quiet hours, whatever the hour the suite runs.
const daytime=at=>{const d=new Date(at);d.setUTCHours(9,0,0,0);if(d.getTime()<at)d.setUTCDate(d.getUTCDate()+1);return d.getTime();};
const lead=(h,body,cookie)=>h.json('/leads',{name:'Prospect',summary:'Estate planning question',referralSource:'Website',assignedEmail:'lawyer@example.test',...body},cookie);
const mailsTo=(h,email)=>h.mails.filter(m=>m.to.includes(email));
test('INTAKE-008 consented bounded follow-ups: authority, consent, quiet hours, contact limit, reply/opt-out/conflict/decline stops, restart and merge never supply consent',async()=>{
 const h=await harness();
 try{
  const people={};for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[role]=await h.login(email);}
  const {lawyer,assistant}=people,config=async(kind,extra={},cookie=h.owner,expected=200)=>{const current=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind===kind);return h.json('/followups/settings',{...current,enabled:true,quietStart:'22:00',quietEnd:'06:00',timezone:'UTC',maxContacts:3,...extra},cookie,expected);};
  // Authority: nothing is enabled without the principal, the firm's recorded mail authority, and a bounded email channel.
  await config('unanswered_inquiry',{},lawyer,403);await config('unanswered_inquiry',{},h.owner,409);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  await config('unanswered_inquiry',{channel:'sms'},h.owner,400);await config('unanswered_inquiry',{quietStart:'22:00',quietEnd:'22:00'},h.owner,400);await config('unanswered_inquiry',{steps:[{afterMinutes:4320},{afterMinutes:1440}]},h.owner,400);
  await config('unanswered_inquiry',{steps:[{afterMinutes:1440},{afterMinutes:4320}]});await config('engagement_chase',{maxContacts:1,steps:[{afterMinutes:1440},{afterMinutes:2880}]});
  const prospect=await lead(h,{name:'Elena Rivera',email:'elena@example.test'},h.owner);
  // No consent, no sequence; a contact merge supplies none.
  await h.json('/leads/'+prospect.id+'/followups',{kind:'unanswered_inquiry'},h.owner,409);
  const twin=await lead(h,{name:'Elena R.',email:'elena.r@example.test'},h.owner);await h.json('/leads/'+twin.id+'/consents',{channel:'email',source:'Phone call on file',text:'Agreed to email follow-ups'},h.owner);
  await h.json('/leads/'+twin.id+'/followups',{kind:'unanswered_inquiry'},h.owner);
  const merged=await h.json('/leads/'+twin.id+'/merge',{intoId:prospect.id,revision:twin.revision,intoRevision:prospect.revision,reason:'Same person, second form'},h.owner);
  await h.json('/leads/'+prospect.id+'/followups',{kind:'unanswered_inquiry'},h.owner,409);
  assert.equal(merged.id,prospect.id);assert.deepEqual((await h.json('/leads/'+prospect.id+'/followups',undefined,h.owner)).consents,[]);
  await h.json('/leads/'+prospect.id+'/consents',{channel:'sms',source:'x',text:'x'},h.owner,400);await h.json('/leads/'+prospect.id+'/consents',{channel:'email',source:'Phone call, 2026-10-22',text:'Agreed to two email follow-ups'},lawyer);
  // A consented lead's sequence is scheduled, then a reply after the first message halts it across a worker restart.
  const started=await h.json('/leads/'+prospect.id+'/followups',{kind:'unanswered_inquiry'},lawyer);const f=started.followups[0];assert.equal(f.sends.length,2);assert.equal(f.status,'active');
  const first=Date.parse(f.sends[0].dueAt),second=Date.parse(f.sends[1].dueAt);
  await h.scheduled(first-minute);assert.equal(mailsTo(h,'elena@example.test').length,0,'Nothing is sent before its time');
  // Quiet hours hold the message instead of sending it.
  const quiet=new Date(first);quiet.setUTCHours(23,0,0,0);if(quiet.getTime()<first)quiet.setUTCDate(quiet.getUTCDate()+1);
  await h.scheduled(quiet.getTime());assert.equal(mailsTo(h,'elena@example.test').length,0,'Quiet hours defer the send');
  const open=new Date(quiet);open.setUTCDate(open.getUTCDate()+1);open.setUTCHours(9,0,0,0);
  await h.scheduled(open.getTime());const sent=mailsTo(h,'elena@example.test');assert.equal(sent.length,1);assert.match(sent[0].text,/To stop these messages, open .*\/followup\//);assert.doesNotMatch(sent[0].text,/Estate planning/);
  await h.json('/leads/'+prospect.id+'/followup-events',{kind:'reply'},lawyer,400);
  const stopped=await h.json('/leads/'+prospect.id+'/followup-events',{kind:'reply',note:'Elena replied asking for a call on Thursday'},assistant,404);
  const replied=await h.json('/leads/'+prospect.id+'/followup-events',{kind:'reply',note:'Elena replied asking for a call on Thursday'},lawyer);
  assert.equal(replied.followups[0].status,'stopped');assert.equal(replied.followups[0].stopReason,'reply');assert.equal(replied.followups[0].humanOwner,'lawyer@example.test');assert.match(replied.followups[0].nextAction,/Respond to the prospect/);
  await h.restart();await h.scheduled(daytime(second+hour*24*30));assert.equal(mailsTo(h,'elena@example.test').length,1,'Later sends stop after the restart');
  const after=await h.json('/leads/'+prospect.id+'/followups',undefined,lawyer),detail=await h.json('/leads/'+prospect.id,undefined,lawyer);
  assert.equal(after.followups[0].sends.at(-1).status,'cancelled');assert.equal(after.followups[0].humanOwner,'lawyer@example.test');assert.match(detail.nextAction,/Respond to the prospect/);assert.ok(detail.history.some(e=>e.kind==='followup_stopped'));
  // Prospect opt-out through the message link revokes consent and stops the sequence for good.
  const optLead=await lead(h,{name:'Opal Out',email:'opal@example.test'},h.owner);await h.json('/leads/'+optLead.id+'/consents',{channel:'email',source:'Web form checkbox',text:'Agreed'},h.owner);
  const optStart=(await h.json('/leads/'+optLead.id+'/followups',{kind:'unanswered_inquiry'},h.owner)).followups[0],due=Date.parse(optStart.sends[0].dueAt);
  await h.scheduled(daytime(due));const link=mailsTo(h,'opal@example.test')[0].text.match(/followup\/([0-9a-f-]+)\/([0-9a-f]{64})/);assert.ok(link);
  assert.equal((await h.request('/api/satchel/followups/'+link[1]+'/opt-out/'+'0'.repeat(64),{})).status,404);assert.equal((await h.request('/api/satchel/followups/'+link[1]+'/opt-out/'+link[2],{},'',{origin:'https://evil.example'})).status,403);
  assert.equal((await h.request('/api/satchel/followups/'+link[1]+'/opt-out/'+link[2],{})).status,200);
  const opted=await h.json('/leads/'+optLead.id+'/followups',undefined,h.owner);assert.ok(opted.consents[0].revokedAt);assert.equal(opted.followups[0].stopReason,'opt_out');await h.scheduled(daytime(due+60*24*hour));assert.equal(mailsTo(h,'opal@example.test').length,1);
  await h.json('/leads/'+optLead.id+'/followups',{kind:'unanswered_inquiry'},h.owner,409);
  // Contact limit: one message in seven days, whatever the sequences.
  const chase=await lead(h,{name:'Chase Cap',email:'chase@example.test'},h.owner);await h.json('/leads/'+chase.id+'/consents',{channel:'email',source:'Email reply',text:'Agreed'},h.owner);
  const cap=(await h.json('/leads/'+chase.id+'/followups',{kind:'engagement_chase'},h.owner)).followups[0],capStart=Date.parse(cap.sends[0].dueAt);
  await h.scheduled(daytime(capStart));assert.equal(mailsTo(h,'chase@example.test').length,1);await h.scheduled(daytime(Date.parse(cap.sends[1].dueAt)));assert.equal(mailsTo(h,'chase@example.test').length,1,'The limit defers the second message');
  await h.scheduled(daytime(capStart+8*24*hour));assert.equal(mailsTo(h,'chase@example.test').length,2,'It is sent once the limit window passes');
  // Conflict and decline stops: only counsel records a conflict; a lost lead halts its sequence.
  const conflict=await lead(h,{name:'Con Flict',email:'con@example.test'},h.owner),declined=await lead(h,{name:'Dee Cline',email:'dee@example.test'},h.owner);
  for(const l of [conflict,declined]){await h.json('/leads/'+l.id+'/consents',{channel:'email',source:'Email reply',text:'Agreed'},h.owner);await h.json('/leads/'+l.id+'/followups',{kind:'unanswered_inquiry'},h.owner);}
  await h.json('/leads/'+conflict.id+'/followup-events',{kind:'conflict',note:'Adverse to an existing client'},assistant,404);
  const c=await h.json('/leads/'+conflict.id+'/followup-events',{kind:'conflict',note:'Adverse to an existing client'},lawyer);assert.equal(c.followups[0].stopReason,'conflict');assert.match(c.followups[0].nextAction,/Conflict stop/);
  await h.json('/leads/'+declined.id,{revision:(await h.json('/leads/'+declined.id,undefined,h.owner)).revision,lostReason:'Prospect declined by phone'},h.owner);
  assert.equal((await h.json('/leads/'+declined.id+'/followups',undefined,h.owner)).followups[0].stopReason,'declined');
  await h.scheduled(daytime(Date.now()+90*24*hour));assert.equal(mailsTo(h,'con@example.test').length+mailsTo(h,'dee@example.test').length,0);
 }finally{await h.close();}
});

// Exercise the authenticated HTTP door without putting response bodies in assertion failures.
test('follow-up events treat inherited names exactly like unknown names for a signed-in member',async()=>{
 const h=await harness({bindings:{MAIL_API_KEY:'test-only-prototype-door-binding-sentinel'}});
 try{
  const json=async(path,body,cookie)=>{
   const response=await h.request('/api/satchel'+path,body,cookie);
   assert.equal(response.status,200,'Fixture or history request succeeds');
   try{return await response.json();}catch{assert.fail('Fixture or history response must be valid JSON');}
  };
  const email='lawyer@example.test';
  await json('/team',{email,name:'Follow-up lawyer',role:'lawyer'},h.owner);
  await json('/team/invite',{email},h.owner);
  const member=await h.login(email),prospect=await json('/leads',{name:'Prototype door prospect',summary:'Estate planning question',referralSource:'Website',assignedEmail:email},h.owner);
  const path='/api/satchel/leads/'+prospect.id+'/followup-events';
  const results=[];
  for(const kind of ['unknown-followup-event','constructor','__proto__','reply']){
   const response=await h.request(path,{kind,note:'Prospect replied requesting a call'},member);
   results.push({kind,status:response.status,body:await response.text()});
  }
  console.log('follow-up event HTTP statuses: '+results.map(r=>r.kind+'='+r.status).join(', '));
  const unknown=results[0];
  assert.equal(unknown.status,400,'Unknown event uses the existing 400 refusal');
  assert.ok(unknown.body===JSON.stringify({error:'Choose reply, conflict or declined'}),'Unknown event returns only the documented refusal');
  for(const result of results.slice(1,3)){
   assert.equal(result.status,unknown.status,result.kind+' uses the unknown-event status');
   assert.ok(result.body===unknown.body,result.kind+' returns only the unknown-event refusal, with no binding or environment content');
  }
  assert.equal(results[3].status,200,'A registered reply still works for the member');
  const detail=await json('/leads/'+prospect.id,undefined,member);
  assert.ok(detail.history.some(e=>e.kind==='followup_reply'),'The registered reply is recorded');
 }finally{await h.close();}
});
