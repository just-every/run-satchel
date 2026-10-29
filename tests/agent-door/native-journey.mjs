import assert from 'node:assert/strict';
import surface from '../../agent-surface.json' with {type:'json'};
import {resolveArgs} from '../../src/modules/agent-door/conformance/protocol.mjs';

/** A person binds the random harness actor through the actual native door. */
export default async function journey({request,origin,cookie,tool}) {
 const native=async(path,body)=>{const r=await request(origin+'/api/satchel'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.ok,true,'Native person lifecycle');return r.json();};
 console.log('Native door journey: start');
 const identity=(await tool('satchel.agent.identity',{})).result.structuredContent;
 const {keys}=await native('/team'),key=keys.find(k=>k.label==='Declared company preparation');
 await native('/agent-keys/'+key.id+'/business',{agentId:identity.agentId,confirmed:true});
 console.log('Native door journey: binding saved');
 const outputs=new Map();
 for(const step of surface.journey){
  const args=resolveArgs(step.args,outputs);
  if(!surface.tools.find(t=>t.name===step.tool).readOnly)args.idempotency_key=crypto.randomUUID();
  console.log('Native door journey: '+step.id);
  const answer=await tool(step.tool,args);assert.equal(answer.result?.isError,false,step.tool);assert.ok(answer.result?.structuredContent,step.tool);
  outputs.set(step.id,answer.result.structuredContent);
  if(args.idempotency_key){const replay=await tool(step.tool,args);assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent,'Native proposal replay');}
 }
 const controls=await native('/agent-controls');
 assert.ok(controls.delegations.every(d=>d.spend_cents===0),'No spend authority');
 await native('/keys/'+key.id+'/revoke',{});
 const refused=await tool('satchel.agent.context',{});assert.equal(refused.result?.isError,true,'Native key revocation stops company agent');assert.equal(refused.result?._meta?.['com.runeditrun/error']?.code,'native_delegation_required');console.log('Native door journey: binding, class coverage, replay and revocation passed');
}
