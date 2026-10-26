import {consolidatedFixture} from './consolidated-statement-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

import {scheme,draft,reviewed as approvedInvoice} from './invoice-numbering-fixture.mjs';
async function mailSetup(h){
 const m=await open(h,'Reviewed client mail','Mail Client','Mail Adverse'),base='/matters/'+m.id;
 for(const [email,role] of [['client@example.test','client'],['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,role,name:role},h.owner);await h.json('/team/invite',{email},h.owner);}
 const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
 await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
 await h.json(base+'/portal',{email:'client@example.test',reason:'Exact client recipient authority'},h.owner);
 const graph=await h.json('/contacts',undefined,h.owner),contact=graph.contacts.find(c=>c.name==='Mail Client');
 await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:['client@example.test']},h.owner);
 const consent=async(id,decision)=>{const graph=await h.json('/contacts',undefined,h.owner);return h.json('/contacts/'+id+'/consent',{revision:graph.revision,channel:'email',decision,evidenceDate:'2026-10-20',source:'Synthetic client communication instructions'},h.owner);};
 return {m,base,lawyer,assistant,contact,consent};
}
const letter={recipient:'client@example.test',subject:'Reviewed letter',body:'Counsel reviewed these exact letter bytes.',reviewNote:'Counsel explicitly authorizes this exact recipient and content'};
test('Reviewed correspondence sends once, reconciles provider bounce and complaint, and retains uncertain delivery until a new human decision',async()=>{
 let lost=false,outcome='delivered',receiptRecipient='client@example.test',sequence=0;
 const h=await harness({mailResponse:message=>lost&&message.subject===letter.subject?new Response('unavailable',{status:503}):Response.json({id:'synthetic-satchel-'+(++sequence)}),mailReadback:request=>Response.json({id:decodeURIComponent(new URL(request.url).pathname.split('/').at(-1)),to:[receiptRecipient],last_event:outcome})});
 try{
  const {m,base,lawyer,assistant,contact,consent}=await mailSetup(h);
  await h.json(base+'/correspondence',letter,h.owner,409);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  await h.json(base+'/correspondence',letter,h.owner,409);await consent(contact.id,'allowed');
  await h.json(base+'/correspondence',letter,assistant,403);
  await h.json(base+'/correspondence',{...letter,recipient:'stranger@example.test'},lawyer,409);
  await h.json(base+'/correspondence',{...letter,subject:'Header\r\nInjected'},lawyer,400);
  const l=await h.json(base+'/correspondence',letter,lawyer),send='/mail-attempts/'+l.attemptId+'/send',before=h.mails.length;
  let state=await h.json(send,{},lawyer);assert.equal(h.mails.length,before+1);assert.equal(h.mails.at(-1).text,letter.body);assert.deepEqual(h.mails.at(-1).to,[letter.recipient]);assert.equal(state.messages[0].attempts[0].status,'accepted');assert.ok(state.messages[0].attempts[0].provider_id);
  await h.json(send,{},lawyer);assert.equal(h.mails.length,before+1,'Retrying the application request never sends twice');
  const reconcile='/mail-attempts/'+l.attemptId+'/reconcile';
  receiptRecipient='other@example.test';await h.json(reconcile,{},lawyer,409);receiptRecipient=letter.recipient;
  outcome='bounced';state=await h.json(reconcile,{},lawyer);assert.equal(state.messages[0].attempts[0].outcome,'bounced');
  outcome='sent';state=await h.json(reconcile,{},lawyer);assert.equal(state.messages[0].attempts[0].outcome,'bounced','A later accepted read cannot hide the bounce');
  outcome='complained';state=await h.json(reconcile,{},lawyer);assert.equal(state.messages[0].attempts[0].outcome,'complained');assert.equal(state.messages[0].attempts[0].events.length,3);assert.match(state.messages[0].attempts[0].nextAction,/review consent/);
  lost=true;const uncertain=await h.json(base+'/correspondence',letter,lawyer),uncertainSend='/mail-attempts/'+uncertain.attemptId+'/send';
  state=await h.json(uncertainSend,{},lawyer);let u=state.messages.find(m=>m.id===uncertain.id);assert.equal(u.attempts.length,1);assert.equal(u.attempts[0].status,'uncertain');assert.match(u.attempts[0].nextAction,/Check the provider/);
  const n=h.mails.length;await h.restart();await h.scheduled('2026-11-01T12:00:00Z');await h.json(uncertainSend,{},lawyer);assert.equal(h.mails.length,n);state=await h.json(base+'/correspondence',undefined,lawyer);assert.equal(state.messages.find(m=>m.id===uncertain.id).attempts.length,1);
  await h.json('/mail-attempts/'+uncertain.attemptId+'/resend-review',{reason:''},lawyer,400);
  const retry=await h.json('/mail-attempts/'+uncertain.attemptId+'/resend-review',{reason:'Provider inspected; counsel accepts duplicate-delivery risk and authorizes another attempt'},lawyer);
  lost=false;state=await h.json('/mail-attempts/'+retry.attemptId+'/send',{},lawyer);u=state.messages.find(m=>m.id===uncertain.id);assert.equal(u.attempts.length,2);assert.equal(u.attempts.filter(a=>a.status==='uncertain').length,1);assert.equal(u.attempts.filter(a=>a.status==='accepted').length,1);assert.notEqual(u.attempts[0].id,u.attempts[1].id);assert.equal(h.mails.length,n+1,'A new audited decision sends once');await h.json('/mail-attempts/'+retry.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,n+1);
  outcome='delivered';state=await h.json('/mail-attempts/'+retry.attemptId+'/reconcile',{},lawyer);assert.equal(state.messages.find(m=>m.id===uncertain.id).attempts.find(a=>a.id===retry.attemptId).outcome,'delivered');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('s_correspondence_events'));assert.ok(archive.includes(letter.body));
  const audit=await h.json('/audit?matterId='+m.id+'&action=correspondence.resend_reviewed',undefined,h.owner);assert.equal(audit.records.length,1);
 }finally{await h.close();}
});
test('Correspondence requires current affirmative consent on every merged identity before sending',async()=>{
 const h=await harness();try{
  const {base,lawyer,contact,consent}=await mailSetup(h);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  const count=h.mails.length;await h.json(base+'/correspondence',letter,lawyer,409);await consent(contact.id,'allowed');
  const graph=await h.json('/contacts',undefined,h.owner),duplicate=await h.json('/contacts',{revision:graph.revision,kind:'person',name:'Mail duplicate',emails:['duplicate@example.test']},h.owner);
  const preview=await h.json('/contacts/merge-preview',{survivorId:contact.id,duplicateId:duplicate.id,reason:'Reviewed same identity'},h.owner);await h.json('/contacts/merge',{previewId:preview.id},h.owner);
  await h.json(base+'/correspondence',letter,lawyer,409);await consent(duplicate.id,'denied');await h.json(base+'/correspondence',letter,lawyer,409);
  assert.equal(h.mails.length,count,'One unknown or denied merged identity prevents any provider submission');
  await consent(duplicate.id,'allowed');const fresh=await h.json(base+'/correspondence',letter,lawyer);
  await h.json('/mail-attempts/'+fresh.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+1,'All merged identities consented permits one send');
 }finally{await h.close();}
 await proveConsentWithdrawal();
});

