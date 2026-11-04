import assert from 'node:assert/strict';
import {authorizeAgent} from './agent-fixture.mjs';

// Both repairs use the same authenticated preparation and principal inspector
// doors as the original journey. No storage edits or synthetic recommendations.
export async function agentMetricRepairFixture(h,f){
 const get=()=>h.json('/agent-metrics',undefined,h.owner),key=await h.json('/keys',{label:'Revoked preparation probe'},h.owner),grant=await authorizeAgent(h,key,f.m.id,{delegation:{sources:[{documentId:f.source.id,version:1,kind:'matter'}]}});
 await h.json('/agent-delegations/'+grant.delegation.id+'/revoke',{reason:'Revoke preparation authority before retry'},h.owner);
 const before=await get(),payload={matterId:f.m.id,title:'Retry after delegation revocation',date:'2099-12-01',timezone:'America/New_York',source:'Retained original, principal review required'};
 await h.json('/agent/prepare-deadline',payload,'',403,grant.auth);
 const after=await get(),audit=await h.json('/audit?action=agent.preparation_refused&matterId='+f.m.id,undefined,h.owner);
 const integration=await h.json('/integrations',{label:'Source-traced integration',matterIds:[f.m.id],scopes:['documents:read','proposals:prepare']},h.owner),auth={authorization:'Bearer '+integration.key,'Idempotency-Key':'synthetic-satchel-metric-source'};
 const body={...payload,title:'Document-backed integration recommendation',documentId:f.source.id},proposal=await h.json('/v1/prepare/deadline',body,'',200,auth),original=(await get()).items.find(i=>i.id===proposal.id).provenance;
 const changed=await h.json(f.base+'/documents',{documentId:f.source.id,revision:f.source.revision,name:f.source.title,mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('synthetic-satchel-42 updated integration source').toString('base64')},h.owner);
 const replay=await h.json('/v1/prepare/deadline',body,'',200,auth),later=(await get()).items.find(i=>i.id===proposal.id).provenance;
 return {before,after,audit,payload,grant,proposal,original,changed,replay,later};
}
export async function proveAgentMetricRepairs(h,f){
 await h.json('/keys/'+f.key.id+'/revoke',{},h.owner);
 const r=await agentMetricRepairFixture(h,f),refused=r.after.items.filter(i=>i.origin==='refusal'),retry=refused.find(i=>i.inputs.title===r.payload.title);
 assert.equal(r.before.counts.refused,2);assert.equal(r.after.counts.refused,3);
 assert.deepEqual({...r.after.counts,refused:r.before.counts.refused},r.before.counts);
 assert.equal(r.after.items.length,Object.values(r.after.counts).reduce((a,b)=>a+b,0));
 assert.equal(r.audit.total,2);assert.equal(refused.length,r.audit.total);
 assert.deepEqual(new Set(refused.map(i=>i.id)),new Set(r.audit.records.map(a=>a.objectId)));
 assert.ok(retry);assert.equal(retry.status,'refused');assert.equal(retry.result,null);assert.equal(retry.provenance.policy.delegationId,r.grant.delegation.id);
 const recorded=r.audit.records.find(a=>a.objectId===retry.id);assert.equal(recorded.matterId,f.m.id);assert.deepEqual(recorded.evidence.record.preparationProvenance,retry.provenance);assert.deepEqual(retry.audit.map(a=>a.id),[recorded.id]);
 const original=r.original,document=original.documents[0];
 assert.equal(r.proposal.payload.version,1);assert.equal(original.inputs.version,1);assert.equal(document.documentId,f.source.id);assert.equal(document.version,1);assert.equal(document.documentRevision,f.source.revision);assert.equal(document.sha256,f.source.versions[0].sha256);assert.ok(!JSON.stringify(original).includes('original provenance'),'No original bytes are retained');
 const prepared=(await h.json('/audit?action=proposal.prepared&matterId='+f.m.id,undefined,h.owner)).records.find(a=>a.objectId===r.proposal.id);assert.deepEqual(prepared.evidence.record.preparationProvenance,original);
 assert.equal(r.changed.currentVersion,2);assert.deepEqual(r.replay,r.proposal);assert.deepEqual(r.later,original);
 await h.json('/proposals/'+r.proposal.id+'/decide',{decision:'approve'},h.owner,409);
 const custodian='synthetic-satchel-repair-custodian@example.test';await h.json('/team',{email:custodian,name:'Repair wall custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:custodian},h.owner);await h.json(f.base+'/access',{email:custodian},h.owner);
 await h.json(f.base+'/wall',{custodianEmail:custodian,members:[],reason:'Exclude the principal from the repaired evidence',revision:null},h.owner);
 const walled=await h.json('/agent-metrics',undefined,h.owner);assert.deepEqual(walled.counts,{pending:0,accepted:0,declined:0,refused:0});assert.deepEqual(walled.items,[]);assert.ok(!JSON.stringify(walled).includes(f.source.id));
}
