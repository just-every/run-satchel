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
test('TRUST-002 records source-backed retainer, check, wire, disbursement and unidentified suspense; only bank evidence clears funds and replay posts once',async()=>{
 const h=await harness();try{
  const f=await foundation(h),base={accountId:f.account.id,ledgerId:f.ledger.id,direction:'receipt',kind:'retainer',cents:150000,counterparty:'Barton Workshop LLC',bankReference:'DEP-20261001-17',receivedDate:'2026-10-01',depositDate:'2026-10-01',documentId:f.source.id,purpose:'Client retainer deposit',requestKey:'barton-retainer'};
  const post=async b=>{const t=await h.json('/trust/transactions',b,h.owner);await h.json('/trust/transactions/'+t.id+'/decide',{revision:t.revision,decision:'approved',reviewNote:'Exact bank record and client authorization reviewed'},h.owner);return t;};
  const pending=await post(base);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).available_cents,0);
  await h.json('/trust/transactions',{...base,direction:'disbursement',kind:'wire',cents:1,requestKey:'uncleared-attempt'},h.owner,409);
  let transactions=await h.json('/trust/transactions',undefined,h.owner),entry=transactions.find(t=>t.id===pending.id).entry_id;
  await h.json('/trust/entries/'+entry+'/clear',{clearedDate:'2026-09-30',bankReference:'BANK-17',documentId:f.source.id},h.owner,400);
  const clearance=await h.json('/trust/entries/'+entry+'/clear',{clearedDate:'2026-10-02',bankReference:'BANK-17',documentId:f.source.id},h.owner);
  assert.equal((await h.json('/trust/entries/'+entry+'/clear',{clearedDate:'2026-10-02',bankReference:'BANK-17',documentId:f.source.id},h.owner)).id,clearance.id);
  await post({...base,ledgerId:f.otherLedger.id,documentId:f.otherSource.id,kind:'check',cents:90000,counterparty:'Pine Studio',bankReference:'CHECK-991',clearedDate:'2026-10-02',requestKey:'pine-check'});
  await post({...base,ledgerId:null,kind:'wire',cents:40000,counterparty:'Unknown remitter',bankReference:'WIRE-UNMATCHED-82',clearedDate:'2026-10-02',requestKey:'suspense-wire'});
  const debit=await post({...base,direction:'disbursement',kind:'wire',cents:25000,counterparty:'County recorder',bankReference:'WIRE-883',receivedDate:'2026-10-03',depositDate:'2026-10-03',documentId:f.source.id,purpose:'Client authorized recording charge, authorization page 2',requestKey:'recording-disbursement'});
  assert.equal((await h.json('/trust/transactions',{...base,direction:'disbursement',kind:'wire',cents:25000,counterparty:'County recorder',bankReference:'WIRE-883',receivedDate:'2026-10-03',depositDate:'2026-10-03',documentId:f.source.id,purpose:'Client authorized recording charge, authorization page 2',requestKey:'recording-disbursement'},h.owner)).id,debit.id);
  await h.json('/trust/transactions/'+debit.id+'/decide',{revision:debit.revision,decision:'approved',reviewNote:'Replay'},h.owner);
  await h.restart();const s=await h.json('/trust',undefined,h.owner);assert.equal(s.accounts.find(a=>a.id===f.account.id).balance_cents,255000);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).balance_cents,125000);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).available_cents,125000);assert.equal(s.ledgers.find(l=>l.id===f.otherLedger.id).available_cents,90000);assert.equal(s.entries.filter(e=>e.ledger_id===null).length,1);assert.equal(s.entries.length,4);assert.equal(s.clearings.length,1);assert.equal((await h.json('/trust/transactions',undefined,h.owner)).find(t=>t.id===pending.id).reconciled_cleared_date,'2026-10-02');
  const audit=(await h.json('/audit?action=trust.transaction_refused',undefined,h.owner)).records;assert.ok(audit.some(a=>a.action==='trust.transaction_refused'));
 }finally{await h.close();}
});
test('TRUST-003 refuses cross-client borrowing, uncleared/negative funds, concurrent overcommitment, bank fees and unsupported backdating without hiding attempts',async()=>{
 const h=await harness();try{
  const f=await foundation(h);for(const [ledgerId,documentId,cents] of [[f.ledger.id,f.source.id,150000],[f.otherLedger.id,f.otherSource.id,500000]]){const o=await h.json('/trust/openings',{accountId:f.account.id,ledgerId,documentId,cents,statementDate:'2026-10-01',note:'Reviewed October opening statement'},h.owner);await h.json('/trust/openings/'+o.id+'/approve',{revision:o.revision,reviewNote:'Reviewed client allocation against original'},h.owner);}
  const b={accountId:f.account.id,ledgerId:f.ledger.id,direction:'disbursement',kind:'wire',cents:120000,counterparty:'County recorder',bankReference:'CLIENT-AUTH-77',receivedDate:'2026-10-02',depositDate:'2026-10-02',documentId:f.source.id,purpose:'Authorized client disbursement',requestKey:'reserve-1200'};
  await h.json('/trust/transactions',{...b,cents:-1,requestKey:'negative'},h.owner,400);await h.json('/trust/transactions',{...b,kind:'bank_fee',cents:500,requestKey:'principal-fee'},h.owner,400);
  await h.json('/trust/transactions',{...b,ledgerId:f.otherLedger.id,requestKey:'wrong-client-document'},h.owner,409);
  await h.json('/trust/transactions',{...b,receivedDate:'2026-09-30',depositDate:'2026-09-30',requestKey:'unsupported-backdate'},h.owner,409);
  const receipt=await h.json('/trust/transactions',{...b,direction:'receipt',kind:'check',cents:100000,requestKey:'uncleared-check'},h.owner);await h.json('/trust/transactions/'+receipt.id+'/decide',{revision:receipt.revision,decision:'approved',reviewNote:'Received, bank has not cleared it'},h.owner);
  const first=await h.json('/trust/transactions',b,h.owner);let s=await h.json('/trust',undefined,h.owner);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).available_cents,30000);
  const refusal=await h.json('/trust/transactions',{...b,cents:40000,requestKey:'cannot-borrow-other-client'},h.owner,409);assert.match(refusal.error,/changed|allowed/);
  const responses=await Promise.all(['a','b'].map(k=>h.request('/api/satchel/trust/transactions',{...b,cents:25000,requestKey:'concurrent-'+k},h.owner)));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const winner=await responses.find(r=>r.status===200).json();
  s=await h.json('/trust',undefined,h.owner);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).available_cents,5000);assert.equal(s.ledgers.find(l=>l.id===f.otherLedger.id).available_cents,500000);
  await h.json('/trust/transactions/'+first.id+'/decide',{revision:first.revision,decision:'declined',reviewNote:'Client withdrew the authorization; release reservation'},h.owner);
  await h.json('/trust/transactions/'+winner.id+'/decide',{revision:winner.revision,decision:'approved',reviewNote:'Client approved exact payment and available funds reviewed'},h.owner);
  const edit=await h.request('/api/satchel/trust/transactions/'+winner.id,{cents:0},h.owner);assert.equal(edit.status,404);
  await h.restart();s=await h.json('/trust',undefined,h.owner);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).balance_cents,225000);assert.equal(s.ledgers.find(l=>l.id===f.ledger.id).available_cents,125000);assert.ok(s.accounts.find(a=>a.id===f.account.id).balance_cents>40000);
  const trail=(await h.json('/audit?action=trust.transaction_refused',undefined,h.owner)).records.filter(a=>a.action==='trust.transaction_refused');assert.ok(trail.length>=3);assert.ok(trail.some(a=>a.detail.cents===40000));assert.equal((await h.json('/trust/transactions',undefined,h.owner)).find(t=>t.id===winner.id).cents,25000);
 }finally{await h.close();}
});