test('Correspondence rechecks provider review, portal authority, counsel permission and matter access at send',async()=>{
 await proveProviderReview();
 const h=await harness();try{
  const {base,lawyer,assistant,contact,consent}=await mailSetup(h);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);await consent(contact.id,'allowed');
  const first=await h.json(base+'/correspondence',letter,lawyer),count=h.mails.length;
  await h.json('/mail-attempts/'+first.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+1,'Current portal authority permits a send');
  const second=await h.json(base+'/correspondence',letter,lawyer);
  await h.json('/mail-attempts/'+second.attemptId+'/send',{},assistant,403);
  await h.json(base+'/access',{email:'lawyer@example.test',remove:true},h.owner);await h.json(base+'/correspondence',undefined,lawyer,404);await h.json('/mail-attempts/'+second.attemptId+'/send',{},lawyer,404);await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  const grants=await h.json(base+'/portal',undefined,h.owner);await h.json('/portal-grants/'+grants.grants.find(g=>!g.revokedAt).id+'/revoke',{reason:'Client authority withdrawn'},h.owner);await h.json('/mail-attempts/'+second.attemptId+'/send',{},lawyer,409);await h.json(base+'/correspondence',letter,lawyer,409);
  await h.json(base+'/portal',{email:letter.recipient,reason:'Fresh grant'},h.owner);const fresh=await h.json(base+'/correspondence',letter,lawyer);
  await h.json(base+'/wall',{reason:'Confidential client matter',custodianEmail:'owner@example.test',members:['owner@example.test'],revision:null},h.owner);
  await h.json('/mail-attempts/'+fresh.attemptId+'/send',{},lawyer,404);await h.json(base+'/correspondence',letter,h.owner,409);
  assert.equal(h.mails.length,count+1,'Every refused action sends nothing');
 }finally{await h.close();}
});
test('Correspondence sends plain text without attachments and issued invoice notices disclose only sign-in instructions',async()=>{
 const h=await harness();try{
  const {m,base,lawyer,contact,consent}=await mailSetup(h);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);await consent(contact.id,'allowed');
  const reviewed=await h.json(base+'/correspondence',{...letter,html:'<b>Unreviewed markup</b>',attachments:[{filename:'private.txt',content:'private bytes'}]},lawyer);
  await h.json('/mail-attempts/'+reviewed.attemptId+'/send',{},lawyer);
  const payload=h.mails.at(-1);assert.equal(payload.text,letter.body);assert.equal(payload.html,'');assert.equal(payload.attachments,undefined);assert.ok(!JSON.stringify(payload).includes('private bytes'));
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await approvedInvoice(h,m,await draft(h,m));
  const count=h.mails.length;await h.json(base+'/correspondence',{...letter,billId:bill.id},lawyer,409);assert.equal(h.mails.length,count,'An approved but unissued invoice sends no notice');
  await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  await h.json(base+'/correspondence',{...letter,billId:'unissued'},lawyer,409);
  const invoice=await h.json(base+'/correspondence',{...letter,billId:bill.id},lawyer);await h.json('/mail-attempts/'+invoice.attemptId+'/send',{},lawyer);
  const notification=h.mails.at(-1);assert.equal(notification.subject,'An invoice is available');assert.equal(notification.text,'An invoice is available. Sign in to the secure portal to review it. '+h.origin+'/app');assert.equal(notification.html,'');assert.equal(notification.attachments,undefined);
  for(const forbidden of [m.title,m.client,bill.number,'375.00','37500',letter.body])if(forbidden)assert.ok(!JSON.stringify(notification).includes(forbidden),String(forbidden));
 }finally{await h.close();}
});
async function proveConsentWithdrawal(){
 const h=await harness();try{
  const {base,lawyer,contact,consent}=await mailSetup(h);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);await consent(contact.id,'allowed');
  const first=await h.json(base+'/correspondence',letter,lawyer),count=h.mails.length;await h.json('/mail-attempts/'+first.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+1);
  const next=await h.json(base+'/correspondence',letter,lawyer);await consent(contact.id,'denied');await h.json('/mail-attempts/'+next.attemptId+'/send',{},lawyer,409);await h.json(base+'/correspondence',letter,lawyer,409);assert.equal(h.mails.length,count+1,'Withdrawal stops the next send');
  await consent(contact.id,'allowed');await h.json('/mail-attempts/'+next.attemptId+'/send',{},lawyer,409);const fresh=await h.json(base+'/correspondence',letter,lawyer);await h.json('/mail-attempts/'+fresh.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+2,'Renewed consent needs a new exact review');
 }finally{await h.close();}
}


const reminderAt='2026-11-01T12:00:00.000Z';
async function reminderSetup(h,maxContacts=3){
 const setup=await mailSetup(h),{m,base,lawyer,contact,consent}=setup;
 await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);await consent(contact.id,'allowed');
 await h.json(base+'/stage-profile',{revision:null,lawyerEmail:'lawyer@example.test'},h.owner);
 const invoice=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Counsel approves exact sign-in-only invoice notice'},lawyer);
 const appointment=await h.json('/client-reminder-templates',{kind:'appointment',confirmed:true,reason:'Counsel approves exact confidential appointment notice'},lawyer);
 const decision={enabled:true,invoiceTemplate:invoice.id,appointmentTemplate:appointment.id,maxContacts,reason:'Responsible counsel opts this matter into these exact templates'};
 const authorize=()=>h.json(base+'/client-reminders',decision,lawyer);
 await authorize();
 await h.json('/invoice-numbering',scheme(),h.owner);const bill=await approvedInvoice(h,m,await draft(h,m));await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
 const event=await h.json(base+'/appointments',{title:'Private client appointment',date:'2026-11-05',time:'10:00',durationMinutes:45,timezone:'UTC',frequency:'once',interval:1,occurrences:1,attendees:['lawyer@example.test']},lawyer);
 const schedule=(kind='invoice',dueAt=reminderAt)=>h.json(base+'/client-reminders/schedule',{recipient:'client@example.test',dueAt,...(kind==='invoice'?{billId:bill.id}:{appointmentId:event.id})},lawyer);
 return {...setup,invoice,appointment,decision,authorize,schedule,bill,event,state:()=>h.json(base+'/client-reminders',undefined,lawyer)};
}
test('Client reminders require per-matter opt-in from current responsible counsel and stop after authority changes',async()=>{
 const h=await harness();try{
  const s=await reminderSetup(h),{base,lawyer,assistant}=s;
  await h.json(base+'/client-reminders',s.decision,h.owner,403);await h.json(base+'/client-reminders',s.decision,assistant,403);
  await h.json(base+'/client-reminders',{...s.decision,enabled:false,reason:'Responsible counsel withdraws automation'},lawyer);
  await h.json(base+'/client-reminders/schedule',{recipient:letter.recipient,billId:s.bill.id,dueAt:reminderAt},lawyer,409);
  await s.authorize();await s.schedule();const count=h.mails.length;
  await h.json(base+'/client-reminders',{...s.decision,enabled:false,reason:'Withdraw before the next send'},lawyer);await h.scheduled(reminderAt);assert.equal(h.mails.length,count);
  await s.authorize();await s.schedule('appointment');let profile=(await h.json(base+'/stage',undefined,h.owner)).profile;
  await h.json(base+'/stage-profile',{revision:profile.revision,lawyerEmail:'owner@example.test'},h.owner);await h.scheduled(reminderAt);assert.equal(h.mails.length,count,'Reassignment invalidates former counsel authority');
 }finally{await h.close();}
});
async function assertReminderTemplateVersions(){
 const h=await harness();try{
  const s=await reminderSetup(h);await h.json('/client-reminder-templates',{kind:'invoice',reason:'Unconfirmed'},s.lawyer,400);await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Not counsel'},s.assistant,403);
  const job=await s.schedule();const newer=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'A later separate approval',body:'Private matter and amount'},s.lawyer);
  assert.notEqual(newer.id,s.invoice.id);await h.restart();const before=await s.state();assert.equal(before.jobs.find(j=>j.id===job.id).template_id,s.invoice.id);
  assert.equal(before.templates.find(t=>t.id===s.invoice.id).body,s.invoice.body);assert.equal(newer.body,s.invoice.body,'Unapproved supplied content cannot change confidential template bytes');
  await h.scheduled(reminderAt);assert.equal((await s.state()).jobs.find(j=>j.id===job.id).outcome,'accepted');assert.equal(h.mails.at(-1).text,s.invoice.body+' '+h.origin+'/app');
 }finally{await h.close();}
}

