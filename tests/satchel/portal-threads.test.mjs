import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
const file=(name,text)=>({name,contentBase64:Buffer.from(text).toString('base64')});
test('CLIENT-002 a confidential attachment, a client reply, the retained thread, read states, the unread queue and notifications that carry no content',async()=>{
 let mailOutcome='accepted';
 const h=await harness({mailResponse:message=>mailOutcome==='uncertain'&&/secure message/.test(message.subject)?new Response('',{status:503}):Response.json({id:'synthetic-satchel-mail'})});
 try{
  const m=await open(h),base='/matters/'+m.id,people={};
  const roster=[['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['other@example.test','assistant'],['client@example.test','client'],['cocl@example.test','client'],['payer@example.test','client'],['stranger@example.test','client'],['deleg@example.test','client'],['unassigned@example.test','assistant']];
  for(const [email,role] of roster){await h.json('/team',{email,name:email.split('@')[0],role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const [lawyer,assistant,other,client,coclient,payer,stranger,delegate]=roster.map(([e])=>people[e]);
  for(const e of ['lawyer@example.test','assistant@example.test','other@example.test'])await h.json(base+'/access',{email:e},h.owner);
  await h.json(base+'/portal',{email:'client@example.test',reason:'Client'},h.owner);await h.json(base+'/portal',{email:'cocl@example.test',kind:'co_client',reason:'Co-client'},h.owner);await h.json(base+'/portal',{email:'payer@example.test',kind:'payer',reason:'Payer'},h.owner);
  const unassigned=people['unassigned@example.test'];
  await h.json(base+'/threads',{subject:'Refused assignment',body:'Private',assignedTo:'unassigned@example.test'},lawyer,400);
  const secret='Settle at 40k; the privileged analysis is attached.';
  // Without the firm's recorded mail review no notification is sent, and that is recorded.
  const quiet=await h.json(base+'/threads',{subject:'Settlement posture',body:'Quiet start',assignedTo:'assistant@example.test'},lawyer);assert.deepEqual(quiet.threads[0].messages[0].notifications.map(n=>n.status),['not_sent','not_sent']);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  await h.json(base+'/threads',{subject:'x',body:secret},client,403);await h.json('/matters/missing/threads',{subject:'x',body:'x'},lawyer,404);
  for(const attachments of [Array.from({length:4},(_,i)=>file('synthetic-satchel-'+i+'.txt','synthetic-satchel-'+i)),[file('synthetic-satchel-large.txt','x'.repeat(1024*1024+1))]])await h.json(base+'/threads',{subject:'Refused files',body:'Private',attachments},lawyer,400);
  const before=h.mails.length,started=await h.json(base+'/threads',{subject:'Confidential: settlement analysis',body:secret,attachments:[file('Analysis.txt','Privileged settlement analysis.')],assignedTo:'assistant@example.test'},lawyer);
  const thread=started.threads.find(t=>t.subject==='Confidential: settlement analysis'),first=thread.messages[0];assert.equal(first.attachments[0].name,'Analysis.txt');assert.deepEqual(first.notifications.map(n=>[n.to,n.status]).sort(),[['client@example.test','accepted'],['cocl@example.test','accepted']]);
  const sent=h.mails.slice(before);assert.deepEqual(sent.map(x=>x.to[0]).sort(),['client@example.test','cocl@example.test']);
  for(const mail of sent){const all=JSON.stringify(mail);assert.ok(!all.includes('settle')&&!all.includes('Settle')&&!all.includes('Analysis')&&!all.includes('Confidential'),'The notification names no content');assert.match(mail.text,/contains no message content/);}
  await h.json(base+'/portal',{email:'deleg@example.test',kind:'delegate',delegateOf:'client@example.test',reason:'Acts for the client'},h.owner);
  // The client portal lists the thread with an unread count; opening it records read state; the payer and a stranger see nothing.
  assert.equal((await h.json('/portal/matters/'+m.id+'/threads',undefined,client)).threads.find(t=>t.id===thread.id).unread,1);await h.json('/portal/matters/'+m.id+'/threads',undefined,payer,404);await h.json('/portal/matters/'+m.id+'/threads',undefined,stranger,404);
  await h.json('/portal/threads/'+thread.id+'/open',{},payer,404);await h.json('/portal/threads/'+thread.id+'/open',{},stranger,404);
  const opened=await h.json('/portal/threads/'+thread.id+'/open',{},client),mine=opened.threads.find(t=>t.id===thread.id);assert.equal(mine.unread,0);assert.equal(mine.messages[0].readByYou,true);
  assert.equal((await h.json('/portal/matters/'+m.id+'/threads',undefined,coclient)).threads.find(t=>t.id===thread.id).unread,1,'Read state is per person');
  assert.equal((await h.json('/portal/matters/'+m.id+'/threads',undefined,delegate)).threads.find(t=>t.id===thread.id).unread,1,'A live delegate reaches the client’s direct message URLs');
  // Attachments: readers and the assigned staff open the exact bytes; the payer, a stranger and unrelated staff cannot.
  const attachment=first.attachments[0].id,get=(path,cookie)=>h.request('/api/satchel'+path,undefined,cookie);
  for(const [path,cookie] of [['/portal/attachments/'+attachment,client],['/portal/attachments/'+attachment,coclient],['/portal/attachments/'+attachment,delegate],['/attachments/'+attachment,assistant],['/attachments/'+attachment,lawyer]]){const r=await get(path,cookie);assert.equal(r.status,200);assert.equal(await r.text(),'Privileged settlement analysis.');assert.equal(r.headers.get('cache-control'),'no-store');}
  for(const [path,cookie] of [['/portal/attachments/'+attachment,payer],['/portal/attachments/'+attachment,stranger],['/attachments/'+attachment,other],['/portal/attachments/'+attachment,lawyer],['/attachments/'+attachment,client]])assert.ok([403,404].includes((await get(path,cookie)).status),path);
  // The client replies with an attachment; the assigned staff see it in the unread queue, not the unassigned assistant.
  const reply=await h.json('/portal/threads/'+thread.id+'/messages',{body:'I agree. Here is the signed page.',attachments:[file('Signed.txt','Signed page')]},client);assert.equal(reply.threads.find(t=>t.id===thread.id).messages.length,2);
  assert.deepEqual((await h.json('/threads/unread',undefined,assistant)).queue.map(q=>[q.threadId,q.unread]),[[thread.id,1]]);assert.deepEqual((await h.json('/threads/unread',undefined,other)).queue,[]);assert.deepEqual((await h.json('/threads/unread',undefined,lawyer)).queue,[]);
  assert.equal((await h.json(base+'/threads',undefined,other)).threads.length,0);await h.json('/threads/'+thread.id+'/read',{},other,404);await h.json('/threads/'+thread.id+'/messages',{body:'x'},other,404);
  assert.ok(h.mails.at(-1).to.includes('assistant@example.test')&&!JSON.stringify(h.mails.at(-1)).includes('signed page'),'The staff notification names no content either');
  // Staff reading, reassignment and the retained record.
  const read=await h.json('/threads/'+thread.id+'/read',{},assistant),after=read.threads.find(t=>t.id===thread.id);assert.equal(after.unread,0);assert.deepEqual(after.messages[1].readBy.map(r=>r.by),['assistant@example.test']);assert.deepEqual((await h.json('/threads/unread',undefined,assistant)).queue,[]);
  await h.json('/threads/'+thread.id+'/assign',{assignedTo:'other@example.test'},assistant,403);await h.json('/threads/'+thread.id+'/assign',{assignedTo:'unassigned@example.test'},lawyer,400);await h.json('/threads/'+thread.id+'/assign',{assignedTo:'client@example.test'},lawyer,400);
  const reassigned=await h.json('/threads/'+thread.id+'/assign',{assignedTo:'other@example.test'},lawyer);assert.equal(reassigned.threads.find(t=>t.id===thread.id).assignedTo,'other@example.test');assert.equal((await h.json(base+'/threads',undefined,other)).threads.length,1);assert.deepEqual((await h.json(base+'/threads',undefined,assistant)).threads.map(t=>t.subject),['Settlement posture'],'An assistant sees only the threads assigned to them');
  const answer=await h.json('/threads/'+thread.id+'/messages',{body:'Thank you.'},other);assert.deepEqual(answer.threads.find(t=>t.id===thread.id).messages.map(x=>x.side),['staff','client','staff']);
  // Losing matter access closes ownership and suppresses even the minimal staff notification.
  await h.json(base+'/access',{email:'other@example.test',remove:true},h.owner);
  const mailsBefore=h.mails.length;await h.json('/portal/threads/'+thread.id+'/messages',{body:'Please assign another reviewer.'},client);assert.equal(h.mails.length,mailsBefore);
  const retained=(await h.json(base+'/threads',undefined,lawyer)).threads.find(t=>t.id===thread.id);assert.deepEqual(retained.messages.at(-1).notifications.map(n=>[n.to,n.status]),[['other@example.test','not_sent']]);assert.deepEqual((await h.json('/threads/unread',undefined,other)).queue,[]);
  await h.json('/threads/'+thread.id+'/assign',{assignedTo:'lawyer@example.test'},lawyer);assert.equal((await h.json('/threads/unread',undefined,lawyer)).queue[0].threadId,thread.id);
  await h.restart();assert.equal((await h.json(base+'/threads',undefined,lawyer)).threads.find(t=>t.id===thread.id).messages.length,4);
  // An uncertain provider response retains the message, does not assert delivery and never resends on reads or restart.
  mailOutcome='uncertain';
  const uncertain=(await h.json(base+'/threads',{subject:'Retained despite uncertain notification',body:'Confidential retained text',assignedTo:'lawyer@example.test'},lawyer)).threads.find(t=>t.subject==='Retained despite uncertain notification');
  assert.ok(uncertain.messages[0].notifications.every(n=>n.status==='uncertain'),'Provider uncertainty is distinct from acceptance and delivery');
  assert.equal(uncertain.messages[0].notifications.length,3);
  const attempts=h.mails.length;
  await h.json('/portal/threads/'+uncertain.id+'/open',{},client);
  const reads=(await h.json('/audit?action=portal.message_read',undefined,h.owner)).records.length;
  await h.json('/portal/threads/'+uncertain.id+'/open',{},client);
  assert.equal((await h.json('/audit?action=portal.message_read',undefined,h.owner)).records.length,reads,'Opening an already read message adds no duplicate read receipt');
  await h.restart();
  const kept=(await h.json(base+'/threads',undefined,lawyer)).threads.find(t=>t.id===uncertain.id);
  assert.equal(kept.messages[0].body,'Confidential retained text');
  assert.ok(kept.messages[0].notifications.every(n=>n.status==='uncertain'));
  assert.equal(h.mails.length,attempts,'Reading and restarting do not retry an uncertain notification');
  mailOutcome='accepted';
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('Settle at 40k'));
  // A withdrawn grant removes the thread from that person's portal at once.
  const grants=(await h.json(base+'/portal',undefined,h.owner)).grants;await h.json('/portal-grants/'+grants.find(g=>g.email==='cocl@example.test').id+'/revoke',{reason:'Left the matter'},h.owner);
  await h.json('/portal/threads/'+thread.id+'/open',{},coclient,404);
  await h.json('/portal/threads/'+thread.id+'/messages',{body:'Refused after withdrawal'},coclient,404);
  await h.json('/portal/matters/'+m.id+'/threads',undefined,coclient,404);assert.equal((await get('/portal/attachments/'+attachment,coclient)).status,404);assert.equal((await get('/portal/attachments/'+attachment,client)).status,200);
  await h.json('/portal-grants/'+grants.find(g=>g.email==='client@example.test').id+'/revoke',{reason:'Engagement ended'},h.owner);await h.json('/portal/matters/'+m.id+'/threads',undefined,delegate,404);assert.equal((await get('/portal/attachments/'+attachment,delegate)).status,404,'A delegate loses the thread with the client’s grant');
 }finally{await h.close();}
});
