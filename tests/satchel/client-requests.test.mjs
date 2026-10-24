import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
const upload=(name,text)=>({name,contentBase64:Buffer.from(text).toString('base64')});
test('CLIENT-003 two records are requested, an incomplete upload is explained, a corrected one is accepted and filed, and the second request stays due',async()=>{
 const h=await harness();
 try{
  const m=await open(h),base='/matters/'+m.id,people={};
  const roster=[['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['client@example.test','client'],['payer@example.test','client'],['stranger@example.test','client']];
  for(const [email,role] of roster){await h.json('/team',{email,name:email.split('@')[0],role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const [lawyer,assistant,client,payer,stranger]=roster.map(([e])=>people[e]);
  for(const e of ['lawyer@example.test','assistant@example.test'])await h.json(base+'/access',{email:e},h.owner);
  await h.json(base+'/portal',{email:'client@example.test',reason:'Client'},h.owner);await h.json(base+'/portal',{email:'payer@example.test',kind:'payer',reason:'Payer'},h.owner);
  // Request two specific records with instructions, owner, due date and acceptance criteria; only staff can ask.
  const ask=(body,cookie=lawyer,expected=200)=>h.json(base+'/requests',{instructions:'Upload a clear copy.',criteria:'All pages visible; dated within 90 days.',clientVisible:true,...body},cookie,expected);
  await ask({title:'Bank statement',dueDate:'2026-11-10'},client,403);await ask({title:'Bank statement',owner:'client@example.test',dueDate:'2026-11-10'},lawyer,400);await ask({title:'Bank statement',criteria:'',dueDate:'2026-11-10'},lawyer,400);
  await ask({title:'Bank statement',owner:'assistant@example.test',dueDate:'2026-11-10'});const two=await ask({title:'Signed lease',dueDate:'2026-11-12'},assistant);
  const bank=two.requests.find(r=>r.title==='Bank statement'),lease=two.requests.find(r=>r.title==='Signed lease');assert.equal(bank.owner,'assistant@example.test');assert.equal(bank.criteria,'All pages visible; dated within 90 days.');assert.equal(lease.owner,'assistant@example.test');
  // The client sees both with their instructions; the payer and a stranger see nothing; a hidden request stays hidden.
  const hidden=await ask({title:'Internal: conflict memo',clientVisible:false});assert.equal(hidden.requests.length,3);
  const seen=await h.json('/portal/matters/'+m.id+'/requests',undefined,client);assert.deepEqual(seen.requests.map(r=>r.title),['Bank statement','Signed lease']);assert.equal(seen.requests[0].status,'open');
  await h.json('/portal/matters/'+m.id+'/requests',undefined,payer,404);await h.json('/portal/matters/'+m.id+'/requests',undefined,stranger,404);await h.json('/portal/requests/'+bank.id+'/uploads',upload('x.txt','x'),payer,404);
  await h.json('/portal/requests/'+hidden.requests[2].id+'/uploads',upload('x.txt','x'),client,404);
  for(const [name,content] of [['unscanned.pdf','%PDF-synthetic'],['spoof.txt','<script>unsafe</script>'],['bad.txt',Buffer.from([255,254])]])await h.json('/portal/requests/'+bank.id+'/uploads',upload(name,content),client,400);
  assert.equal((await h.json('/portal/matters/'+m.id+'/requests',undefined,client)).requests[0].uploads.length,0,'Unsafe or unparseable files are refused before storage');
  // An incomplete upload arrives; counsel explains the deficiency (an assistant cannot accept); the client reads it.
  const first=await h.json('/portal/requests/'+bank.id+'/uploads',upload('statement-page1.txt','Page 1 of 3: balance $1,000'),client);const one=first.requests[0].uploads[0];assert.equal(one.review,'submitted');
  await h.json('/requests/'+bank.id+'/review',{uploadId:one.id,decision:'accept'},assistant,403);await h.json('/requests/'+bank.id+'/review',{uploadId:one.id,decision:'deficient'},lawyer,400);
  const explained=await h.json('/requests/'+bank.id+'/review',{uploadId:one.id,decision:'deficient',note:'Pages 2 and 3 are missing; please send the full statement.'},lawyer);assert.equal(explained.requests.find(r=>r.id===bank.id).status,'open');
  const clarified=await h.json('/requests/'+bank.id+'/notes',{body:'The bank portal lets you download one PDF for the whole month.'},assistant);assert.equal(clarified.requests.find(r=>r.id===bank.id).notes.length,2);
  const note=(await h.json('/portal/matters/'+m.id+'/requests',undefined,client)).requests[0];assert.equal(note.uploads[0].review,'deficient');assert.match(note.uploads[0].reviewNote,/Pages 2 and 3/);assert.deepEqual(note.notes.map(n=>n.side),['staff','staff']);
  await h.json('/requests/'+bank.id+'/notes',{body:'x'},client,403);await h.json('/requests/'+hidden.requests[2].id+'/notes',{body:'to the client'},lawyer,409);
  const asked=await h.json('/portal/requests/'+bank.id+'/notes',{body:'Is a screenshot acceptable?'},client);assert.equal(asked.requests[0].notes.at(-1).side,'client');
  // The corrected upload is accepted: it becomes the matter's retained original and closes only this request.
  const second=await h.json('/portal/requests/'+bank.id+'/uploads',upload('statement-full.txt','Pages 1-3: balance $1,000; deposits; withdrawals'),client),fixed=second.requests[0].uploads.at(-1);
  await h.json('/requests/'+bank.id+'/review',{uploadId:one.id,decision:'accept'},lawyer,404,);
  const accepted=await h.json('/requests/'+bank.id+'/review',{uploadId:fixed.id,decision:'accept',note:'Complete and dated October 2026.'},lawyer),done=accepted.requests.find(r=>r.id===bank.id),still=accepted.requests.find(r=>r.id===lease.id);
  assert.equal(done.status,'received');assert.ok(done.documentId);assert.equal(still.status,'open',"The second request remains due");assert.equal(still.dueDate,'2026-11-12');
  const docs=await h.json(base+'/documents',undefined,h.owner);assert.equal(docs.find(d=>d.id===done.documentId).title,'statement-full.txt');
  const original=await h.request('/api/satchel/documents/'+done.documentId+'/file',undefined,h.owner);assert.equal(await original.text(),'Pages 1-3: balance $1,000; deposits; withdrawals');
  await h.json('/portal/requests/'+bank.id+'/uploads',upload('late.txt','late'),client,409);await h.json('/requests/'+bank.id+'/review',{uploadId:fixed.id,decision:'accept'},lawyer,409);
  assert.equal((await h.json('/portal/matters/'+m.id+'/requests',undefined,client)).requests.find(r=>r.id===bank.id).status,'received');
  // The still-open request keeps counting against closure and can be chased and answered later.
  const next=await h.json('/portal/requests/'+lease.id+'/uploads',upload('lease.txt','Lease signed by both parties'),client);assert.equal(next.requests.find(r=>r.id===lease.id).status,'open','An upload alone never closes a request');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('statement-page1.txt')&&archive.includes('Pages 2 and 3 are missing'));
 }finally{await h.close();}
});

test('Request reminders need exact reader opt-in and counsel approval, honor quiet hours, and stop on acceptance, withdrawal or counsel stop',async()=>{
 const h=await harness();try{
  const m=await open(h),base='/matters/'+m.id;for(const [email,role] of [['client@example.test','client'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}const client=await h.login('client@example.test'),assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'assistant@example.test'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Reader'},h.owner);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);const setting=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind==='engagement_chase');await h.json('/followups/settings',{...setting,enabled:true,steps:[{afterMinutes:15},{afterMinutes:1440}],quietStart:'09:00',quietEnd:'11:00',timezone:'UTC',maxContacts:3},h.owner);
  const requests=[];for(const title of ['Accept','Withdraw','Stop']){const list=await h.json(base+'/requests',{title,instructions:'Upload text',criteria:'Complete',clientVisible:true},h.owner);requests.push(list.requests.find(q=>q.title===title));}
  const approve=(q,cookie=h.owner,status=200)=>h.json('/requests/'+q.id+'/reminders',{email:'client@example.test',approved:true},cookie,status);
  await approve(requests[0],h.owner,409);for(const q of requests){await h.json('/portal/requests/'+q.id+'/reminder-consent',{consent:true},client);await approve(q,assistant,403);await approve(q);}
  const consent=(await h.json('/portal/matters/'+m.id+'/requests',undefined,client)).requests[0].reminders.consents[0];assert.equal(consent.version,'request-email-v1');assert.match(consent.wording,/until it is accepted, stopped or escalated/);assert.ok(Date.parse(consent.grantedAt));
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);tomorrow.setUTCHours(10,0,0,0);const before=h.mails.length;await h.scheduled(tomorrow.getTime());assert.equal(h.mails.length,before,'Quiet hours defer every request');tomorrow.setUTCHours(12);await h.scheduled(tomorrow.getTime());const sent=h.mails.slice(before);assert.equal(sent.length,3);assert.ok(sent.every(m=>m.to[0]==='client@example.test'));assert.doesNotMatch(JSON.stringify(sent),/Barton|statement|Accept|Withdraw|matterId/,'Mail carries no request or matter content');
  const uploaded=await h.json('/portal/requests/'+requests[0].id+'/uploads',upload('synthetic-satchel-1.txt','Complete'),client);await h.json('/requests/'+requests[0].id+'/review',{uploadId:uploaded.requests.find(q=>q.id===requests[0].id).uploads[0].id,decision:'accept'},h.owner);
  await h.json('/portal/requests/'+requests[1].id+'/reminder-consent',{consent:false},client);await h.json('/requests/'+requests[2].id+'/reminders',{stop:true},h.owner);await h.restart();await h.scheduled(tomorrow.getTime()+86400000);assert.equal(h.mails.length,before+3,'Accepted, opted-out and stopped requests never send again');const state=await h.json(base+'/requests',undefined,h.owner);assert.deepEqual(state.requests.map(q=>q.reminders.sequences[0].status),['stopped','stopped','stopped']);
 }finally{await h.close();}
});
test('Request reminders escalate at the contact limit, revoked access and uncertain delivery without automatic resend',async()=>{
 let fail=false;const h=await harness({mailResponse:message=>fail&&message.subject==='A reminder from your firm'?Response.json({name:'synthetic-satchel-1'},{status:503}):Response.json({id:'synthetic-satchel-2'})});try{
  const m=await open(h),base='/matters/'+m.id;await h.json('/team',{email:'client@example.test',name:'Reader',role:'client'},h.owner);await h.json('/team/invite',{email:'client@example.test'},h.owner);const client=await h.login('client@example.test'),grant=(await h.json(base+'/portal',{email:'client@example.test',reason:'Reader'},h.owner)).grants[0];await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);let setting=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind==='engagement_chase');await h.json('/followups/settings',{...setting,enabled:true,steps:[{afterMinutes:15},{afterMinutes:1440}],quietStart:'09:00',quietEnd:'11:00',timezone:'UTC',maxContacts:1},h.owner);
  const ask=async title=>{const q=(await h.json(base+'/requests',{title,instructions:'Upload text',criteria:'Complete',clientVisible:true},h.owner)).requests.find(q=>q.title===title);await h.json('/portal/requests/'+q.id+'/reminder-consent',{consent:true},client);await h.json('/requests/'+q.id+'/reminders',{email:'client@example.test',approved:true},h.owner);return q;};
  const limited=await ask('Limit');const t=new Date();t.setUTCDate(t.getUTCDate()+1);t.setUTCHours(12,0,0,0);const before=h.mails.length;await h.scheduled(t.getTime());assert.equal(h.mails.length,before+1);await h.scheduled(t.getTime()+86400000);assert.equal(h.mails.length,before+1);let state=await h.json(base+'/requests',undefined,h.owner);assert.equal(state.requests.find(q=>q.id===limited.id).reminders.sequences[0].status,'escalated');
  setting=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind==='engagement_chase');await h.json('/followups/settings',{...setting,maxContacts:20},h.owner);const uncertain=await ask('Uncertain');fail=true;await h.scheduled(t.getTime());const failedCount=h.mails.length;await h.restart();await h.scheduled(t.getTime()+86400000);assert.equal(h.mails.length,failedCount,'An uncertain send is never retried');state=await h.json(base+'/requests',undefined,h.owner);assert.equal(state.requests.find(q=>q.id===uncertain.id).reminders.sequences[0].status,'escalated');
  fail=false;const revoked=await ask('Revoked');await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Authority ended'},h.owner);await h.scheduled(t.getTime());assert.equal(h.mails.length,failedCount,'A revoked reader gets nothing');state=await h.json(base+'/requests',undefined,h.owner);assert.equal(state.requests.find(q=>q.id===revoked.id).reminders.sequences[0].status,'escalated');
 }finally{await h.close();}
});