test('Scheduled invoice and appointment reminders survive restart, share a recipient rate cap, and never automatically resend unknown acknowledgments',async()=>{
 let lost=false;
 const h=await harness({mailResponse:message=>lost&&message.subject==='An appointment reminder is available'?new Response('unavailable',{status:503}):Response.json({id:'synthetic-satchel-2'})});try{
  const s=await reminderSetup(h,2);await s.schedule();await s.schedule('appointment');await s.schedule('invoice','2026-11-01T12:01:00.000Z');const count=h.mails.length;
  await h.scheduled('2026-11-01T11:59:00.000Z');assert.equal(h.mails.length,count);await h.restart();lost=true;await h.scheduled('2026-11-01T12:02:00.000Z');
  assert.equal(h.mails.length,count+2);let state=await s.state();assert.equal(state.jobs.filter(j=>j.outcome==='accepted').length,1);assert.equal(state.jobs.filter(j=>j.outcome==='uncertain').length,1);assert.equal(state.jobs.filter(j=>j.status==='stopped').length,1);
  for(const mail of h.mails.slice(count)){assert.equal(mail.html,'');assert.equal(mail.attachments,undefined);assert.match(mail.text,/Sign in to the secure portal/);for(const privateText of [s.m.title,s.bill.number,'375.00','Private client appointment'])assert.ok(!JSON.stringify(mail).includes(privateText));}
  await h.restart();await h.scheduled('2026-11-02T12:00:00.000Z');assert.equal(h.mails.length,count+2,'Unknown acknowledgment and cap never retry automatically');

 }finally{await h.close();}
});
test('Client reminder withdrawal and merged consent, portal revocation, permission and matter walls are rechecked before scheduled sends',async()=>{
 const h=await harness();try{
  const s=await reminderSetup(h),count=h.mails.length;await s.schedule();await s.consent(s.contact.id,'denied');await h.scheduled(reminderAt);assert.equal(h.mails.length,count,'Withdrawal stops the next send');
  await s.consent(s.contact.id,'allowed');await s.schedule('appointment');const graph=await h.json('/contacts',undefined,h.owner),duplicate=await h.json('/contacts',{revision:graph.revision,kind:'person',name:'Reminder duplicate',emails:['duplicate@example.test']},h.owner);
  const preview=await h.json('/contacts/merge-preview',{survivorId:s.contact.id,duplicateId:duplicate.id,reason:'Reviewed same identity'},h.owner);await h.json('/contacts/merge',{previewId:preview.id},h.owner);await h.scheduled(reminderAt);assert.equal(h.mails.length,count,'One unconsented merged identity stops scheduled mail');
  await s.consent(duplicate.id,'allowed');await s.schedule('invoice','2026-11-01T12:01:00.000Z');await h.scheduled('2026-11-01T12:02:00.000Z');assert.equal(h.mails.length,count+1,'All merged identities consented permits scheduled mail');
  await s.schedule('appointment','2026-11-01T12:03:00.000Z');const portal=await h.json(s.base+'/portal',undefined,h.owner);await h.json('/portal-grants/'+portal.grants.find(g=>!g.revokedAt).id+'/revoke',{reason:'Client portal authority withdrawn'},h.owner);await h.scheduled('2026-11-01T12:04:00.000Z');assert.equal(h.mails.length,count+1);
  await h.json(s.base+'/portal',{email:letter.recipient,reason:'New reviewed grant'},h.owner);await s.schedule('invoice','2026-11-01T12:05:00.000Z');await h.json(s.base+'/access',{email:'lawyer@example.test',remove:true},h.owner);await h.scheduled('2026-11-01T12:06:00.000Z');assert.equal(h.mails.length,count+1);
  await h.json(s.base+'/access',{email:'lawyer@example.test'},h.owner);await s.schedule('appointment','2026-11-01T12:07:00.000Z');
  const role=await h.json('/roles',{name:'Read-only correspondence',permissions:{rates:'all',bank:'none',reports:'own',contacts:'read',documents:'read',billing:'read',settings:'none'},reason:'Counsel no longer has sending permissions'},h.owner);
  await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer',customRoleId:role.id},h.owner);await h.scheduled('2026-11-01T12:08:00.000Z');assert.equal(h.mails.length,count+1,'Current custom permissions are checked at execution');
  await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer',customRoleId:null},h.owner);await s.schedule('appointment','2026-11-01T12:09:00.000Z');await h.json(s.base+'/wall',{reason:'Restricted client',custodianEmail:'owner@example.test',members:['owner@example.test'],revision:null},h.owner);await h.scheduled('2026-11-01T12:10:00.000Z');assert.equal(h.mails.length,count+1);
 }finally{await h.close();}
});
test('Every scheduled client reminder send retains its approved template version in durable audit and needs a new decision after uncertainty',async()=>{
 await assertReminderTemplateVersions();
 let lost=true;
 const h=await harness({mailResponse:message=>lost&&message.subject==='An invoice is available'?new Response('unavailable',{status:503}):Response.json({id:'synthetic-satchel-3'})});try{
  const s=await reminderSetup(h),job=await s.schedule(),count=h.mails.length;await h.scheduled(reminderAt);await h.restart();await h.scheduled(reminderAt);assert.equal(h.mails.length,count+1);
  const state=await s.state(),j=state.jobs.find(j=>j.id===job.id);assert.equal(j.outcome,'uncertain');
  const result=await h.json('/audit?matterId='+s.m.id+'&action=correspondence.send_result',undefined,h.owner);assert.match(JSON.stringify(result),new RegExp(s.invoice.id));
  const next=await h.json('/mail-attempts/'+j.attempt_id+'/resend-review',{reason:'Provider inspected; counsel expressly accepts duplicate risk for one more attempt'},s.lawyer);lost=false;
  await h.json('/mail-attempts/'+next.attemptId+'/send',{},s.lawyer);await h.json('/mail-attempts/'+next.attemptId+'/send',{},s.lawyer);assert.equal(h.mails.length,count+2,'One new audited decision sends once');
  const after=await h.json('/audit?matterId='+s.m.id+'&action=correspondence.send_result',undefined,h.owner);assert.equal(after.records.length,2);for(const record of after.records)assert.match(JSON.stringify(record),new RegExp(s.invoice.id));
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();for(const table of ['s_client_reminder_templates','s_client_reminder_authorizations','s_client_reminder_jobs'])assert.ok(archive.includes(table));
 }finally{await h.close();}
});

