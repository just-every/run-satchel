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
