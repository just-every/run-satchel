import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('MATTER-002 evidence-bound stage transitions, filtered matter boards, exceptions, access and archive history',async()=>{
 const h=await harness();let restored;
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'},{code:'EST',name:'Estates'}]}},h.owner);
  const search=await h.json('/conflicts',{client:'Barton family',adverse:'Elm driver'},h.owner);const m=await h.json('/matters',{title:'Barton demand',practiceCode:'LIT',conflictId:search.id,reviewNote:'Reviewed',confirmed:true},h.owner),other=await open(h,'Other estate','Pine Studio','Elm Trustee'),base='/matters/'+m.id;
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email.split('@')[0],role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
  await h.json(base+'/stage',undefined,lawyer,404);await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json('/stages',{name:'Unauthorized',requiredTypes:[]},assistant,403);
  let stages=(await h.json('/stages',{name:'Demand-ready',requiredTypes:['Medical bill']},lawyer)).stages,stage=stages[0];
  let detail=await h.json(base+'/stage',undefined,lawyer);
  await h.json(base+'/stage-profile',{revision:detail.profile.revision,lawyerEmail:'assistant@example.test'},lawyer,400);
  const priorStage=stage;stage=(await h.json('/stages',{id:stage.id,revision:stage.revision,name:stage.name,requiredTypes:['Medical bill']},lawyer)).stages[0];
  await h.json(base+'/stage-transition',{revision:detail.profile.revision,stageId:stage.id,stageRevision:priorStage.revision,reason:'Review changed requirements',documents:[]},lawyer,409);
  await h.json(base+'/stage-profile',{revision:detail.profile.revision,lawyerEmail:'lawyer@example.test',risk:'high',milestone:'Send demand',milestoneDate:'2026-01-02'},lawyer);
  await h.json(base+'/stage-profile',{revision:detail.profile.revision,risk:'low'},lawyer,409);
  detail=await h.json(base+'/stage',undefined,lawyer);
  const transition=(docs=[],who=lawyer,expected=200,extra={})=>h.json(base+'/stage-transition',{revision:detail.profile.revision,stageId:stage.id,stageRevision:stage.revision,reason:'Reviewed demand package',documents:docs.map(d=>({id:d.id,revision:d.revision,currentVersion:d.currentVersion})),...extra},who,expected);
  await transition([],lawyer,409);detail=await h.json(base+'/stage',undefined,lawyer);assert.ok(detail.history.some(e=>e.kind==='blocked'));assert.equal(detail.profile.stageId,null);
  const upload=async(name,type,visibility='matter',who=h.owner)=>{
   let d=await h.json(base+'/documents',{name,mime:'text/plain',contentBase64:Buffer.from(name+' original').toString('base64'),visibility},who);
   const p=await h.json(base+'/document-sets/preview',{documents:[{id:d.id,revision:d.revision}],documentType:type},who);await h.json(base+'/document-sets/apply',{previewId:p.id},who);
   return (await h.json(base+'/documents',undefined,who)).find(x=>x.id===d.id);
  };
  const privateBill=await upload('Privileged medical bill','Medical bill','private');await transition([privateBill],lawyer,404);
  const unrelated=await upload('Cover letter','Correspondence');await transition([unrelated],lawyer,409);
  let bill=await upload('Hospital bill','Medical bill');const stale={...bill};
  await h.json(base+'/documents',{documentId:bill.id,revision:bill.revision,name:'Hospital corrected bill',mime:'text/plain',contentBase64:Buffer.from('Corrected hospital original').toString('base64'),visibility:'matter'},h.owner);
  await transition([stale],lawyer,409);bill=(await h.json(base+'/documents',undefined,lawyer)).find(d=>d.id===bill.id);
  const draft=await h.json(base+'/tasks',{title:'Prepare demand',dueDate:'2026-01-01'},lawyer);await h.json(base+'/tasks',{title:'Serve demand',prerequisites:[draft.id],dueDate:'2026-01-02'},lawyer);
  await h.json(base+'/deadlines',{title:'Court review',date:'2026-01-03',timezone:'America/New_York',source:'Scheduling order paragraph 4'},lawyer);
  detail=await h.json(base+'/stage',undefined,lawyer);const before=detail.profile.revision;
  await transition([bill]);await transition([bill],lawyer,409);detail=await h.json(base+'/stage',undefined,lawyer);
  assert.equal(detail.profile.stageId,stage.id);assert.notEqual(detail.profile.revision,before);
  const activity=detail.history.find(e=>e.kind==='transition');assert.ok(activity);assert.ok(JSON.stringify(activity).includes(bill.versions.find(v=>v.version===bill.currentVersion).sha256));
  const board=await h.json('/matter-board',undefined,lawyer);assert.equal(board.matters.length,1);assert.equal(board.matters[0].id,m.id);assert.ok(!JSON.stringify(board).includes(other.id));
  const row=board.matters[0];assert.equal(row.milestoneOverdue,true);assert.equal(row.blockedTasks.length,1);assert.equal(row.overdueTasks.length,2);assert.equal(row.overdueDeadlines.length,1);
  for(const [key,value] of [['lawyer','lawyer@example.test'],['practice','LIT'],['stage',stage.id],['risk','high'],['milestone','demand']])assert.deepEqual((await h.json('/matter-board?'+new URLSearchParams({[key]:value}),undefined,lawyer)).matters.map(m=>m.id),[m.id]);
  assert.equal((await h.json('/matter-board?practice=EST',undefined,lawyer)).matters.length,0);
  assert.equal((await h.json('/matter-board?risk=low',undefined,lawyer)).matters.length,0);
  await h.json(base+'/stage-profile',{revision:detail.profile.revision,risk:'low'},assistant,403);
  const archived=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive:archived,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json(base+'/stage',undefined,restored.owner),await h.json(base+'/stage',undefined,h.owner));
  const audit=await h.json('/audit?matterId='+m.id,undefined,h.owner);assert.ok(audit.records.some(r=>r.action.includes('stage')&&JSON.stringify(r.evidence).includes(bill.id)));
  await h.json(base+'/access',{email:'lawyer@example.test',remove:true},h.owner);await h.json(base+'/stage',undefined,lawyer,404);assert.equal((await h.json('/matter-board',undefined,lawyer)).matters.length,0);
 }finally{await restored?.close();await h.close();}
});