import {stripeEdge,paymentFixture} from './stripe-fixture.mjs';
test('Hosted invoice collection allocates exact card and ACH funds once, preserves pending and returned states, and fences trust protection',async()=>{
 const edge=stripeEdge(),h=await harness(edge);
 try{
  const s=await paymentFixture(h),base=id=>'/portal/invoices/'+id;
  await h.json(base(s.card.id)+'/payment',undefined,'',401);
  let invoice=await h.json(base(s.card.id)+'/payment',undefined,s.client);assert.equal(invoice.status,'unpaid');assert.equal(invoice.dueCents,37500);
  const decision={requestKey:'synthetic-satchel-card-decision'},checkout=await h.json(base(s.card.id)+'/checkout',decision,s.client);assert.equal(new URL(checkout.url).hostname,'checkout.stripe.com');
  await h.json(base(s.card.id)+'/checkout',decision,s.client);assert.equal(edge.calls,1,'Repeating the same decision reuses hosted checkout');
  await h.json(base(s.card.id)+'/checkout',{requestKey:'synthetic-satchel-duplicate'},s.client,409);
  const card=[...edge.sessions.values()][0],event=edge.event(card,'checkout.session.completed','paid');
  assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)})).status,200);
  await h.restart();assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)})).status,200);
  invoice=await h.json(base(s.card.id)+'/payment',undefined,s.client);assert.equal(invoice.status,'paid');assert.equal(invoice.paidCents,37500);assert.equal(invoice.dueCents,0);
  const reconciled=(await h.json('/matters/'+s.m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===s.card.id).trustPayment;assert.equal(reconciled.paid_cents,37500);assert.equal(reconciled.application_count,1);
  await h.json('/invoices/'+s.card.id+'/void',{revision:s.card.revision,reason:'Live processor funds cannot vanish'},h.owner,409);
  await h.json(base(s.ach.id)+'/checkout',{requestKey:'synthetic-satchel-ach-decision'},s.client);const ach=[...edge.sessions.values()][1],pending=edge.event(ach,'checkout.session.completed','pending');
  assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(pending)})).status,200);
  invoice=await h.json(base(s.ach.id)+'/payment',undefined,s.client);assert.equal(invoice.status,'pending');assert.equal(invoice.paidCents,0);assert.equal(invoice.reservedCents,37500);
  const economics=(await h.json('/reports/economics',undefined,h.owner)).matters.find(m=>m.matterId===s.m.id);
  assert.equal(economics.pendingCents,37500);assert.equal(economics.paidCents,37500);assert.equal(economics.trustCashCents,0);assert.equal(economics.earnedCents,75000);assert.equal(economics.collectionRate,0.5);
  const pendingInvoice=economics.source.invoices.find(i=>i.billId===s.ach.id);assert.equal(pendingInvoice.pendingCents,37500);assert.equal(pendingInvoice.paidCents,0);assert.equal(pendingInvoice.dueCents,37500);
  assert.equal((await h.json('/matters/'+s.m.id+'/revenue',undefined,h.owner)).totals.collectedCents,37500,'Pending ACH is excluded');
  const paid=edge.event(ach,'checkout.session.async_payment_succeeded','paid');await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(paid)});
  assert.equal((await h.json('/matters/'+s.m.id+'/revenue',undefined,h.owner)).totals.collectedCents,75000);
  const returned=edge.event(ach,'charge.failed','returned',{status:'failed',amount_refunded:0});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(returned)});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(returned)});
  invoice=await h.json(base(s.ach.id)+'/payment',undefined,s.client);assert.equal(invoice.status,'returned');assert.equal(invoice.paidCents,0);assert.equal(invoice.dueCents,37500);
  await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(paid)});assert.equal((await h.json(base(s.ach.id)+'/payment',undefined,s.client)).status,'returned');
  await h.json('/stripe/settings',{kind:'trust',confirmed:true,processorAccountId:'synthetic-satchel-protected-processor'},h.owner,409);
  const source=await h.json('/matters/'+s.m.id+'/documents',{name:'Protected trust bank arrangement.txt',mime:'text/plain',contentBase64:Buffer.from('Synthetic bank confirmation: principal protected; separate operating funds bear fees and chargebacks.').toString('base64'),visibility:'matter'},h.owner);
  await h.json('/team',{email:'owner@example.test',name:'Principal trust officer',role:'trust_officer'},h.owner);
  const account=await h.json('/trust/accounts',{name:'Protected IOLTA',kind:'trust',bankReference:'synthetic-satchel-bank'},h.owner),ledger=await h.json('/trust/ledgers',{accountId:account.id,matterId:s.m.id},h.owner);
  await h.json('/stripe/settings',{kind:'trust',confirmed:true,processorAccountId:'synthetic-satchel-protected-processor',externalBankId:'synthetic-satchel-trust-bank',bankAccountId:account.id,documentId:source.id,protectionReference:'Synthetic reviewed protection agreement',principalProtected:true,feesFromOperating:true,chargebacksFromOperating:true},h.owner);
  const trust=await h.json(base(s.ach.id)+'/checkout',{purpose:'trust',ledgerId:ledger.id,cents:10000,requestKey:'synthetic-satchel-trust'},h.owner),trustSession=[...edge.sessions.values()][2],trustEvent=edge.event(trustSession,'checkout.session.completed','paid');assert.ok(trust.id);
  await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(trustEvent)});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(trustEvent)});
  const state=await h.json('/trust',undefined,h.owner);assert.equal(state.ledgers.find(l=>l.id===ledger.id).balance_cents,10000);assert.equal((await h.json(base(s.ach.id)+'/payment',undefined,s.client)).paidCents,0,'Trust deposits never become operating revenue');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness(edge);
  try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);const before=await restored.json('/portal/invoices/'+s.card.id+'/payment',undefined,restored.owner);assert.equal(before.paidCents,37500);await restored.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)});assert.equal((await restored.json('/portal/invoices/'+s.card.id+'/payment',undefined,restored.owner)).paidCents,37500);assert.equal((await restored.json('/trust',undefined,restored.owner)).ledgers.find(l=>l.id===ledger.id).balance_cents,10000);}finally{await restored.close();}
  const otherMode=await harness({...edge,bindings:{...edge.bindings,STRIPE_MODE:'live'}});
  try{await otherMode.json('/restore',{archive,confirm:'RESTORE'},otherMode.owner);await otherMode.json('/portal/invoices/'+s.card.id+'/payment',undefined,otherMode.owner,409);await otherMode.json('/stripe/settings',{kind:'operating',confirmed:true},otherMode.owner,409);}finally{await otherMode.close();}
  const revenuePath='/matters/'+s.m.id+'/revenue';let revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.totals.collectedCents,37500,'Returned ACH and trust deposits cannot inflate fee revenue');assert.equal(revenue.sources.length,2);assert.equal(revenue.sources.find(x=>x.netCents===0).reversals.length,1);
  const rule=await h.json(revenuePath+'/rules',{requestKey:'synthetic-satchel-provider-rule',previousId:null,sourceDocumentId:source.id,sourceVersion:source.currentVersion,sourceDigest:source.versions.find(v=>v.version===source.currentVersion).sha256,basis:'proportional_fee_receipts',reference:'Reviewed compensation agreement for collected fees',splits:[{kind:'origination',email:'owner@example.test',shareBps:2500,commissionBps:1000},{kind:'responsible',email:'owner@example.test',shareBps:5000,commissionBps:2000}],approve:true},h.owner);
  const earlierRefund=edge.event(card,'charge.refunded','paid',{amount_refunded:1234});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(earlierRefund)});
  revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.totals.collectedCents,36266);const collectedCard=revenue.sources.find(x=>x.netCents>0);await h.json(revenuePath+'/allocations',{requestKey:'synthetic-satchel-provider-allocation',sourceKey:collectedCard.key,ruleId:rule.id,reviewDigest:collectedCard.preview.reviewDigest,approve:true},h.owner);
  const refund=edge.event(card,'charge.refunded','paid',{amount_refunded:2234});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(refund)});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(refund)});
  revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.totals.collectedCents,35266);assert.equal(revenue.allocations[0].original.feeCents,36266);assert.equal(revenue.allocations[0].current.feeCents,35266);assert.equal(revenue.allocations[0].reversals.length,1);assert.equal(revenue.allocations[0].reversals[0].calculation.feeCents,-1000);
  await h.json('/matters/'+s.m.id+'/portal',undefined,h.owner);const grants=(await h.json('/matters/'+s.m.id+'/portal',undefined,h.owner)).grants;await h.json('/portal-grants/'+grants[0].id+'/revoke',{reason:'Payment authority withdrawn'},h.owner);await h.json(base(s.ach.id)+'/payment',undefined,s.client,404);
 }finally{await h.close();}
});

