import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness,open} from './harness.mjs';
test('CONNECT-001 scoped versioned integration pages every native resource, prepares once, delivers signed duplicate ids, journals uncertainty and refuses hidden matters, approvals and revocation',async()=>{
 const received=[];let fail=true;
 const h=await harness({webhookResponse:async r=>{received.push({body:await r.text(),headers:Object.fromEntries(r.headers)});return new Response(null,{status:fail?302:204,headers:fail?{location:'https://127.0.0.1/private'}:{}});}});
 try{
  const a=await open(h),b=await open(h,'Pine advice','Pine Studio','Oak Estate'),hidden=await open(h,'Private negotiation','Lake Company','East Properties');
  await h.json('/team',{email:'assistant@example.test',name:'Assigned assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/integrations',{label:'Cannot grant self access',matterIds:[a.id],scopes:['matters:read'],endpoint:'https://receiver.example.com/events'},assistant,403);
  const create={label:'Counsel docket sync',matterIds:[a.id,b.id],scopes:['matters:read','tasks:read','documents:read','deadlines:read','finance:read','proposals:prepare'],endpoint:'https://receiver.example.com/events',eventTypes:['task.changed','document.changed','deadline.changed','finance.changed','proposal.decided','matter.updated']};
  const i=await h.json('/integrations',create,h.owner),auth={authorization:'Bearer '+i.key};
  const first=await h.json('/v1/matters?limit=1',undefined,'',200,auth),second=await h.json('/v1/matters?limit=1&after='+first.next,undefined,'',200,auth);
  assert.equal(first.items.length,1);assert.ok(first.next);assert.equal(second.next,null);assert.deepEqual(new Set([...first.items,...second.items].map(m=>m.id)),new Set([a.id,b.id]));
  assert.equal((await h.json('/v1/matters/'+a.id,undefined,'',200,auth)).id,a.id);await h.json('/v1/matters/'+hidden.id,undefined,'',404,auth);await h.json('/v1/matters?limit=101',undefined,'',400,auth);
  const doc=await h.json('/matters/'+a.id+'/documents',{name:'Reviewed schedule.txt',mime:'text/plain',contentBase64:Buffer.from('Schedule with original client instructions.').toString('base64'),visibility:'matter'},h.owner);
  const task=await h.json('/matters/'+a.id+'/tasks',{title:'Review client instructions',priority:'normal',ownerEmail:'owner@example.test'},h.owner);
  await h.json('/matters/'+hidden.id+'/tasks',{title:'Privileged settlement',priority:'high'},h.owner);
  const entry=await h.json('/matters/'+a.id+'/entries',{kind:'time',date:'2026-10-01',description:'Review schedule',minutes:60,rateCents:25000},h.owner);
  const deadline=await h.json('/matters/'+a.id+'/deadlines',{title:'Confirm service',date:'2026-11-15',timezone:'America/New_York',source:'Reviewed schedule page 1',documentId:doc.id},h.owner);
  for(const [kind,id] of [['tasks',task.id],['documents',doc.id],['deadlines',deadline.id],['finance',entry.id]])assert.ok((await h.json('/v1/matters/'+a.id+'/'+kind+'?limit=1',undefined,'',200,auth)).items.some(x=>x.id===id));
  const original=await h.request('/api/satchel/v1/documents/'+doc.id+'/file',undefined,'',auth);assert.equal(original.status,200);assert.equal(await original.text(),'Schedule with original client instructions.');
  const body={matterId:a.id,title:'Prepared counsel bill',date:'2026-10-01',entryIds:[entry.id]},prepareAuth={...auth,'Idempotency-Key':'bill-once'};
  const p=await h.json('/v1/prepare/bill',body,'',200,prepareAuth);assert.equal((await h.json('/v1/prepare/bill',body,'',200,prepareAuth)).id,p.id);
  await h.json('/v1/prepare/bill',{...body,title:'Different package'},'',409,prepareAuth);await h.json('/v1/prepare/bill',{...body,matterId:hidden.id},'',404,{...auth,'Idempotency-Key':'hidden'});await h.json('/v1/prepare/matter',{title:'New matter'},'',403,{...auth,'Idempotency-Key':'no-new-matter'});
  assert.equal((await h.request('/api/satchel/proposals/'+p.id+'/decide',{decision:'decline',reason:'Agent cannot decide'},'',auth)).status,401);
  for(const [route,body] of [['/bills/not-authorized/approve',{revision:'no'}],['/deadlines/'+deadline.id+'/confirm',{revision:deadline.revision}],['/trust/transfers',{billId:'no'}],['/matters/'+a.id+'/access',{email:'other@example.test'}]])assert.equal((await h.request('/api/satchel'+route,body,'',auth)).status,401);
  assert.equal((await h.request('/api/satchel/agent/context',undefined,'',auth)).status,401);
  await h.json('/proposals/'+p.id+'/decide',{decision:'decline',reason:'Counsel will use the next billing cycle'},h.owner);
  await h.json('/integrations/'+i.id+'/dispatch',{},h.owner);assert.ok(received.length>=5);
  let journal=await h.json('/integrations/'+i.id+'/journal',undefined,h.owner);assert.ok(journal.attempts.some(x=>x.outcome==='failed'&&x.http_status===302));
  const paused=(await h.json('/integrations',undefined,h.owner)).integrations.find(x=>x.id===i.id);assert.equal(paused.paused,1);const beforeResume=received.length;await h.json('/integrations/'+i.id+'/dispatch',{},h.owner);assert.equal(received.length,beforeResume);fail=false;await h.json('/integrations/'+i.id+'/resume',{},h.owner);await h.restart();await h.scheduled('2026-10-19T20:00:00Z');
  journal=await h.json('/integrations/'+i.id+'/journal',undefined,h.owner);assert.ok(journal.deliveries.every(x=>['delivered','refused'].includes(x.status)));
  const event=JSON.parse(received[0].body),copies=received.filter(x=>JSON.parse(x.body).id===event.id);assert.equal(copies.length,2);
  for(const r of received){const e=JSON.parse(r.body),headers=r.headers;assert.equal(headers['satchel-event-id'],e.id);assert.equal(headers['satchel-signature'],'sha256='+createHmac('sha256',i.signingSecret).update(headers['satchel-timestamp']+'.'+e.id+'.'+r.body).digest('hex'));assert.ok([a.id,b.id].includes(e.matterId));assert.equal(Object.hasOwn(e,'title'),false);}
  await h.json('/integrations/'+i.id+'/dispatch',{eventId:event.id},h.owner);assert.equal(received.filter(x=>JSON.parse(x.body).id===event.id).length,3);
  const feed=await h.json('/v1/events?limit=100',undefined,'',200,auth);assert.ok(feed.items.some(x=>x.type==='proposal.decided'));assert.ok(feed.items.some(x=>x.type==='finance.changed'));
  const restricted=await h.json('/integrations',{label:'Matter list only',matterIds:[a.id],scopes:['matters:read']},h.owner);await h.json('/v1/matters/'+a.id+'/documents',undefined,'',403,{authorization:'Bearer '+restricted.key});
  const listed=await h.json('/integrations',undefined,h.owner);assert.ok(!JSON.stringify(listed).includes(i.key));assert.ok(!JSON.stringify(listed).includes(i.signingSecret));
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!archive.includes(i.key));assert.ok(!archive.includes(i.signingSecret));assert.ok(!archive.includes('secret_sealed'));
  const rotated=await h.json('/integrations/'+i.id+'/rotate',{},h.owner);await h.json('/v1/matters',undefined,'',401,auth);const newAuth={authorization:'Bearer '+rotated.key};await h.json('/v1/matters',undefined,'',200,newAuth);assert.notEqual(rotated.signingSecret,i.signingSecret);await h.json('/matters/'+a.id+'/tasks',{title:'After credential rotation',priority:'normal'},h.owner);const beforeRotationResume=received.length;await h.json('/integrations/'+i.id+'/dispatch',{},h.owner);assert.equal(received.length,beforeRotationResume);await h.json('/integrations/'+i.id+'/resume',{},h.owner);await h.json('/integrations/'+i.id+'/dispatch',{},h.owner);const fresh=received.at(-1);assert.equal(fresh.headers['satchel-signature'],'sha256='+createHmac('sha256',rotated.signingSecret).update(fresh.headers['satchel-timestamp']+'.'+fresh.headers['satchel-event-id']+'.'+fresh.body).digest('hex'));await h.json('/integrations/'+i.id+'/revoke',{},h.owner);await h.json('/v1/matters',undefined,'',401,newAuth);const count=received.length;await h.json('/integrations/'+i.id+'/dispatch',{},h.owner);assert.equal(received.length,count);
 }finally{await h.close();}
});
