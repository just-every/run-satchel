import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {authorizeAgent} from './agent-fixture.mjs';
import {earnedBill} from './trust-fixture.mjs';

export async function provePreparationAttribution(){
 const h=await harness();try{
  const m=await open(h,'Attribution custody'),person=(await h.json('/state',undefined,h.owner)).actor,bill=await earnedBill(h,m,12000,'Retained issued services');
  const approval=b=>({person:b.approvedBy,at:b.approvedAt,note:b.reviewNote,artifact:b.artifact,digest:b.artifactDigest});
  const billBytes=await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text(),billApproval=approval(bill);
  assert.equal(billApproval.person,person.email);assert.ok(billApproval.at);assert.ok(billApproval.artifact);
  const key=await h.json('/keys',{label:'Matter preparation assistant'},h.owner),{auth}=await authorizeAgent(h,key,m.id);
  const payload={matterId:m.id,title:'Attributed deadline',date:'2027-02-15',timezone:'America/New_York',source:'Reviewed instructions'};
  const accepted=await h.json('/agent/prepare-deadline',payload,'',200,auth),declined=await h.json('/agent/prepare-deadline',{...payload,title:'Declined preparation'},'',200,auth);
  const walled=await h.json('/agent/prepare-deadline',{...payload,title:'Preparation awaiting current custody'},'',200,auth);
  const expected={agent:{id:'satchel-local:'+key.id,name:key.label},for:{id:person.id,name:person.name},label:`${key.label} for ${person.name}`,legacy:false};
  assert.deepEqual(accepted.preparedBy,expected);assert.deepEqual(declined.preparedBy,expected);
  console.log('PROBE BASE-AGENT-008 snapshot: local preparation route -> retained agent and sponsor IDs and names');
  const read=async target=>(await target.json('/state',undefined,target.owner)).proposals.filter(p=>[accepted.id,declined.id].includes(p.id));
  const audit=async target=>(await target.json('/audit?matterId='+m.id+'&limit=200',undefined,target.owner)).records.filter(r=>[accepted.id,declined.id].includes(r.objectId));
  const exportRows=async target=>(await(await target.request('/api/satchel/audit/export?matterId='+m.id,undefined,target.owner)).text()).trim().split('\n').map(JSON.parse).filter(r=>[accepted.id,declined.id].includes(r.objectId));
  assert.ok((await read(h)).every(p=>JSON.parse(p.prepared_identity).label===expected.label));
  await h.raw('/auth/display-name',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'Renamed principal'})},h.owner).then(r=>assert.equal(r.status,200));
  assert.equal((await h.json('/me',undefined,h.owner)).name,'Renamed principal','The native sponsor identity actually changed');
  await h.json('/proposals/'+accepted.id+'/decide',{decision:'approve'},h.owner);
  await h.json('/proposals/'+declined.id+'/decide',{decision:'decline',reason:'Person declined the prepared suggestion'},h.owner);
  await h.json('/keys/'+key.id+'/revoke',{},h.owner);await h.json('/agent/context',undefined,'',401,auth);
  await h.json('/agent/prepare-deadline',payload,'',401,auth);
  const history=await read(h);assert.equal(history.length,2);assert.ok(history.every(p=>p.decided_by===person.email));assert.ok(history.every(p=>JSON.stringify(p.preparedBy)===JSON.stringify(expected)));
  const trail=await audit(h);assert.equal(trail.length,4);
  for(const row of trail){assert.deepEqual(row.preparedBy,expected);assert.equal(row.actor.channel,row.action==='proposal.prepared'?'agent':'person');assert.equal(row.actor.id,person.id);}
  assert.deepEqual(await exportRows(h),trail);
  console.log('PROBE BASE-AGENT-008 decision: approve and decline routes after rename and key revocation -> original preparer and separate person decision in state, audit and JSONL');
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text(),billBytes);
  assert.deepEqual(approval((await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===bill.id)),billApproval);
  console.log('PROBE BASE-AGENT-008 artifacts: issued bill export after attribution and decisions -> original bytes and approval unchanged');
  // Native sponsor lifecycle changes stop authority without rewriting history.
  const sponsorEmail=['synthetic-satchel-31','example.test'].join('@');
  await h.json('/team',{email:sponsorEmail,name:'Recorded counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:sponsorEmail},h.owner);
  const sponsor=await h.login(sponsorEmail);await h.json('/matters/'+m.id+'/access',{email:sponsorEmail},h.owner);
  const sponsoredKey=await h.json('/keys',{label:'Counsel assistant'},sponsor),grant=await authorizeAgent(h,sponsoredKey,m.id,{sponsorCookie:sponsor});
  const sponsored=await h.json('/agent/prepare-deadline',{...payload,title:'Recorded counsel preparation'},'',200,grant.auth);
  await h.json('/team',{email:sponsorEmail,name:'Later counsel name',role:'lawyer',active:false},h.owner);
  await h.json('/agent/prepare-deadline',payload,'',403,grant.auth);
  const retained=(await h.json('/audit?matterId='+m.id+'&action=proposal.prepared',undefined,h.owner)).records.find(r=>r.objectId===sponsored.id);
  assert.deepEqual(retained.preparedBy,sponsored.preparedBy);assert.equal(retained.preparedBy.for.name,'Recorded counsel');
  console.log('PROBE BASE-AGENT-008 lifecycle: deactivated sponsor preparation route -> 403, retained original identity remains inspectable');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{
   await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
   assert.deepEqual(await read(target),history);assert.deepEqual(await audit(target),trail);assert.deepEqual(await exportRows(target),trail);
   assert.equal(await(await target.request('/api/satchel/bills/'+bill.id+'/export',undefined,target.owner)).text(),billBytes);
   assert.deepEqual(approval((await target.json('/matters/'+m.id+'/billing',undefined,target.owner)).bills.find(b=>b.id===bill.id)),billApproval);
   await target.json('/agent/context',undefined,'',401,auth);
   const restored=(await target.json('/audit?matterId='+m.id+'&action=proposal.prepared',undefined,target.owner)).records.find(r=>r.objectId===sponsored.id);assert.deepEqual(restored.preparedBy,sponsored.preparedBy);
   console.log('PROBE BASE-AGENT-008 recovery: native backup and restore -> identical proposal and audit identities, byte-identical bill, old key refused');
  }finally{await target.close();}
  // A new wall removes the original sponsor's proposals and matching exports.
  const custodianEmail=['synthetic-satchel-32','example.test'].join('@');
  await h.json('/team',{email:custodianEmail,name:'Current custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:custodianEmail},h.owner);const custodian=await h.login(custodianEmail);
  await h.json('/matters/'+m.id+'/wall',{custodianEmail,members:[],reason:'Current custody restricts preparation history',revision:null},h.owner);
  assert.deepEqual(await read(h),[]);await h.json('/audit?matterId='+m.id,undefined,h.owner,404);
  await h.json('/proposals/'+walled.id+'/decide',{decision:'decline',reason:'Excluded sponsor must not decide'},h.owner,404);
  assert.equal((await h.request('/api/satchel/audit/export?matterId='+m.id,undefined,h.owner)).status,404);
  const visible=(await h.json('/audit?matterId='+m.id,undefined,custodian)).records.filter(r=>r.objectId===accepted.id);assert.ok(visible.length);assert.deepEqual(visible[0].preparedBy,expected);
  const allowed=await h.request('/api/satchel/audit/export?matterId='+m.id,undefined,custodian);assert.equal(allowed.status,200);assert.ok((await allowed.text()).includes(expected.label));
  assert.equal((await h.json('/audit?matterId='+m.id+'&action=proposal.declined',undefined,custodian)).records.filter(r=>r.objectId===walled.id).length,0);
  console.log('PROBE BASE-AGENT-008 walls: excluded sponsor state, audit, export and decline -> no proposals or 404; current custodian retains permitted attribution');
 }finally{await h.close();}
}
