import assert from 'node:assert/strict';
import surface from '../../agent-surface.json' with {type:'json'};
import {resolveArgs} from '../../src/modules/agent-door/conformance/protocol.mjs';

/** A person binds the random harness actor through the actual native door. */
export default async function journey({request,origin,cookie,tool}) {
 const personRequest=async(path,body)=>{const r=await request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)console.log('Native door lifecycle refused: '+(path.endsWith('/decide')?'proposal decision':path.startsWith('/auth/')?'person identity':'native record')+' status='+r.status);assert.equal(r.ok,true,'Native person lifecycle');return r;};
 const native=async(path,body)=>(await personRequest('/api/satchel'+path,body)).json();
 console.log('Native door journey: start');
 const identity=(await tool('satchel.agent.identity',{})).result.structuredContent;
 const person=await native('/me'),initial=(await native('/state')).proposals;
 const {keys}=await native('/team'),key=keys.find(k=>k.label==='Declared company preparation');
 await native('/agent-keys/'+key.id+'/business',{agentId:identity.agentId,confirmed:true});
 console.log('Native door journey: binding saved');
 const outputs=new Map(),preparations=[];
 for(const step of surface.journey){
  const args=resolveArgs(step.args,outputs);
  if(!surface.tools.find(t=>t.name===step.tool).readOnly)args.idempotency_key=crypto.randomUUID();
  console.log('Native door journey: '+step.id);
  const answer=await tool(step.tool,args);assert.equal(answer.result?.isError,false,step.tool);assert.ok(answer.result?.structuredContent,step.tool);
  outputs.set(step.id,answer.result.structuredContent);
  if(args.idempotency_key){
   const proposal=answer.result.structuredContent,preparedBy=proposal.preparedBy;
   assert.equal(preparedBy.legacy,false,'Company preparation retains its complete identity');
   assert.equal(preparedBy.agent.id,identity.agentId);assert.ok(preparedBy.agent.name);
   assert.deepEqual(preparedBy.for,{id:identity.personId,name:person.name});
   assert.equal(preparedBy.label,`${preparedBy.agent.name} for ${person.name}`);
   preparations.push(proposal);
   const before=(await native('/state')).proposals.map(p=>p.id).sort();
   const replay=await tool(step.tool,args);assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent,'Native proposal replay');
   assert.deepEqual((await native('/state')).proposals.map(p=>p.id).sort(),before,'Replay creates no duplicate preparation');
  }
 }
 assert.equal((await native('/state')).proposals.length,initial.length+preparations.length,'One native preparation per mutating call');
 console.log('Native door journey: preparation replay reconciled');
 const decisions=new Map(),results=new Map();
 const retainedHistory=async()=>{
  const state=await native('/state');
  for(const proposal of preparations){
   const saved=state.proposals.find(p=>p.id===proposal.id);assert.ok(saved,'Company preparation is visible to its sponsor');
   assert.deepEqual(saved.preparedBy,proposal.preparedBy,'History retains the original company preparer and sponsor');
   assert.equal(saved.status,decisions.get(proposal.id)??'pending');
   if(decisions.has(proposal.id))assert.equal(saved.decided_by,person.email);
  }
  for(const action of ['proposal.prepared','proposal.approved','proposal.declined']){
   const records=(await native('/audit?action='+action+'&limit=200')).records;
   const exported=(await(await personRequest('/api/satchel/audit/export?action='+action)).text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   const expected=action==='proposal.prepared'?preparations:preparations.filter(p=>action==='proposal.'+decisions.get(p.id));
   for(const proposal of expected){
    for(const rows of [records,exported]){
     const matching=rows.filter(r=>r.action===action&&r.objectId===proposal.id);assert.equal(matching.length,1,'Exactly one retained preparation or person decision');
     const record=matching[0];assert.deepEqual(record.preparedBy,proposal.preparedBy,'Audit and export retain the original preparation identity');
     assert.equal(record.actor.id,identity.personId);assert.equal(record.actor.email,person.email);
     assert.equal(record.actor.channel,action==='proposal.prepared'?'agent':'person','The person decision remains separate from the agent preparer');
    }
   }
  }
  for(const [proposalId,resultId] of results){
   const proposal=preparations.find(p=>p.id===proposalId),action='deadline.proposed';
   const records=(await native('/audit?action='+action+'&limit=200')).records.filter(r=>r.objectId===resultId);
   assert.equal(records.length,1,'Accepted company preparation has one native result action');
   const record=records[0];assert.equal(record.actor.channel,'person');assert.equal(record.actor.id,person.id);assert.equal(record.evidence.decision.id,proposalId);assert.deepEqual(record.preparedBy,proposal.preparedBy);
   const exported=(await(await personRequest('/api/satchel/audit/export?action='+action)).text()).trim().split('\n').map(JSON.parse).filter(r=>r.objectId===resultId);assert.deepEqual(exported,records);
  }
 };
 await retainedHistory();
 console.log('Native door journey: initial attribution reconciled');
 await personRequest('/auth/display-name',{displayName:person.name+' renamed'});
 try{
  assert.equal((await native('/me')).name,person.name+' renamed','The signed-in sponsor name actually changed');
  await retainedHistory();
  console.log('Native door journey: renamed sponsor history retained');
  const approved=preparations.find(p=>p.kind==='deadline'),declined=preparations.find(p=>p.kind==='matter');
  assert.ok(approved);assert.ok(declined);
  console.log('Native door journey: person accepts prepared deadline');
  const result=await native('/proposals/'+approved.id+'/decide',{decision:'approve'});decisions.set(approved.id,'approved');results.set(approved.id,result.id);
  await native('/proposals/'+declined.id+'/decide',{decision:'decline',reason:'Counsel declined this preparation'});decisions.set(declined.id,'declined');
  await retainedHistory();
  const controls=await native('/agent-controls');
  assert.ok(controls.delegations.every(d=>d.spend_cents===0),'No spend authority');
  await native('/keys/'+key.id+'/revoke',{});
  const refused=await tool('satchel.agent.context',{});assert.equal(refused.result?.isError,true,'Native key revocation stops company agent');assert.equal(refused.result?._meta?.['com.runeditrun/error']?.code,'native_delegation_required');console.log('Native door journey: binding, class coverage, replay and revocation passed');
  await retainedHistory();
 }finally{await personRequest('/auth/display-name',{displayName:person.name});}
}
