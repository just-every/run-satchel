import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {foundation,earnedBill} from './trust-fixture.mjs';
import {withTaxAllocation} from './tax-fixture.mjs';
import {createPeriod,sign} from './trust-period-fixture.mjs';

export async function settlementExecutionFlow(){
 const h=await harness();try{
  const f=await foundation(h),m='/matters/'+f.m.id,p=m+'/settlements';
  const team=async(email,role)=>h.json('/team',{email,name:email.split('@')[0],role},h.owner);
  for(const [email,role] of [['execution-counsel@example.test','lawyer'],['execution-officer@example.test','trust_officer']]){
   await team(email,role);await h.json('/team/invite',{email},h.owner);await h.json(m+'/access',{email},h.owner);
  }
  await h.json('/matters/'+f.other.id+'/access',{email:'execution-officer@example.test'},h.owner);
  const counsel=await h.login('execution-counsel@example.test'),officer=await h.login('execution-officer@example.test');
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:105,statementDate:'2026-09-01',documentId:f.source.id,note:'Cleared bank recovery'},h.owner);
  await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Exact bank recovery reconciled'},h.owner);
  const external=await h.json('/trust/transactions',{accountId:f.account.id,ledgerId:f.ledger.id,direction:'disbursement',kind:'wire',cents:1,counterparty:'Separate prior obligation',bankReference:'synthetic-satchel-external',receivedDate:'2026-09-02',depositDate:'2026-09-02',documentId:f.source.id,purpose:'Another reviewed pending reservation',requestKey:'synthetic-satchel-external'},h.owner);
  const terms=await h.json(p+'/terms',{previousVersion:0,reviewed:true,feeBasis:'after_expenses',reference:'Restricted execution agreement',earningEvidence:'Restricted executed recovery condition',outcomes:[{name:'Recovery',bps:5000}]},counsel);
  const input={previousVersion:0,termsId:terms.id,outcome:'Recovery',grossCents:105,reference:'Restricted gross recovery source',earnedConfirmed:true,earningEvidence:'Restricted recovery completed',allocations:[{kind:'expense',payee:'Expense recovery',originalCents:4,reductionCents:0,reference:'Restricted expense original'},{kind:'lien',payee:'Reduced lien holder',originalCents:5,reductionCents:4,reference:'Restricted lien reduction'}],referrals:[{payee:'Referral counsel',bps:5000,reference:'Restricted referral agreement'}]};
  const s=await h.json(p+'/statements',input,counsel);
  assert.equal(s.snapshot.feeBaseCents,101);assert.equal(s.snapshot.feeCents,51);
  assert.deepEqual(s.snapshot.allocations.map(a=>[a.kind,a.amountCents]),[['expense',4],['lien',1],['referral',26],['counsel',25],['client',49]]);
  const spend={accountId:f.account.id,ledgerId:f.ledger.id,direction:'disbursement',kind:'wire',cents:1,counterparty:'Reduced lien holder',bankReference:'synthetic-satchel-941',receivedDate:'2026-09-02',depositDate:'2026-09-02',documentId:f.source.id,purpose:'Restricted exact settlement payment',requestKey:'synthetic-satchel-execution',settlement:{statementId:s.id,allocationIndex:1}};
  await h.json('/trust/transactions',spend,officer,409);
  await h.json(p+'/approve',{statementId:s.id,capacity:'counsel',note:'Restricted counsel exact revision note'},counsel);
  await h.json('/trust/transactions',spend,officer,409);
  await h.json(p+'/approve',{statementId:s.id,capacity:'finance',note:'Restricted officer exact revision note'},officer);
  await h.json('/trust/transactions',spend,officer,409);
  // Another reservation consumes cleared availability even when total custody is enough.
  await h.json('/trust/transactions/'+external.id+'/decide',{revision:external.revision,decision:'declined',reviewNote:'Release the unrelated prior reservation'},h.owner);
  await h.json('/trust/transactions',{...spend,settlement:undefined},officer,409);
  await h.json('/trust/transactions',{...spend,cents:2},officer,409);
  await h.json('/trust/transactions',{...spend,counterparty:'Different payee'},officer,409);
  await h.json('/trust/transactions',{...spend,ledgerId:f.otherLedger.id,documentId:f.otherSource.id},officer,409);
  const txn=await h.json('/trust/transactions',spend,officer);
  const decide={revision:txn.revision,decision:'approved',reviewNote:'Restricted final disbursement evidence'};
  const unrelatedBill=await earnedBill(h,f.m,1,'Unrelated earned operating fee');
  const reservation=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:unrelatedBill.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'synthetic-satchel-changed-funds'}),h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  await h.json('/trust/transfers/'+reservation.id+'/decide',{revision:reservation.revision,decision:'declined',reviewNote:'Release the unrelated reservation before settlement posting'},h.owner);
  const check={statementId:s.id,ledgerId:f.ledger.id};
  const expectRefused=async()=>{
   await h.json(p+'/check-funds',check,h.owner,409);
   await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  };
  await team('execution-counsel@example.test','assistant');await expectRefused();await team('execution-counsel@example.test','lawyer');
  await team('execution-officer@example.test','lawyer');await expectRefused();await team('execution-officer@example.test','trust_officer');
  await h.json(m+'/access',{email:'execution-counsel@example.test',remove:true},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,404);await h.json(m+'/access',{email:'execution-counsel@example.test'},h.owner);
  const wall=await h.json(m+'/wall',{custodianEmail:'execution-counsel@example.test',members:['owner@example.test'],reason:'Review excludes the existing finance approver',revision:null},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,404);
  const custody=await h.json(m+'/wall',{custodianEmail:'execution-counsel@example.test',members:['owner@example.test','execution-officer@example.test'],reason:'Finance approval matter access restored after wall review',revision:wall.revision},counsel);
  // A custom ceiling removed after approval also fences the final action.
  const permissions={rates:'all',bank:'full',reports:'firm',contacts:'write',documents:'write',billing:'read',settings:'read'};
  const role=await h.json('/roles',{name:'Read only settlement finance',permissions,reason:'No settlement approval write permission'},h.owner);
  await h.json('/team',{email:'execution-officer@example.test',name:'Execution officer',role:'trust_officer',customRoleId:role.id},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,403);
  await h.json('/team',{email:'execution-officer@example.test',name:'Execution officer',role:'trust_officer',customRoleId:null},h.owner);
  // Policy changes invalidate both signatures, and only a principal records a waiver.
  await h.json('/settlement-policy',{previousVersion:0,solePractitionerEnabled:true,reason:'Sole practitioner authority recorded',scope:'All firm settlement approvals'},counsel,403);
  const policy=await h.json('/settlement-policy',{previousVersion:0,solePractitionerEnabled:true,reason:'Principal alone holds legal and trust roles',scope:'All firm settlement approvals'},h.owner);
  assert.deepEqual([policy.version,policy.solePractitionerEnabled,policy.actor],[1,true,'owner@example.test']);assert.ok(policy.effectiveAt&&policy.reason&&policy.scope);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  await h.json(p+'/approve',{statementId:s.id,capacity:'counsel',note:'Restricted sole practitioner counsel review'},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  await h.json(p+'/approve',{statementId:s.id,capacity:'finance',note:'Restricted sole practitioner finance review'},h.owner);
  await h.json('/settlement-policy',{previousVersion:1,solePractitionerEnabled:false,reason:'The principal withdraws the separation waiver',scope:'All firm settlement approvals'},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  await h.json('/settlement-policy',{previousVersion:2,solePractitionerEnabled:true,reason:'Principal freshly records sole-practitioner authority',scope:'All firm settlement approvals'},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  for(const capacity of ['counsel','finance'])await h.json(p+'/approve',{statementId:s.id,capacity,note:'Restricted fresh sole practitioner '+capacity+' review'},h.owner);
  // A second allocation reservation is excluded from informational readiness.
  const client=await h.json('/trust/transactions',{...spend,requestKey:'synthetic-satchel-client',cents:49,counterparty:f.m.client,settlement:{statementId:s.id,allocationIndex:4}},h.owner);
  await h.json(p+'/check-funds',check,h.owner,409);
  await h.json('/trust/transactions/'+client.id+'/decide',{revision:client.revision,decision:'declined',reviewNote:'Release client allocation pending client instructions'},h.owner);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  const stateBefore=await h.json('/trust',undefined,h.owner);
  const restored=await harness();try{
   await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
   assert.equal((await restored.request('/api/satchel'+p,undefined,h.owner)).status,401);
   const reader=await restored.login('owner@example.test');
   assert.equal((await restored.json('/settlement-policy',undefined,reader)).solePractitionerEnabled,false);
   await restored.json('/trust/transactions/'+txn.id+'/decide',decide,reader,409);
   assert.deepEqual(await restored.json('/trust',undefined,reader),stateBefore);
  }finally{await restored.close();}
  const period=await createPeriod(h,f,'2026-09-01','2026-09-30',105),packet=await sign(h,period);assert.equal(packet.balanced,true);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner,409);
  await h.json('/trust/periods/'+period.id+'/reopen',{reason:'Principal reopens the signed period for the exact reviewed settlement posting',documentId:f.source.id,packetId:packet.id},h.owner);
  await h.json('/trust/transactions/'+txn.id+'/decide',decide,h.owner);
  assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).balance_cents,104);
  await h.json('/trust/transactions',{...spend,requestKey:'synthetic-satchel-duplicate'},h.owner,409);
  await h.json(p+'/statements',{...input,previousVersion:1},counsel,409);
  const audit=await h.json('/audit?matterId='+f.m.id+'&action=settlement.approved',undefined,h.owner);
  assert.equal(audit.records.length,6);
  assert.deepEqual(audit.records.map(r=>[r.actor.email,r.actor.role,r.evidence.context.capacity,r.evidence.context.policyVersion]).sort(),[['execution-counsel@example.test','lawyer','counsel',0],['execution-officer@example.test','trust_officer','finance',0],['owner@example.test','owner','counsel',1],['owner@example.test','owner','finance',1],['owner@example.test','owner','counsel',3],['owner@example.test','owner','finance',3]].sort());
  for(const r of audit.records){assert.equal(r.matterId,f.m.id);assert.equal(r.revision,'1');assert.equal(r.actor.channel,'person');assert.ok(r.actor.id&&r.at);assert.equal(r.evidence.context.version,1);}
  const transactionAudit=await h.json('/audit?matterId='+f.m.id+'&action=trust.transaction_approved',undefined,h.owner);
  const finalAudit=transactionAudit.records.find(r=>r.objectId===txn.id);assert.ok(finalAudit);assert.equal(finalAudit.detail,'');assert.equal(finalAudit.evidence.record.statementId,s.id);assert.equal(finalAudit.evidence.record.allocationIndex,1);assert.equal(finalAudit.evidence.record.cents,undefined);
  const general=await(await h.request('/api/satchel/audit/export?matterId='+f.m.id,undefined,h.owner)).text();
  assert.ok(!general.includes('Restricted '),'General audit retains metadata without restricted settlement financial payload or source text');
  const restoredHistory=await h.json(p,undefined,h.owner);await h.restart();assert.deepEqual(await h.json(p,undefined,h.owner),restoredHistory);
 }finally{await h.close();}
}