import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PDFDocument,PDFDict,PDFName} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function pdfText(bytes){const loading=getDocument({data:Uint8Array.from(bytes),useSystemFonts:true}),doc=await loading.promise;let text='';for(let i=1;i<=doc.numPages;i++)text+=(await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';await loading.destroy();return text;}
test('Reviewed invoice delivery retains branded payer artifacts, verifies provider outcomes and requires a new authorized attempt after failure',async()=>{
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),wire=[];let uncertain=false;
 const h=await harness({bindings:{MAIL_PROVIDER:'sendgrid',SENDGRID_EVENT_PUBLIC_KEY:publicKey},sendgridResponse:async request=>{const body=await request.json();wire.push(body);return uncertain?new Response('',{status:503}):new Response(null,{status:202,headers:{'x-message-id':'synthetic-satchel-'+wire.length}});}});let restored;
 try{
  const m=await open(h,'Synthetic Satchel confidential matter','Synthetic Satchel Client','Synthetic Satchel Adverse'),base='/matters/'+m.id,payers=await setupInvoicePayers(h,m);
  await h.json('/providers/mail/review',{termsUrl:'https://www.twilio.com/en-us/legal/tos',confirmed:true},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await approvedInvoice(h,m,await draft(h,m,'Confidential privileged services')),issued=(await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner)).issues[0];
  const original=Buffer.from(await(await h.request('/api/satchel/bills/'+bill.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());
  await h.json('/team',{email:'billing@example.test',name:'Synthetic Satchel Billing',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');await h.json(base+'/access',{email:'billing@example.test'},h.owner);
  await h.json('/invoice-templates',invoiceTemplate(null,{confirmed:false}),billing,400);
  const template=await h.json('/invoice-templates',invoiceTemplate(),h.owner),notification=await h.json('/invoice-notification-templates',{confirmed:true,reason:'Counsel reviews the plain-text sign-in-only notification'},h.owner);
  const make=async(recipient,payerName,selected=template)=>h.json('/bills/'+bill.id+'/deliveries',{recipient,payerName,templateId:selected.id},billing);
  const clientDelivery=await make('client@example.test','Synthetic Satchel Client'),insurerDelivery=await make('insurer@example.test','Synthetic Satchel Insurer');
  const client=await h.login('client@example.test'),insurer=await h.login('insurer@example.test');
  const download=async(delivery,cookie=h.owner)=>{const r=await h.request('/api/satchel/invoice-deliveries/'+delivery.id+'/pdf',undefined,cookie);assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');return Buffer.from(await r.arrayBuffer());};
  const portalInvoices=await h.json('/portal/matters/'+m.id+'/invoices',undefined,client);assert.equal(portalInvoices.invoices.find(i=>i.id===bill.id).pdfUrl,'/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf');
  const delivered=await download(clientDelivery,client),text=await pdfText(delivered),pdf=await PDFDocument.load(delivered);
  for(const value of ['Synthetic Satchel Counsel','100 Example Street','Remit to Synthetic Satchel Counsel','Due within 30 days','Matter trust balance USD 0.00',issued.number,'Confidential privileged services'])assert.ok(text.includes(value),value);
  assert.equal(hash(delivered),clientDelivery.pdfDigest);assert.ok(pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'),PDFDict).keys().length>0);
  assert.equal(clientDelivery.paymentUrl,h.origin+'/app/invoices/'+bill.id+'/pay');assert.ok(text.replace(/\s/g,'').includes(clientDelivery.paymentUrl));
  if(process.env.SATCHEL_INVOICE_PDF)await writeFile(process.env.SATCHEL_INVOICE_PDF,delivered);
  if(process.env.SATCHEL_QR_SCAN==='1'){const directory=await mkdtemp(join(tmpdir(),'satchel-qr-'));try{const filename=join(directory,'invoice.pdf');await writeFile(filename,delivered);await promisify(execFile)('swift',['tests/satchel/invoice-qr-scan.swift',filename,clientDelivery.paymentUrl],{timeout:60000});}finally{await rm(directory,{recursive:true,force:true});}}
  assert.equal((await h.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf',undefined,insurer)).status,404);assert.equal((await h.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf')).status,401);
  const next=await h.json('/invoice-templates',invoiceTemplate(template.id,{remittance:'New instructions apply only to later deliveries'}),h.owner);await make('insurer@example.test','Synthetic Satchel Insurer',next);assert.deepEqual(await download(clientDelivery,client),delivered);
  assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+bill.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),original);
  const statement=await h.json(base+'/payer-statements',{recipient:'insurer@example.test'},billing),statements=await h.json('/portal/matters/'+m.id+'/payer-statements',undefined,insurer);assert.equal(statements.statements.length,1);assert.equal(statements.statements[0].snapshot.invoices.length,1);assert.equal(statements.statements[0].snapshot.totalDueCents,bill.snapshot.totalCents);assert.equal((await h.request('/api/satchel/payer-statements/'+statement.id+'/pdf',undefined,client)).status,404);
  const statementPdf=await h.request('/api/satchel/payer-statements/'+statement.id+'/pdf',undefined,insurer);assert.equal(statementPdf.status,200);assert.match(await pdfText(Buffer.from(await statementPdf.arrayBuffer())),/Payer statement/);
  const consolidation=await consolidatedFixture(h,m,template);
  const consolidated=await h.json(base+'/payer-statements',{recipient:'client@example.test',matterIds:[m.id,consolidation.other.id]},h.owner);
  const consolidatedState=(await h.json('/portal/matters/'+m.id+'/payer-statements',undefined,client)).statements.find(s=>s.id===consolidated.id);
  assert.deepEqual(new Set(consolidatedState.snapshot.invoices.map(i=>i.matterId)),new Set([m.id,consolidation.other.id]));
  assert.equal(consolidatedState.snapshot.totalDueCents,bill.snapshot.totalCents+consolidation.first.snapshot.totalCents);
  assert.ok(!JSON.stringify(consolidatedState).includes(consolidation.excluded.id));
  const allocation=consolidatedState.snapshot.invoices.find(i=>i.matterId===consolidation.other.id);assert.equal(allocation.responsibleAttorney,'owner@example.test');assert.match(allocation.lines[0].feeAgreement,/^[a-f0-9-]{36}$/);assert.equal(allocation.lines[0].recipient,'client@example.test');
  const consolidatedBytes=Buffer.from(await(await h.request(consolidated.pdfUrl,undefined,client)).arrayBuffer()),consolidatedText=await pdfText(consolidatedBytes);
  assert.ok(consolidatedText.includes(consolidation.other.title));assert.ok(!consolidatedText.includes(consolidation.excluded.title));assert.match(consolidatedText,/Responsible attorney: owner@example.test/);assert.match(consolidatedText,/Fee agreement/);
  assert.equal((await h.request(consolidated.pdfUrl,undefined,insurer)).status,404);
  const view=(await h.json('/audit?action=invoice.payer_statement_downloaded',undefined,h.owner)).records.find(r=>r.objectId===consolidated.id);assert.ok(JSON.stringify(view).includes('client@example.test'));
  const selectedGrant=(await h.json('/matters/'+consolidation.other.id+'/portal',undefined,h.owner)).grants.find(g=>!g.revokedAt);
  await h.json('/portal-grants/'+selectedGrant.id+'/revoke',{reason:'Withdraw one selected matter'},h.owner);
  assert.equal((await h.request(consolidated.pdfUrl,undefined,client)).status,404);assert.ok(!(await h.json('/portal/matters/'+m.id+'/payer-statements',undefined,client)).statements.some(s=>s.id===consolidated.id));
  assert.deepEqual(Buffer.from(await(await h.request(consolidated.pdfUrl,undefined,h.owner)).arrayBuffer()),consolidatedBytes);
  await h.json(base+'/payer-statements',{recipient:'client@example.test',matterIds:[m.id,consolidation.other.id]},h.owner,409);
  const excludedGrant=(await h.json('/matters/'+consolidation.excluded.id+'/portal',undefined,h.owner)).grants.find(g=>!g.revokedAt);await h.json('/portal-grants/'+excludedGrant.id+'/revoke',{reason:'Finish synthetic consolidation proof'},h.owner);
  const limitedRole=await h.json('/roles',{name:'Invoice operator without banking',permissions:{rates:'all',bank:'none',reports:'own',contacts:'read',documents:'read',billing:'write',settings:'none'},reason:'Separate invoice operations from trust information'},h.owner);
  await h.json('/team',{email:'limited@example.test',name:'Synthetic Satchel Limited Counsel',role:'lawyer',customRoleId:limitedRole.id},h.owner);await h.json('/team/invite',{email:'limited@example.test'},h.owner);const limited=await h.login('limited@example.test');await h.json(base+'/access',{email:'limited@example.test'},h.owner);
  assert.equal((await h.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf',undefined,limited)).status,403);assert.equal((await h.request('/api/satchel/payer-statements/'+statement.id+'/pdf',undefined,limited)).status,403);await h.json('/bills/'+bill.id+'/deliveries',{recipient:'client@example.test',payerName:'Synthetic Satchel Client',templateId:template.id},limited,403);
  const authorize=(delivery,priorAttemptId,actor=billing)=>h.json('/invoice-deliveries/'+delivery.id+'/authorize',{notificationTemplateId:notification.id,confirmed:true,priorAttemptId,reason:'Reviewed current consent, recipient and provider history; authorize exactly one sign-in notification'},actor);
  const unused=await authorize(clientDelivery);await payers.consent(payers.client.id,'denied');await h.json('/invoice-notification-attempts/'+unused.attemptId+'/send',{},billing,409);await payers.consent(payers.client.id);
  const fresh=await authorize(clientDelivery,unused.attemptId);let refreshed=(await h.json(base+'/invoice-deliveries',undefined,billing)).deliveries.find(d=>d.id===clientDelivery.id);assert.equal(refreshed.attempts.find(a=>a.id===unused.attemptId).status,'withdrawn');await h.json('/invoice-notification-attempts/'+fresh.attemptId+'/send',{},billing);
  // A source merge supplies no email consent for the retained duplicate identity.
  const g=await h.json('/contacts',undefined,h.owner),duplicate=await h.json('/contacts',{revision:g.revision,kind:'organization',name:'Synthetic Satchel Insurer duplicate',emails:['duplicate@example.test']},h.owner),preview=await h.json('/contacts/merge-preview',{survivorId:payers.insurer.id,duplicateId:duplicate.id,reason:'Counsel reviewed retained insurer identities'},h.owner);await h.json('/contacts/merge',{previewId:preview.id},h.owner);
  await h.json('/invoice-deliveries/'+insurerDelivery.id+'/authorize',{notificationTemplateId:notification.id,confirmed:true,reason:'Missing merged consent refused'},billing,409);await payers.consent(duplicate.id);
  const attempt=await authorize(insurerDelivery),before=wire.length;await h.json('/invoice-notification-attempts/'+attempt.attemptId+'/send',{},billing);await h.json('/invoice-notification-attempts/'+attempt.attemptId+'/send',{},billing);assert.equal(wire.length,before+1);
  const mail=wire.at(-1);assert.equal(mail.content.length,1);assert.equal(mail.content[0].type,'text/plain');assert.equal(mail.attachments,undefined);assert.equal(mail.custom_args.rer_delivery_id,attempt.attemptId);for(const privateValue of [m.title,m.client,issued.number,'375.00','Confidential privileged services'])assert.ok(!JSON.stringify(mail).includes(privateValue));
  const event={sg_event_id:'synthetic-satchel-event-1',sg_message_id:'synthetic-satchel-'+wire.length+'.filter',rer_delivery_id:attempt.attemptId,email:'insurer@example.test',event:'bounce',timestamp:Math.floor(Date.now()/1000)};
  const webhook=async(data=event,valid=true)=>{const payload=JSON.stringify([data]),timestamp=String(Math.floor(Date.now()/1000)),signature=sign('sha256',Buffer.from(timestamp+payload),keys.privateKey).toString('base64');return h.raw('/api/satchel/providers/sendgrid/events',{method:'POST',headers:{'content-type':'application/json','X-Twilio-Email-Event-Webhook-Timestamp':timestamp,'X-Twilio-Email-Event-Webhook-Signature':valid?signature:Buffer.alloc(70).toString('base64')},body:payload});};
  assert.equal((await webhook(event,false)).status,401);assert.equal((await webhook()).status,200);assert.equal((await webhook()).status,200);
  let state=await h.json(base+'/invoice-deliveries',undefined,billing),record=state.deliveries.find(d=>d.id===insurerDelivery.id);assert.equal(record.attempts[0].outcome,'bounced');assert.equal(record.attempts[0].events.length,1);
  const resend=await authorize(insurerDelivery,attempt.attemptId);uncertain=true;await h.json('/invoice-notification-attempts/'+resend.attemptId+'/send',{},billing);const count=wire.length;await h.restart();await h.json('/invoice-notification-attempts/'+resend.attemptId+'/send',{},billing);assert.equal(wire.length,count);state=await h.json(base+'/invoice-deliveries',undefined,billing);assert.equal(state.deliveries.find(d=>d.id===insurerDelivery.id).attempts.at(-1).outcome,'uncertain');uncertain=false;
  const final=await authorize(insurerDelivery,resend.attemptId);await h.json('/invoice-notification-attempts/'+final.attemptId+'/send',{},billing);assert.equal(wire.length,count+1);
  const current=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===bill.id);await h.json('/invoices/'+bill.id+'/void',{revision:current.revision,reason:'Counsel reviewed replacing the delivered invoice'},h.owner);
  let replacement=await h.json(base+'/bills',{title:'Reviewed replacement invoice',date:'2026-10-02',entryIds:bill.snapshot.lines.map(l=>l.sourceId)},h.owner);replacement=await approvedInvoice(h,m,replacement);const replacementIssue=(await h.json('/invoices/issue',{bills:[{id:replacement.id,revision:replacement.revision}]},h.owner)).issues[0];
  await h.json('/invoices/'+bill.id+'/replacement',{replacementBillId:replacement.id,reason:'Counsel names this exact issued replacement'},h.owner);const oldPage=await h.json('/portal/invoices/'+bill.id+'/payment',undefined,client);assert.equal(oldPage.status,'void');assert.equal(oldPage.replacements[0].number,replacementIssue.number);await h.json('/portal/invoices/'+bill.id+'/checkout',{method:'card'},client,409);
  assert.equal((await h.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf',undefined,client)).status,409);assert.deepEqual(await download(clientDelivery),delivered);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(Buffer.from(await(await restored.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf',undefined,restored.owner)).arrayBuffer()),delivered);
  const grant=(await h.json(base+'/portal',undefined,h.owner)).grants.find(g=>g.email==='insurer@example.test'&&!g.revokedAt);await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Payer authority withdrawn'},h.owner);assert.equal((await h.request('/api/satchel/invoice-deliveries/'+insurerDelivery.id+'/pdf',undefined,insurer)).status,404);await h.json('/invoice-deliveries/'+insurerDelivery.id+'/authorize',{notificationTemplateId:notification.id,confirmed:true,priorAttemptId:final.attemptId,reason:'Withdrawn payer cannot receive another notification'},billing,409);
  await h.json(base+'/wall',{reason:'Counsel restricts invoice matter',custodianEmail:'owner@example.test',members:['owner@example.test'],revision:null},h.owner);assert.equal((await h.request('/api/satchel/invoice-deliveries/'+clientDelivery.id+'/pdf',undefined,client)).status,404);assert.equal((await h.json('/portal',undefined,client)).grants.length,0);
 }finally{await restored?.close();await h.close();}
});

test('Billing staff approve immutable invoice display revisions and issued PDFs retain selected detail without changing approved amounts',async()=>{
 const h=await harness();
 try{
  await h.json('/team',{email:'billing@example.test',name:'Synthetic Satchel Billing',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');
  await h.json('/invoice-numbering',scheme(),h.owner);
  const m=await open(h),base='/matters/'+m.id;
  const entries=[];
  for(const [description,rateCents] of [['Synthetic charged work',25000],['Synthetic courtesy work',0]])entries.push(await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description,minutes:60,rateCents,utbmsTask:'L110',utbmsActivity:'A101'},h.owner));
  await h.json(base+'/rates',{scope:'matter',effectiveFrom:'2026-01-01',rateCents:10000,incrementMinutes:1,discountBps:1000,billable:true,note:'Synthetic reviewed discount'},h.owner);
  entries.push(await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic discounted work',minutes:60},h.owner));
  const bill=await approvedInvoice(h,m,await h.json(base+'/bills',{title:'Synthetic detailed invoice',date:'2026-10-01',entryIds:entries.map(e=>e.id)},h.owner));
  await h.json('/invoice-templates',invoiceTemplate(null,{layout:'invalid'}),billing,400);
  await h.json('/invoice-templates',invoiceTemplate(null,{showHours:'yes'}),billing,400);
  const detailed=await h.json('/invoice-templates',invoiceTemplate(null,{showHours:true,showRates:true,showTimekeepers:true,showUtbms:true,showNoChargeLines:true,showDiscounts:true}),billing);
  await h.json(base+'/invoice-template',{templateId:detailed.id,reason:'Use the reviewed detailed version'},h.owner);
  await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  const download=async id=>Buffer.from(await(await h.request('/api/satchel/bills/'+id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());
  const bytes=await download(bill.id),detail=await pdfText(bytes);
  for(const value of ['Synthetic charged work','Synthetic courtesy work','Hours 1.00','Hourly rate USD 250.00','Timekeeper owner@example.test','UTBMS L110 A101','USD 0.00','Total USD 340.00','Agreement discount 10%','Invoice template version 1','Remit to Synthetic Satchel Counsel','Matter trust balance USD 0.00'])assert.ok(detail.includes(value),value);
  const summary=await h.json('/invoice-templates',invoiceTemplate(detailed.id,{layout:'summary',showHours:false,showRates:false,showNoChargeLines:false}),billing);
  const other=await open(h,'Synthetic summary matter','Synthetic second client','Synthetic second adverse');
  await h.json('/matters/'+other.id+'/invoice-template',{templateId:summary.id,reason:'Use summary layout'},h.owner);
  const hidden=await h.json('/matters/'+other.id+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic hidden narrative',minutes:90,rateCents:25000},h.owner);
  const next=await approvedInvoice(h,other,await h.json('/matters/'+other.id+'/bills',{title:'Synthetic summary invoice',date:'2026-10-01',entryIds:[hidden.id]},h.owner));
  await h.json('/invoices/issue',{bills:[{id:next.id,revision:next.revision}]},h.owner);
  const concise=await pdfText(await download(next.id));assert.match(concise,/Services and expenses USD 375.00/);assert.match(concise,/Invoice template version 2/);
  for(const hidden of ['Synthetic hidden narrative','Hours ','Hourly rate ','Timekeeper ','UTBMS '])assert.ok(!concise.includes(hidden),hidden);
  const minimal=await h.json('/invoice-templates',invoiceTemplate(summary.id,{showTimeEntryDetail:false,showNoChargeLines:false,includeTrustBalance:false}),billing);
  await h.json(base+'/invoice-template',{previousId:(await h.json(base+'/invoice-template',undefined,h.owner)).assignment.id,templateId:minimal.id,reason:'Later invoices omit narratives and courtesy lines'},h.owner);
  const more=[];for(const [description,rateCents] of [['Synthetic private narrative',10000],['Synthetic hidden courtesy',0]])more.push(await h.json(base+'/entries',{kind:'time',date:'2026-10-02',description,minutes:60,...(rateCents?{}:{rateCents}),utbmsTask:'L110',utbmsActivity:'A101'},h.owner));
  const later=await approvedInvoice(h,m,await h.json(base+'/bills',{title:'Synthetic later invoice',date:'2026-10-02',entryIds:more.map(e=>e.id)},h.owner));
  await h.json('/invoices/issue',{bills:[{id:later.id,revision:later.revision}]},h.owner);
  const reduced=await pdfText(await download(later.id));for(const hidden of ['Synthetic private narrative','Synthetic hidden courtesy','Matter trust balance','Hours ','Hourly rate ','Timekeeper ','UTBMS ','Agreement discount '])assert.ok(!reduced.includes(hidden),hidden);assert.match(reduced,/Total USD 90.00/);
  const loading=getDocument({data:Uint8Array.from(await download(later.id)),useSystemFonts:true}),parsed=await loading.promise,strings=(await(await parsed.getPage(1)).getTextContent()).items.map(x=>x.str);assert.ok(!strings.includes('USD 0.00'),'No zero-dollar source row is rendered');await loading.destroy();
  await h.restart();assert.deepEqual(await download(bill.id),bytes);assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===bill.id).issue.template_id,detailed.id);
  assert.equal((await h.json('/audit?action=invoice.template_approved',undefined,h.owner)).records.length,3);
 }finally{await h.close();}
});

test('Invoice defaults resolve firm then client then matter, retirement affects future issues only, and prior balances stay separate from the invoice total',async()=>{
 const h=await harness();let restored;
 try{
  await h.json('/invoice-numbering',scheme(),h.owner);
  const a=await open(h,'Synthetic default matter','Synthetic shared client','Synthetic adverse one'),b=await open(h,'Synthetic override matter','Synthetic shared client','Synthetic adverse two'),c=await open(h,'Synthetic firm matter','Synthetic other client','Synthetic adverse three');
  await h.json('/team',{email:'billing@example.test',name:'Synthetic Satchel Billing',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');for(const m of [a,b,c])await h.json('/matters/'+m.id+'/access',{email:'billing@example.test'},h.owner);
  const first=await h.json('/invoice-templates',invoiceTemplate(null,{name:'Detailed native template'}),billing),second=await h.json('/invoice-templates',invoiceTemplate(first.id,{name:'Summary native template',layout:'summary',includeTrustBalance:false,includePriorBalance:true}),billing);
  await h.json('/invoice-template-defaults',{scope:'firm',templateId:first.id,reason:'Reviewed firm default'},billing);
  assert.equal((await h.json('/matters/'+a.id+'/invoice-template',undefined,billing)).assignment.template_id,first.id);
  await h.json('/invoice-template-defaults',{scope:'client',matterId:a.id,templateId:second.id,reason:'Reviewed client override'},billing);
  assert.equal((await h.json('/matters/'+b.id+'/invoice-template',undefined,billing)).assignment.template_id,second.id);assert.equal((await h.json('/matters/'+c.id+'/invoice-template',undefined,billing)).assignment.template_id,first.id);
  await h.json('/matters/'+b.id+'/invoice-template',{templateId:first.id,reason:'Reviewed matter override'},billing);
  assert.equal((await h.json('/matters/'+b.id+'/invoice-template',undefined,billing)).assignment.scope,'matter');
  await h.json('/invoice-template-defaults',{scope:'firm',templateId:second.id,reason:'Stale change'},billing,409);
  const issued=async(m,title)=>{const draftBill=await draft(h,m,title),approved=await approvedInvoice(h,m,draftBill);await h.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},billing);return approved;};
  await h.json('/invoice-notification-templates',{confirmed:true,reason:'Billing staff cannot approve counsel wording'},billing,403);
  const original=await issued(b,'Synthetic original branded issue'),download=async id=>Buffer.from(await(await h.request('/api/satchel/bills/'+id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),bytes=await download(original.id);
  await h.json('/invoice-templates/'+first.id+'/retire',{reason:'Prospectively replace this revision'},billing);
  const later=await approvedInvoice(h,b,await draft(h,b,'Synthetic future issue'));
  await h.json('/invoices/issue',{bills:[{id:later.id,revision:later.revision}]},billing,409);
  const assignment=(await h.json('/matters/'+b.id+'/invoice-template',undefined,billing)).assignment;
  await h.json('/matters/'+b.id+'/invoice-template',{previousId:assignment.id,templateId:second.id,reason:'Use the active summary revision'},billing);
  await h.json('/invoices/issue',{bills:[{id:later.id,revision:later.revision}]},billing);
  const summary=await pdfText(await download(later.id));assert.match(summary,/Prior issued matter balance USD 375.00/);assert.match(summary,/Total USD 375.00/);assert.match(summary,/separate from this invoice/);assert.ok(!summary.includes('Matter trust balance'));
  assert.deepEqual(await download(original.id),bytes);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(Buffer.from(await(await restored.request('/api/satchel/bills/'+original.id+'/invoice.pdf',undefined,restored.owner)).arrayBuffer()),bytes);
  assert.ok((await restored.json('/invoice-templates',undefined,restored.owner)).templates.find(t=>t.id===first.id).retired_at);
  assert.equal((await restored.json('/matters/'+a.id+'/invoice-template',undefined,restored.owner)).assignment.template_id,second.id);
 }finally{await restored?.close();await h.close();}
});

import {proveMatterUpdates} from './matter-update-flow.mjs';
test('Reviewed matter updates preserve exact approval, scheduled delivery, responsible replies and live promises',proveMatterUpdates);

async function proveProviderReview(){
 const h=await harness();
 try{
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  await h.json('/providers',undefined,assistant,403);await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},assistant,403);
  const terms='https://resend.com/legal/terms-of-service';
  await h.json('/providers/mail/review',{termsUrl:terms},h.owner,400);
  await h.json('/providers/mail/review',{termsUrl:'http://resend.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/mail/review',{termsUrl:'https://user:pass@resend.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/unknown/review',{termsUrl:terms,confirmed:true},h.owner,404);
  await h.json('/providers/mail/review',{termsUrl:terms,confirmed:true},h.owner);
  const after=await h.json('/providers',undefined,h.owner),review=after.providers.find(p=>p.id==='mail').review;
  assert.equal(review.termsUrl,terms);assert.equal(review.reviewedBy,'owner@example.test');assert.equal(after.providers.find(p=>p.id==='xero').review,null);
  const trail=await h.json('/audit?action=provider.reviewed',undefined,h.owner);assert.equal(trail.records.length,1);assert.equal(trail.records[0].actor.email,'owner@example.test');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes(terms));
 }finally{await h.close();}
}
