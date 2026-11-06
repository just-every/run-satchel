import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAgentReference,assertFixtureReference,assertRuntimeReference} from './reference.mjs';
import {proveSponsorLifecycle,verifySponsorProbeState} from './sponsor-fixtures.mjs';
import surface from '../../agent-surface.json' with {type:'json'};
import {resolveArgs} from '../../src/modules/agent-door/conformance/protocol.mjs';

/** A person binds the random harness actor through the actual native door. */
export default async function journey({request,origin,cookie,email,database,tool}) {
 const native=async(path,body)=>{const r=await request(origin+'/api/satchel'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.ok,true,'Native person lifecycle');return r.json();};
 await verifySponsorProbeState({database});
 console.log('Native door journey: start');
 const guide=readAgentReference(await readFile('dist/site/docs/agents.html','utf8'));
 assertFixtureReference(guide,surface);
 // A fresh native key authenticates real MCP listings; it is revoked before preparation.
 const referenceKey=await native('/keys',{label:'Reference catalogue probe'});
 const rpc=async(method,params={})=>{
  const version='2026-07-28';
  const response=await request(origin+'/mcp',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+referenceKey.key,'Content-Type':'application/json','MCP-Protocol-Version':version,'Mcp-Method':method,...(params.name?{'Mcp-Name':params.name}:{}),...(params.uri?{'Mcp-Name':params.uri}:{})},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':version}}})});
  assert.equal(response.status,200,'Authenticated reference probe '+method);return response.json();
 };
 try{
  const listed=await rpc('tools/list'),templates=await rpc('resources/templates/list'),discovery=await rpc('server/discover');
  assertRuntimeReference(guide,listed.result.tools,templates.result.resourceTemplates,discovery.result._meta['com.runeditrun/capabilities']);
  assert.deepEqual(discovery.result._meta['com.runeditrun/capabilities'].declared,surface.capabilities);
  const prompts=await rpc('prompts/list');assert.deepEqual(prompts.result.prompts,[],'Undeclared prompts remain empty');
  const witness=await rpc('tools/call',{name:'satchel.agent.identity',arguments:{}});
  for(const [method,args] of [['resources/read',{uri:'satchel://proposals/unavailable'}],['prompts/get',{name:'legal-practice-coordinator'}],['subscriptions/listen',{}],['tools/call',{name:'satchel.events.list',arguments:{limit:1}}]]){
   const answer=await rpc(method,args);assert.equal(answer.error?.data?.code??answer.result?._meta?.['com.runeditrun/error']?.code,'capability_not_declared','The documented undeclared surface refuses '+method);
  }
  assert.deepEqual((await rpc('tools/call',{name:'satchel.agent.identity',arguments:{}})).result.structuredContent,witness.result.structuredContent,'Undeclared surface probes leave native preparations unchanged');
  console.log('Native door journey: published guide matches authenticated tools, templates and refused families');
 }finally{await native('/keys/'+referenceKey.id+'/revoke',{});}

 const identity=(await tool('satchel.agent.identity',{})).result.structuredContent;
 const {keys}=await native('/team'),key=keys.find(k=>k.label==='Declared company preparation');
 await native('/agent-keys/'+key.id+'/business',{agentId:identity.agentId,confirmed:true});
 console.log('Native door journey: binding saved');
 const outputs=new Map();
 for(const step of surface.journey){
  const published=guide.fixtures.find(f=>f.id===step.id);
  const args=resolveArgs(published?.args??step.args,outputs);
  if(!surface.tools.find(t=>t.name===step.tool).readOnly)args.idempotency_key=crypto.randomUUID();
  console.log('Native door journey: '+step.id);
  const answer=await tool(step.tool,args);assert.equal(answer.result?.isError,false,step.tool);assert.ok(answer.result?.structuredContent,step.tool);
  assert.deepEqual(answer.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),step.expect,'Actual classifier matches independently declared fixture '+step.id);
  if(guide.fixtures.some(f=>f.id===step.id))assert.deepEqual(guide.fixtures.find(f=>f.id===step.id).expect,step.expect,'Published fixture '+step.id);
  outputs.set(step.id,answer.result.structuredContent);
  if(args.idempotency_key){const replay=await tool(step.tool,args);assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent,'Native proposal replay');}
 }
 const controls=await native('/agent-controls');
 assert.ok(controls.delegations.every(d=>d.spend_cents===0),'No spend authority');
 await proveSponsorLifecycle({request,origin,cookie,email,database,tool},controls.delegations.find(d=>d.key_id===key.id).matter_id);
 const ownerStillAllowed=await tool('satchel.proposal.prepare_matter',{delegationId:controls.delegations.find(d=>d.key_id===key.id).id,payload:{title:'Owner preparation after member refusals',client:'Synthetic client',adverse:'Synthetic counterparty'},idempotency_key:crypto.randomUUID()});
 assert.equal(ownerStillAllowed.result?.isError,false,'Member lifecycle changes preserve owner preparation');
 assert.equal(ownerStillAllowed.result?.structuredContent?.status,'pending','The existing owner still creates a human-reviewed proposal');
 console.log('Sponsor lifecycle: existing owner preparation remains successful');
 await native('/keys/'+key.id+'/revoke',{});
 const refused=await tool('satchel.agent.context',{});assert.equal(refused.result?.isError,true,'Native key revocation stops company agent');assert.equal(refused.result?._meta?.['com.runeditrun/error']?.code,'native_delegation_required');console.log('Native door journey: binding, class coverage, replay and revocation passed');
}
