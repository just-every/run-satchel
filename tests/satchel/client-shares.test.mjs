import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
test('CLIENT-004 a lawyer shares a preparation task, a hearing and a confirmed deadline; the client acknowledges and completes only the task and cannot alter any date',async()=>{
 const h=await harness();
 try{
  const m=await open(h),base='/matters/'+m.id,people={};
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['client@example.test','client'],['other@example.test','client'],['cocl@example.test','client'],['payer@example.test','client'],['deleg@example.test','client']]){await h.json('/team',{email,name:role+' '+email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const lawyer=people['lawyer@example.test'],assistant=people['assistant@example.test'],client=people['client@example.test'],other=people['other@example.test'];
  for(const email of ['lawyer@example.test','assistant@example.test'])await h.json(base+'/access',{email},h.owner);
  await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);
  for(const [email,kind] of [['cocl@example.test','co_client'],['payer@example.test','payer'],['deleg@example.test','delegate']])await h.json(base+'/portal',{email,kind,reason:'Explicit portal authority',...(kind==='delegate'?{delegateOf:'client@example.test'}:{})},h.owner);
  const mailCount=h.mails.length;
  const prep=await h.json(base+'/tasks',{title:'Gather your lease and rent receipts',priority:'normal',dueDate:'2026-11-05'},h.owner);
  const firmTask=await h.json(base+'/tasks',{title:'Internal: review exhibits',priority:'normal'},h.owner);
  const hearing=await h.json(base+'/appointments',{title:'Hearing: motion to dismiss',date:'2026-11-18',time:'09:30',timezone:'America/New_York',durationMinutes:60,location:'Courtroom 4B',attendees:[]},h.owner);
  const proposed=await h.json(base+'/deadlines',{title:'Serve response',date:'2026-11-12',timezone:'America/New_York',source:'Order, paragraph 3'},h.owner);const unconfirmed=await h.json(base+'/deadlines',{title:'Draft deadline',date:'2026-11-13',timezone:'America/New_York',source:'Order, paragraph 4'},h.owner);
  const deadline=await h.json('/deadlines/'+proposed.id+'/confirm',{revision:proposed.revision,note:'Checked against the order'},h.owner);
  const legalTask=await h.json(base+'/tasks',{title:'File the response',priority:'high',deadlineId:deadline.id},h.owner);
  // Only counsel shares; legal tasks, open-ended records and unconfirmed deadlines are refused.
  const share=(body,cookie=lawyer,expected=200)=>h.json(base+'/client-shares',body,cookie,expected);
  await share({kind:'task',recordId:prep.id,instructions:'Bring copies'},assistant,403);await share({kind:'task',recordId:prep.id,instructions:'Bring copies'},client,403);
  await share({kind:'task',recordId:legalTask.id,instructions:'x'},lawyer,400);await share({kind:'deadline',recordId:unconfirmed.id,instructions:'x'},lawyer,400);await share({kind:'task',recordId:prep.id,instructions:''},lawyer,400);await share({kind:'task',recordId:'missing',instructions:'x'},lawyer,404);
  await share({kind:'task',recordId:prep.id,instructions:'Upload clear copies by the due date, then mark this done.'});
  await share({kind:'event',recordId:hearing.id,instructions:'Arrive 30 minutes early with photo ID.'});
  const shared=await share({kind:'deadline',recordId:deadline.id,instructions:'The firm will file; no action from you.'});
  await share({kind:'task',recordId:prep.id,instructions:'again'},lawyer,409);
  assert.equal(shared.shares.length,3);
  // The client sees exactly what was shared, with its instructions, and none of the firm's own records.
  const portal=await h.json('/portal/matters/'+m.id+'/shares',undefined,client);assert.deepEqual(portal.items.map(i=>i.kind).sort(),['deadline','event','task']);
  const task=portal.items.find(i=>i.kind==='task'),event=portal.items.find(i=>i.kind==='event'),legal=portal.items.find(i=>i.kind==='deadline');
  assert.equal(task.title,'Gather your lease and rent receipts');assert.equal(task.dueDate,'2026-11-05');assert.match(task.instructions,/mark this done/);assert.equal(task.canComplete,true);
  assert.equal(event.occurrences[0].date,'2026-11-18');assert.equal(event.occurrences[0].time,'09:30');assert.equal(event.timezone,'America/New_York');assert.equal(event.location,'Courtroom 4B');assert.equal(event.canComplete,false);assert.equal(legal.date,'2026-11-12');assert.equal(legal.canComplete,false);
  assert.ok(!JSON.stringify(portal).includes('Internal: review exhibits')&&!JSON.stringify(portal).includes('File the response')&&!JSON.stringify(portal).includes('Draft deadline')&&!JSON.stringify(portal).includes('attendee'));
  const coclient=people['cocl@example.test'],delegate=people['deleg@example.test'],payer=people['payer@example.test'];
  for(const reader of [coclient,delegate])assert.deepEqual((await h.json('/portal/matters/'+m.id+'/shares',undefined,reader)).items.map(i=>i.id),portal.items.map(i=>i.id));
  await h.json('/portal/matters/'+m.id+'/shares',undefined,payer,404);await h.json('/portal/shares/'+task.id+'/complete',{},payer,404);await h.json('/portal/shares/'+event.id+'/acknowledge',{},payer,404);
  // Acknowledge each; complete only the client task, once; the staff record stays the firm's.
  for(const item of portal.items)await h.json('/portal/shares/'+item.id+'/acknowledge',{note:item.kind==='event'?'I will be there':''},client);
  await h.json('/portal/shares/'+event.id+'/acknowledge',{},client,409);
  await h.json('/portal/shares/'+event.id+'/complete',{},client,400);await h.json('/portal/shares/'+legal.id+'/complete',{},client,400);
  const done=await h.json('/portal/shares/'+task.id+'/complete',{note:'Uploaded to the folder'},client);assert.ok(done.items.find(i=>i.kind==='task').completedAt);assert.equal(done.items.find(i=>i.kind==='task').canComplete,false);
  await h.json('/portal/shares/'+task.id+'/complete',{},client,409);
  assert.equal((await h.json('/portal/matters/'+m.id+'/shares',undefined,coclient)).items.find(i=>i.id===task.id).completedAt,null,'Completion belongs to the acknowledging identity');
  assert.equal((await h.json(base+'/tasks',undefined,h.owner)).find(t=>t.id===prep.id).status,'open','A client completion never closes the firm’s task');
  // The client cannot alter a hearing or deadline through any door; others and strangers see nothing.
  for(const [path,body] of [[base+'/appointments',{title:'Moved',date:'2026-11-20',time:'10:00',timezone:'America/New_York',durationMinutes:30,attendees:[]}],['/appointments/'+hearing.id+'/occurrences/0/move',{date:'2026-11-20',time:'10:00',reason:'client request'}],['/appointments/'+hearing.id+'/occurrences/0/cancel',{reason:'client request'}],['/deadlines/'+deadline.id+'/confirm',{revision:deadline.revision,note:'x'}],['/deadlines/'+deadline.id+'/complete',{revision:deadline.revision,evidence:'client says done'}],['/tasks/'+legalTask.id+'/complete',{revision:legalTask.revision,evidence:'client'}],['/client-shares/x/revoke',{}]])await h.json(path,body,client,403);
  await h.json('/portal/matters/'+m.id+'/shares',undefined,other,404);await h.json('/portal/shares/'+task.id+'/acknowledge',{},other,404);await h.json('/portal/matters/'+m.id+'/shares',undefined,lawyer,403);await h.json('/portal/matters/'+m.id+'/shares',undefined,'',401);
  // Staff see each client's acknowledgment and completion, then withdraw a share; it disappears from the portal at once.
  const staff=await h.json(base+'/client-shares',undefined,lawyer),mineShare=staff.shares.find(s=>s.kind==='event');assert.deepEqual(mineShare.acks.map(a=>[a.kind,a.by,a.note]),[['acknowledged','client@example.test','I will be there']]);
  assert.deepEqual(staff.shares.find(s=>s.kind==='task').acks.map(a=>a.kind),['acknowledged','completed']);
  await h.json('/client-shares/'+mineShare.id+'/revoke',{},assistant,403);await h.json('/client-shares/'+mineShare.id+'/revoke',{},lawyer);
  assert.deepEqual((await h.json('/portal/matters/'+m.id+'/shares',undefined,client)).items.map(i=>i.kind).sort(),['deadline','task']);await h.json('/portal/shares/'+mineShare.id+'/acknowledge',{},client,404);
  await h.json('/portal/shares/'+mineShare.id+'/complete',{},client,404);
  await share({kind:'event',recordId:hearing.id,instructions:'Use the original court date. Bring photo ID.'});
  const reshared=(await h.json('/portal/matters/'+m.id+'/shares',undefined,client)).items.find(i=>i.kind==='event');
  assert.notEqual(reshared.id,mineShare.id,'A renewed share has its own acknowledgment history');
  assert.equal(reshared.acknowledgedAt,null,'A withdrawn instruction acknowledgment does not carry to new instructions');
  await h.json('/portal/shares/'+reshared.id+'/acknowledge',{date:'2026-12-01',time:'14:00',status:'completed'},client);
  const calendar=await h.json(base+'/calendar',undefined,lawyer);
  assert.equal(calendar.appointments.find(a=>a.id===hearing.id).occurrences[0].date,'2026-11-18','Acknowledgment payload cannot move the hearing');
  assert.equal(calendar.deadlines.find(d=>d.id===deadline.id).status,'confirmed','Acknowledgment cannot complete a legal date');
  await h.json('/client-shares/'+reshared.id+'/revoke',{},lawyer);
  await h.restart();
  const history=(await h.json(base+'/client-shares',undefined,lawyer)).shares;
  assert.equal(history.find(s=>s.id===mineShare.id).acks[0].note,'I will be there','Withdrawn instructions retain their original acknowledgment');
  assert.equal(history.find(s=>s.id===reshared.id).acks.length,1,'Renewed instructions retain a separate acknowledgment after restart');
  assert.equal(h.mails.length,mailCount,'Sharing, acknowledgment, completion and withdrawal send no automatic notification');
  // Withdrawing the portal grant closes every door at once.
  await h.json('/portal-grants/'+(await h.json(base+'/portal',undefined,h.owner)).grants[0].id+'/revoke',{reason:'Engagement ended'},h.owner);
  await h.json('/portal/matters/'+m.id+'/shares',undefined,client,404);await h.json('/portal/shares/'+legal.id+'/acknowledge',{},client,404);
  await h.json('/portal/matters/'+m.id+'/shares',undefined,delegate,404);await h.json('/portal/shares/'+task.id+'/complete',{},delegate,404);
  assert.equal((await h.json('/portal/matters/'+m.id+'/shares',undefined,coclient)).items.length,2,'A co-client retains their own authority');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('Uploaded to the folder'));
 }finally{await h.close();}
});
