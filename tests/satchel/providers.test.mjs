import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
test('provider charges: every provider bills the firm directly, review of its terms is principal-only and audited, and a native bill carries no Satchel charge',async()=>{
 const h=await harness();
 try{
  const first=await h.json('/providers',undefined,h.owner);
  assert.match(first.statement,/free, MIT-licensed software/);
  for(const id of ['lawpay','stripe','docusign','inkwell','quickbooks-online','xero','cloudflare','mail','sms','court-rules'])assert.ok(first.providers.some(p=>p.id===id),id);
  for(const p of first.providers){assert.equal(p.satchelCharge,'none');assert.match(p.billing,/directly by the provider under its own terms/);assert.equal(p.review,null);}
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  await h.json('/providers',undefined,assistant,403);await h.json('/providers/stripe/review',{termsUrl:'https://stripe.com/legal',confirmed:true},assistant,403);
  const terms='https://stripe.com/legal/ssa';
  await h.json('/providers/stripe/review',{termsUrl:terms},h.owner,400);
  await h.json('/providers/stripe/review',{termsUrl:'http://stripe.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/stripe/review',{termsUrl:'https://user:pass@stripe.com/legal',confirmed:true},h.owner,400);
  await h.json('/providers/unknown/review',{termsUrl:terms,confirmed:true},h.owner,404);
  await h.json('/providers/stripe/review',{termsUrl:terms,confirmed:true},h.owner);
  const after=await h.json('/providers',undefined,h.owner);
  assert.equal(after.providers.find(p=>p.id==='stripe').review.termsUrl,terms);assert.equal(after.providers.find(p=>p.id==='stripe').review.reviewedBy,'owner@example.test');assert.equal(after.providers.find(p=>p.id==='xero').review,null);
  const trail=await h.json('/audit?action=provider.reviewed',undefined,h.owner);assert.equal(trail.records.length,1);assert.equal(trail.records[0].actor.email,'owner@example.test');assert.match(JSON.stringify(trail.records[0]),/Satchel charge none/);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes(terms));
  const m=await open(h),entry=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',description:'Review lease',minutes:60,rateCents:25000},h.owner);
  const bill=await h.json('/matters/'+m.id+'/bills',{title:'October',date:'2026-10-15',entryIds:[entry.id]},h.owner);
  assert.equal(bill.snapshot.totalCents,25000,'The bill is exactly the recorded work: no Satchel fee, plan or markup');
  for(const path of ['/plan','/license','/subscription','/upgrade','/pricing','/billing/plan'])assert.equal((await h.request('/api/satchel'+path,undefined,h.owner)).status,404,path);
 }finally{await h.close();}
});

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
test('Correspondence requires affirmative consent on every merged identity before sending',async()=>{
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
});
test('Correspondence rechecks portal authority, counsel permission and matter access at send',async()=>{
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
test('Withdrawing consent blocks the next reviewed correspondence send and requires fresh review after renewed consent',async()=>{
 const h=await harness();try{
  const {base,lawyer,contact,consent}=await mailSetup(h);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);await consent(contact.id,'allowed');
  const first=await h.json(base+'/correspondence',letter,lawyer),count=h.mails.length;await h.json('/mail-attempts/'+first.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+1);
  const next=await h.json(base+'/correspondence',letter,lawyer);await consent(contact.id,'denied');await h.json('/mail-attempts/'+next.attemptId+'/send',{},lawyer,409);await h.json(base+'/correspondence',letter,lawyer,409);assert.equal(h.mails.length,count+1,'Withdrawal stops the next send');
  await consent(contact.id,'allowed');await h.json('/mail-attempts/'+next.attemptId+'/send',{},lawyer,409);const fresh=await h.json(base+'/correspondence',letter,lawyer);await h.json('/mail-attempts/'+fresh.attemptId+'/send',{},lawyer);assert.equal(h.mails.length,count+2,'Renewed consent needs a new exact review');
 }finally{await h.close();}
});

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
test('Client reminder templates are approved once as exact immutable versions retained by scheduled jobs',async()=>{
 const h=await harness();try{
  const s=await reminderSetup(h);await h.json('/client-reminder-templates',{kind:'invoice',reason:'Unconfirmed'},s.lawyer,400);await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Not counsel'},s.assistant,403);
  const job=await s.schedule();const newer=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'A later separate approval',body:'Private matter and amount'},s.lawyer);
  assert.notEqual(newer.id,s.invoice.id);await h.restart();const before=await s.state();assert.equal(before.jobs.find(j=>j.id===job.id).template_id,s.invoice.id);
  assert.equal(before.templates.find(t=>t.id===s.invoice.id).body,s.invoice.body);assert.equal(newer.body,s.invoice.body,'Unapproved supplied content cannot change confidential template bytes');
  await h.scheduled(reminderAt);assert.equal((await s.state()).jobs.find(j=>j.id===job.id).outcome,'accepted');assert.equal(h.mails.at(-1).text,s.invoice.body+' '+h.origin+'/app');
 }finally{await h.close();}
});
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
