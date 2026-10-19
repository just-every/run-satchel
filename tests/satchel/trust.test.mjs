import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
test('TRUST-001 reviewed source openings maintain separate bank, client/matter and operating records in exact cents; archives preserve approvals',async()=>{
 const h=await harness();try{
  await h.json('/trust',undefined,h.owner,403);const f=await foundation(h);
  const opening={accountId:f.account.id,ledgerId:f.ledger.id,cents:150001,statementDate:'2026-09-30',documentId:f.source.id,note:'September statement page 2, Barton client funds'};
  await h.json('/trust/openings',{...opening,cents:1.5},h.owner,400);await h.json('/trust/openings',{...opening,documentId:f.otherSource.id},h.owner,409);
  await h.json('/trust/openings',{...opening,ledgerId:null},h.owner,400);
  const pending=await h.json('/trust/openings',opening,h.owner);let s=await h.json('/trust',undefined,h.owner);assert.equal(s.accounts.find(a=>a.id===f.account.id).balance_cents,0);
  await h.json('/trust/openings/'+pending.id+'/approve',{revision:'stale',reviewNote:'Reviewed'},h.owner,409);
  const first=await h.json('/trust/openings/'+pending.id+'/approve',{revision:pending.revision,reviewNote:'Exact statement and client allocation reviewed'},h.owner);
  assert.equal((await h.json('/trust/openings/'+pending.id+'/approve',{revision:pending.revision,reviewNote:'Replay'},h.owner)).id,first.id);
  for(const [accountId,ledgerId,documentId,cents] of [[f.account.id,f.otherLedger.id,f.otherSource.id,300003],[f.operating.id,null,f.source.id,800001]]){
   const o=await h.json('/trust/openings',{...opening,accountId,ledgerId,documentId,cents},h.owner);await h.json('/trust/openings/'+o.id+'/approve',{revision:o.revision,reviewNote:'Reviewed original statement'},h.owner);
  }
  s=await h.json('/trust',undefined,h.owner);assert.deepEqual(s.ledgers.map(l=>l.balance_cents).sort((a,b)=>a-b),[150001,300003]);assert.equal(s.accounts.find(a=>a.id===f.account.id).balance_cents,450004);assert.equal(s.accounts.find(a=>a.id===f.operating.id).balance_cents,800001);assert.equal(s.entries.length,3);assert.equal(s.openings[0].source_digest,f.source.versions[0].sha256);
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/trust',undefined,assistant,403);await h.json('/trust/openings/'+pending.id+'/approve',{revision:pending.revision,reviewNote:'No authority'},assistant,403);
  await h.json('/team',{email:'officer@example.test',name:'Trust officer',role:'trust_officer'},h.owner);await h.json('/team/invite',{email:'officer@example.test'},h.owner);const officer=await h.login('officer@example.test');await h.json('/conflicts',{client:'A',adverse:'B'},officer,403);await h.json('/trust/ledgers',{accountId:f.account.id,matterId:f.m.id},officer,404);assert.equal((await h.json('/trust',undefined,officer)).ledgers.length,0);await h.json('/trust/openings/'+pending.id+'/approve',{revision:pending.revision,reviewNote:'No matter access'},officer,404);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json('/trust',undefined,target.owner),s);}finally{await target.close();}
 }finally{await h.close();}
});
