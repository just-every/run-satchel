import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {searchPayment} from './search-fixture.mjs';
const titles=r=>r.entries.map(e=>e.title);
test('MATTER-005 a matter timeline merges notes, calls, commitments, filed email, documents, tasks, deadlines, bills and payments; private notes reach only their author, clients see only what was shared',async()=>{
 const h=await harness();
 try{
  const m=await open(h),base='/matters/'+m.id,people={};
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['client@example.test','client'],['outsider@example.test','assistant']]){await h.json('/team',{email,name:role+' '+email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const lawyer=people['lawyer@example.test'],assistant=people['assistant@example.test'],client=people['client@example.test'];
  for(const email of ['lawyer@example.test','assistant@example.test'])await h.json(base+'/access',{email},h.owner);
  await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);
  // Entries: a private strategy note, a shared progress note for the client, a call mentioning the assistant, an internal commitment.
  const strategy=await h.json(base+'/notes',{kind:'note',title:'Strategy: settle below $40k',body:'Counsel only: reserve the adverse-possession argument.',visibility:'private'},lawyer);
  const progress=await h.json(base+'/notes',{kind:'note',title:'Progress: notice served',body:'The landlord was served on Monday.',visibility:'team',clientVisible:true},lawyer);
  const call=await h.json(base+'/notes',{kind:'call',title:'Call with landlord counsel',body:'They will respond by Friday.',visibility:'team',mentions:['assistant@example.test'],occurredAt:'2026-10-20T15:00:00.000Z'},lawyer);
  const promise=await h.json(base+'/notes',{kind:'commitment',title:'Promised a draft by Thursday',body:'Send the client the draft reply.',visibility:'team'},lawyer);
  assert.equal(progress.clientVisible,true);
  // Scope: mentions grant nothing, private notes mention no one, assistants never share with clients.
  await h.json(base+'/notes',{kind:'note',title:'Bad',body:'x',visibility:'team',mentions:['outsider@example.test']},lawyer,400);
  await h.json(base+'/notes',{kind:'note',title:'Bad',body:'x',visibility:'private',mentions:['assistant@example.test']},lawyer,400);
  await h.json(base+'/notes',{kind:'note',title:'Bad',body:'x',visibility:'team',clientVisible:true},assistant,400);
  await h.json(base+'/notes',{kind:'commitment',title:'Bad',body:'x',visibility:'private'},lawyer,400);
  await h.json(base+'/notes',{kind:'note',title:'Bad',body:'x',visibility:'team'},people['outsider@example.test'],404);
  await h.json(base+'/notes',{kind:'note',title:'Correction',body:'Served Tuesday, not Monday.',visibility:'team',corrects:strategy.id},assistant,404);
  const fix=await h.json(base+'/notes',{kind:'note',title:'Correction: served Tuesday',body:'Served Tuesday, not Monday.',visibility:'team',clientVisible:true,corrects:progress.id},lawyer);assert.equal(fix.corrects,progress.id);
  // Other records: a filed email, a task, an appointment, a bill.
  const email=await h.json(base+'/documents',{name:'Landlord reply.eml',mime:'message/rfc822',visibility:'matter',contentBase64:Buffer.from('From: landlord@example.test\r\nSubject: Reply\r\n\r\nWe received the notice.').toString('base64')},h.owner);
  const task=await h.json(base+'/tasks',{title:'Draft the reply',priority:'normal'},h.owner);
  await h.json(base+'/appointments',{title:'Consult with counsel',date:'2026-11-10',time:'10:00',timezone:'America/New_York',durationMinutes:30,attendees:[]},h.owner);
  const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Review lease',minutes:60,rateCents:25000},h.owner);await h.json(base+'/bills',{title:'Lease advice prebill',date:'2026-10-01',entryIds:[entry.id]},h.owner);
  const source=await h.json(base+'/documents',{name:'Lease original.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Original evidence').toString('base64')},h.owner);
  const proposed=await h.json(base+'/deadlines',{title:'Confirm service',date:'2026-11-15',timezone:'America/New_York',source:'Lease page 1',documentId:source.id},h.owner);await h.json('/deadlines/'+proposed.id+'/confirm',{revision:proposed.revision,note:'Checked against the lease'},h.owner);
  await searchPayment(h,{m,doc:source});
  // The lawyer's timeline holds everything, newest first, each entry linked to its source.
  const mine=await h.json(base+'/timeline',undefined,lawyer);
  for(const kind of ['note','call','commitment','email','task','appointment','bill'])assert.ok(mine.entries.some(e=>e.kind===kind),kind);
  assert.ok(mine.entries.some(e=>e.kind==='deadline'&&e.title==='Confirm service'));assert.ok((await h.json(base+'/timeline?kind=payment',undefined,h.owner)).entries.length===1,'An operating payment appears for those who may see trust applications');
  assert.ok(titles(mine).includes(strategy.title));assert.deepEqual(mine.entries.map(e=>e.at),[...mine.entries.map(e=>e.at)].sort().reverse());
  assert.equal(mine.entries.find(e=>e.kind==='email').source.id,email.id);assert.equal(mine.entries.find(e=>e.kind==='task').source.id,task.id);assert.equal(mine.entries.find(e=>e.id==='call:'+call.id).source.tab,'Matters');
  // The principal and the assistant see every team entry but never the private note.
  for(const reader of [h.owner,assistant]){const t=await h.json(base+'/timeline',undefined,reader);assert.ok(!titles(t).includes(strategy.title));assert.ok(!JSON.stringify(t).includes('adverse-possession'));assert.ok(titles(t).includes(progress.title)&&titles(t).includes(promise.title)&&titles(t).includes(call.title));}
  // Filters: kind, text, dates, and mentions of the reader.
  assert.deepEqual((await h.json(base+'/timeline?kind=call',undefined,assistant)).entries.map(e=>e.kind),['call']);
  assert.deepEqual((await h.json(base+'/timeline?mentions=me',undefined,assistant)).entries.map(e=>e.id),['call:'+call.id]);assert.deepEqual((await h.json(base+'/timeline?mentions=me',undefined,lawyer)).entries,[]);
  assert.deepEqual(titles(await h.json(base+'/timeline?q=draft',undefined,h.owner)).sort(),['Draft the reply','Lease advice prebill','Promised a draft by Thursday']);
  assert.deepEqual((await h.json(base+'/timeline?kind=call&from=2026-10-21T00:00:00.000Z',undefined,lawyer)).entries,[]);await h.json(base+'/timeline?kind=bogus',undefined,lawyer,400);
  // The client timeline holds only the entries shared with the client.
  const view=await h.json('/portal/matters/'+m.id+'/timeline',undefined,client);assert.deepEqual(view.entries.map(e=>e.title).sort(),[fix.title,progress.title].sort());
  assert.ok(!JSON.stringify(view).includes('adverse-possession')&&!JSON.stringify(view).includes('Landlord reply')&&!JSON.stringify(view).includes('Promised a draft'));
  await h.json(base+'/timeline',undefined,client,403);await h.json(base+'/notes',{kind:'note',title:'x',body:'x',visibility:'team'},client,403);await h.json('/portal/matters/'+m.id+'/timeline',undefined,lawyer,403);
  // Search finds team notes for everyone who sees them, and the private note only for its author.
  const find=(q,c)=>h.json('/search?q='+encodeURIComponent(q),undefined,c);
  assert.ok(JSON.stringify(await find('adverse-possession',lawyer)).includes(strategy.id));
  for(const reader of [h.owner,assistant])assert.equal((await find('adverse-possession',reader)).total,0,'A private note is neither a result, a count nor a snippet');
  assert.ok(JSON.stringify(await find('landlord was served',assistant)).includes(progress.id));
  // Walls and withdrawn grants close both timelines; entries survive in the firm archive.
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes(progress.id));
  await h.json('/portal-grants/'+(await h.json(base+'/portal',undefined,h.owner)).grants[0].id+'/revoke',{reason:'Engagement ended'},h.owner);await h.json('/portal/matters/'+m.id+'/timeline',undefined,client,404);
  await h.json(base+'/wall',{custodianEmail:'lawyer@example.test',members:[],reason:'Conflicting representation screen',revision:null},h.owner);
  await h.json(base+'/timeline',undefined,h.owner,404);await h.json(base+'/notes',{kind:'note',title:'x',body:'x',visibility:'team'},h.owner,404);assert.ok((await h.json(base+'/timeline',undefined,lawyer)).entries.length>5);
 }finally{await h.close();}
});
