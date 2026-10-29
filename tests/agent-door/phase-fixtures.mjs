import assert from 'node:assert/strict';

/** Bind the admitted actor through the principal's existing native person door. */
export default async function prepare({phase,request,origin,cookie}) {
 if (phase !== 'initial') return {};
 const native=async(path,body)=>{
  const response=await request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(response.ok,true,'Native person binding lifecycle');
  return response.json();
 };
 const {agents}=await native('/agents/api/agents');
 const admitted=agents.filter(agent=>!agent.revoked&&agent.specialist==='legal-practice coordinator');
 assert.equal(admitted.length,1,'One freshly admitted company agent');
 const {keys}=await native('/api/satchel/team');
 const key=keys.find(key=>key.label==='Declared company preparation');
 assert.ok(key,'Principal-created native preparation key');
 await native('/api/satchel/agent-keys/'+key.id+'/business',{agentId:admitted[0].id,confirmed:true});
 return {};
}
