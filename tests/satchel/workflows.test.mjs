import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('MATTER-004 litigation workflow previews on an existing matter, generates approved steps once across stop and restart, versions without rewriting history, rolls out to chosen matters, proposes on triggers and joins closure and reopening',async()=>{
 const h=await harness();let restored;
 try{
  const m=await open(h,'Harper v. Reed','Harper family','Reed Logistics'),m2=await open(h,'Pine v. Elm','Pine family','Elm Trustee');
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');await h.json('/matters/'+m.id+'/access',{email:'assistant@example.test'},h.owner);
  const steps=[{key:'answer',kind:'task',title:'File answer',offsetDays:20,priority:'high'},{key:'kickoff',kind:'appointment',title:'Litigation kickoff',offsetDays:3,time:'10:00',durationMinutes:60},
   {key:'records',kind:'document_request',title:'Client medical records',offsetDays:7},{key:'engagement',kind:'draft_document',title:'Engagement letter',offsetDays:0,body:'Engagement for {{client}} in {{matter}} ({{number}}).'}];
  await h.json('/workflows',{name:'Litigation',trigger:'manual',steps,note:'Initial litigation workflow'},assistant,403);
  await h.json('/workflows',{name:'Bad',trigger:'manual',steps:[steps[0],steps[0]],note:'Duplicate keys'},h.owner,400);
  let wf=(await h.json('/workflows',{name:'Litigation',trigger:'manual',steps,note:'Initial litigation workflow'},h.owner)).workflows[0];
  const base='/matters/'+m.id;

  // Preview on an existing matter, then approve selected steps.
  const preview=await h.json(base+'/workflow-preview',{workflowId:wf.id},h.owner);
  assert.deepEqual(preview.steps.map(s=>[s.key,s.kind,s.created]),[['answer','task',false],['kickoff','appointment',false],['records','document_request',false],['engagement','draft_document',false]]);
  await h.json('/matters/'+m2.id+'/workflow-preview',{workflowId:wf.id},assistant,403);await h.json('/matters/'+m.id+'/workflow-preview',{workflowId:wf.id},lawyer,404);
  await h.json(base+'/workflow-runs',{workflowId:wf.id,version:1,steps:['invented']},h.owner,400);
  let state=await h.json(base+'/workflow-runs',{workflowId:wf.id,version:1,steps:['answer','kickoff','engagement']},h.owner);
  let run=state.runs[0];assert.deepEqual(run.generated.map(g=>g.key).sort(),['answer','engagement','kickoff']);assert.equal(run.status,'active');
  const count=async()=>({tasks:(await h.json(base+'/tasks',undefined,h.owner)).length,calendar:JSON.stringify(await h.json(base+'/calendar',undefined,h.owner)).split('Litigation kickoff').length-1,documents:(await h.json(base+'/documents',undefined,h.owner)).filter(d=>d.title==='Engagement letter.txt').length});
  assert.deepEqual(await count(),{tasks:1,calendar:1,documents:1});
  const draft=(await h.json(base+'/documents',undefined,h.owner)).find(d=>d.title==='Engagement letter.txt');
  assert.equal(await(await h.request('/api/satchel/documents/'+draft.id+'/file',undefined,h.owner)).text(),`Engagement for Harper family in Harper v. Reed (${m.matter_number}).`);
  // A repeated approval of the same steps creates nothing.
  state=await h.json(base+'/workflow-runs',{workflowId:wf.id,version:1,revision:run.revision,steps:['answer','kickoff']},h.owner);run=state.runs[0];assert.equal(run.generated.length,3);assert.deepEqual(await count(),{tasks:1,calendar:1,documents:1});

  // Stop keeps completed work; restart creates each approved step once.
  const answer=run.generated.find(g=>g.key==='answer');
  state=await h.json('/workflow-runs/'+run.id+'/stop',{revision:run.revision,reason:'Client pausing litigation'},h.owner);run=state.runs[0];assert.equal(run.status,'stopped');
  await h.json(base+'/workflow-runs',{workflowId:wf.id,version:1,steps:['records']},h.owner);run=(await h.json(base+'/workflows',undefined,h.owner)).runs.find(r=>r.status==='active');
  assert.equal((await h.json(base+'/workflows',undefined,h.owner)).runs.length,2,'A stopped run stays in history; a new approval starts a new run');
  await h.json('/workflow-runs/'+run.id+'/stop',{revision:run.revision,reason:'Use the original run'},h.owner);
  let first=(await h.json(base+'/workflows',undefined,h.owner)).runs[0];
  await h.json('/tasks/'+answer.id+'/complete',{evidence:'Answer filed; court receipt checked'},h.owner);
  state=await h.json('/workflow-runs/'+first.id+'/restart',{revision:first.revision,reason:'Client resumed'},h.owner);first=state.runs[0];
  assert.equal(first.status,'active');assert.equal(first.generated.length,3);assert.deepEqual(await count(),{tasks:1,calendar:1,documents:1});
  assert.equal((await h.json(base+'/tasks',undefined,h.owner)).find(t=>t.id===answer.id).status,'done');
  assert.deepEqual(first.history.map(e=>e.kind),['approved','approved','stopped','restarted']);

  // Edit the template: completed history stays; open matters receive new steps only when chosen.
  await h.json('/matters/'+m2.id+'/workflow-runs',{workflowId:wf.id,version:1,steps:['answer']},h.owner);
  await h.json('/workflows/'+wf.id+'/versions',{version:2,steps,note:'Stale'},h.owner,409);
  const v2=[{...steps[0],title:'File answer (revised)'},...steps.slice(1),{key:'disclosures',kind:'task',title:'Serve initial disclosures',offsetDays:30}];
  wf=(await h.json('/workflows/'+wf.id+'/versions',{version:1,steps:v2,note:'Add disclosures'},h.owner)).workflows[0];assert.equal(wf.currentVersion,2);assert.equal(wf.versions[0].steps[0].title,'File answer');
  let roll=await h.json('/workflows/'+wf.id+'/rollout',undefined,h.owner);assert.deepEqual(roll.matters.map(x=>[x.matterId,x.fromVersion,x.newSteps.map(s=>s.key)]).sort(),[[m.id,1,['disclosures']],[m2.id,1,['disclosures']]].sort());
  await h.json('/workflows/'+wf.id+'/rollout',{version:2,matterIds:['invented']},h.owner,409);
  roll=await h.json('/workflows/'+wf.id+'/rollout',{version:2,matterIds:[m.id]},h.owner);assert.deepEqual(roll.matters.map(x=>x.matterId),[m2.id]);
  first=(await h.json(base+'/workflows',undefined,h.owner)).runs[0];assert.equal(first.version,2);assert.deepEqual(first.generated.map(g=>g.key).sort(),['answer','disclosures','engagement','kickoff']);
  const list=await h.json(base+'/tasks',undefined,h.owner);assert.ok(list.some(t=>t.title==='File answer'));assert.ok(!list.some(t=>t.title==='File answer (revised)'),'Completed history keeps its generated title');
  assert.deepEqual((await h.json('/matters/'+m2.id+'/workflows',undefined,h.owner)).runs[0].generated.map(g=>g.key),['answer'],'An unchosen matter is unchanged');

  // Triggers propose runs for review: an approved stage transition and a matter opening.
  const stage=(await h.json('/stages',{name:'Discovery',requiredTypes:[]},h.owner)).stages[0];
  await h.json('/workflows',{name:'Discovery kit',trigger:'stage',triggerStageId:stage.id,steps:[{key:'interrogatories',kind:'task',title:'Draft interrogatories',offsetDays:5}],note:'Discovery'},h.owner);
  await h.json('/workflows',{name:'New matter intake',trigger:'opening',steps:[{key:'conflict-letter',kind:'draft_document',title:'Conflict waiver',offsetDays:0,body:'Waiver for {{client}}.'}],note:'Intake'},h.owner);
  const detail=await h.json('/matters/'+m2.id+'/stage',undefined,h.owner);
  await h.json('/matters/'+m2.id+'/stage-transition',{revision:detail.profile.revision,stageId:stage.id,stageRevision:stage.revision,reason:'Pleadings closed',documents:[]},h.owner);
  const proposed=(await h.json('/matters/'+m2.id+'/workflows',undefined,h.owner)).runs.find(r=>r.status==='proposed');assert.equal(proposed.source,'stage');assert.equal(proposed.generated.length,0);
  const m3=await open(h,'Oak estate','Oak family','Birch Holdings');assert.deepEqual((await h.json('/matters/'+m3.id+'/workflows',undefined,h.owner)).runs.map(r=>[r.workflowName,r.status,r.source]),[['New matter intake','proposed','opening']]);

  // Closure checks live runs and open document requests; closed matters generate nothing; reopening resumes only selected runs.
  const pv=b=>h.json(base+'/closure-preview',b,h.owner),decl={clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'No originals held'}};
  let p=await pv(decl);for(const kind of ['workflow-run','document-request'])assert.ok(p.checks.some(c=>c.kind===kind),kind);
  const request=(await h.json(base+'/workflows',undefined,h.owner)).documentRequests[0];assert.equal(request.status,'open');
  const received=await h.json(base+'/documents',{name:'Medical records.txt',mime:'text/plain',contentBase64:Buffer.from('Records').toString('base64'),visibility:'matter'},h.owner);
  await h.json('/document-requests/'+request.id+'/receive',{documentId:received.id},h.owner);p=await pv(decl);assert.ok(!p.checks.some(c=>c.kind==='document-request'));
  await h.json(base+'/close',{previewId:p.id,digest:p.digest,revision:p.revision,reason:'Litigation concluded',exceptions:p.checks.map(c=>({key:c.key,reason:'Carried by counsel'}))},h.owner);
  first=(await h.json(base+'/workflows',undefined,h.owner)).runs[0];
  await h.json(base+'/workflow-runs',{workflowId:wf.id,version:2,revision:first.revision,steps:['records']},h.owner,409);
  const closed=await h.json(base+'/lifecycle',undefined,h.owner);assert.ok(closed.workflows.some(w=>w.id==='workflow-run:'+first.id));
  await h.json(base+'/reopen',{revision:closed.revision,reason:'Appeal filed',workflows:[],access:[]},h.owner);
  first=(await h.json(base+'/workflows',undefined,h.owner)).runs[0];assert.equal(first.status,'stopped');assert.deepEqual(first.history.at(-1).detail,{reason:'Not resumed on reopening'});assert.equal(first.generated.length,4);
  const pv2=await h.json('/matters/'+m2.id+'/closure-preview',decl,h.owner);await h.json('/matters/'+m2.id+'/close',{previewId:pv2.id,digest:pv2.digest,revision:pv2.revision,reason:'Settled',exceptions:pv2.checks.map(c=>({key:c.key,reason:'Carried'}))},h.owner);
  const closed2=await h.json('/matters/'+m2.id+'/lifecycle',undefined,h.owner),live=(await h.json('/matters/'+m2.id+'/workflows',undefined,h.owner)).runs.filter(r=>r.status!=='stopped');
  await h.json('/matters/'+m2.id+'/reopen',{revision:closed2.revision,reason:'Settlement breached',workflows:live.map(r=>'workflow-run:'+r.id),access:[]},h.owner);
  assert.deepEqual((await h.json('/matters/'+m2.id+'/workflows',undefined,h.owner)).runs.map(r=>[r.status,r.history.at(-1).kind]),[['active','resumed'],['proposed','resumed']]);

  const audit=await h.json('/audit?matterId='+m.id,undefined,h.owner);for(const action of ['workflow.run_approved','workflow.run_stopped','workflow.run_restarted','workflow.run_rolled_out'])assert.ok(audit.records.some(r=>r.action===action),action);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json(base+'/workflows',undefined,restored.owner),await h.json(base+'/workflows',undefined,h.owner));assert.deepEqual(await restored.json('/workflows',undefined,restored.owner),await h.json('/workflows',undefined,h.owner));
 }finally{await restored?.close();await h.close();}
});
