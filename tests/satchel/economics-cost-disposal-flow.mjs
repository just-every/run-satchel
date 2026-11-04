import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

export async function proveCostDerivativeDisposal(){
 const h=await harness({clock:'2030-10-01T16:00:00.000Z'});let restored;
 try{
  const email=(await h.json('/me',undefined,h.owner)).email,m=await open(h,'Synthetic cost derivative custody');
  const older=await h.json('/reports/staff-costs',{email,effectiveFrom:'2029-01-01',hourlyCents:1000,reason:'Synthetic older approved cost',confirmed:true},h.owner),cost=await h.json('/reports/staff-costs',{email,effectiveFrom:'2030-01-01',hourlyCents:6000,reason:'Synthetic reviewed cost with work derivatives',confirmed:true},h.owner);
  const prepare=async n=>h.json('/time/bulk',{requestId:'synthetic-satchel-cost-'+n,sourceSystem:'Synthetic reviewed work',rows:[{matterId:m.id,timekeeperEmail:email,sourceId:'synthetic-satchel-source-'+n,kind:'time',date:'2030-10-01',description:'Synthetic reviewed billable work '+n,minutes:60,rateCents:10000,billable:true}]},h.owner);
  const post=(b,key)=>h.json('/time/bulk/'+b.id+'/post',{revision:b.revision,reviewDigest:b.reviewDigest,requestId:key},h.owner);
  const initial=await prepare(1),draft=await prepare(2);assert.equal(initial.rows[0].value.costBasis.costCents,6000);assert.equal(draft.rows[0].value.costBasis.approvalId,cost.id);
  const posted=await post(initial,'synthetic-satchel-post');assert.ok(posted.rows[0].entryId);const source=await h.json('/matters/'+m.id+'/billing',undefined,h.owner);
  const before=(await h.json('/time/bulk',undefined,h.owner)).batches;
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  await h.json('/retention',{matterId:m.id,disposeAfter:'2030-09-30',basis:'Synthetic expired work custody'},h.owner);
  const hold=await h.json('/holds',{matterId:m.id,reason:'Synthetic hold protects recorded costing'},h.owner),dispose={confirm:cost.id,reason:'Synthetic approved expired cost disposal'};
  await h.json('/reports/staff-costs/'+cost.id+'/dispose',dispose,h.owner,409);assert.deepEqual((await h.json('/time/bulk',undefined,h.owner)).batches,before);
  await h.json('/holds/'+hold.id+'/release',{reason:'Counsel released the exact work custody hold'},h.owner);
  const result=await h.json('/reports/staff-costs/'+cost.id+'/dispose',dispose,h.owner);assert.equal(result.journal.costVersions,1);assert.equal(result.journal.bulkWorkReviews,2);assert.equal(result.journal.reportArtifacts,0);
  const after=(await h.json('/time/bulk',undefined,h.owner)).batches;
  for(const b of after){const previous=before.find(v=>v.id===b.id);assert.equal(b.rows[0].value.costBasis,null);assert.deepEqual(b.rows[0].original,previous.rows[0].original);assert.deepEqual(b.rows[0].input,previous.rows[0].input);assert.equal(b.rows[0].entryId,previous.rows[0].entryId);assert.equal(b.reviewDigest,previous.reviewDigest);}
  assert.deepEqual(await h.json('/matters/'+m.id+'/billing',undefined,h.owner),source,'Cost disposal changes no posted work or invoice money');
  assert.deepEqual(await post(posted,'synthetic-satchel-post'),after.find(b=>b.id===posted.id));
  await h.json('/time/bulk/'+draft.id+'/post',{revision:draft.revision,reviewDigest:draft.reviewDigest,requestId:'synthetic-satchel-stale-cost'},h.owner,409);
  const refreshed=await h.json('/time/bulk/'+draft.id+'/rows',{revision:draft.revision,rowId:draft.rows[0].id,row:draft.rows[0].input},h.owner);assert.equal(refreshed.rows[0].value.costBasis,null,'Review cannot fall back to an older approved cost');assert.notEqual(refreshed.reviewDigest,draft.reviewDigest);
  const retainedCosts=await h.json('/reports/staff-costs',undefined,h.owner);assert.ok(retainedCosts.approved.some(c=>c.id===older.id));assert.ok(!JSON.stringify(retainedCosts).includes(cost.reason));
  const journal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!journal.includes(cost.reason));
  await h.restart();assert.equal((await h.json('/time/bulk',undefined,h.owner)).batches.find(b=>b.id===posted.id).rows[0].value.costBasis,null);
  restored=await harness({clock:'2030-10-01T16:00:00.000Z'});await restored.json('/restore',{archive,journal,confirm:'RESTORE'},restored.owner,409);await restored.json('/restore',{archive:journal,confirm:'RESTORE'},restored.owner);
  assert.equal((await restored.json('/time/bulk',undefined,restored.owner)).batches.find(b=>b.id===posted.id).rows[0].value.costBasis,null);assert.deepEqual(await restored.json('/matters/'+m.id+'/billing',undefined,restored.owner),source);
 }finally{await restored?.close();await h.close();}
}
