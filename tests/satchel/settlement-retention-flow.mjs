import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

// Called by the existing settlement registration, keeping retention proof at
// the same public doors as the settlement history and authority flow.
export async function settlementRetentionFlow(h) {
 const m=await open(h,'Retained settlement evidence','Retention settlement client','Retention settlement payer'),p='/matters/'+m.id+'/settlements';
 const email='retention-counsel@example.test';
 await h.json('/team',{email,name:'Retention counsel',role:'lawyer'},h.owner);
 await h.json('/team/invite',{email},h.owner);
 const counsel=await h.login(email);
 await h.json('/matters/'+m.id+'/access',{email},h.owner);
 const markers=['RestrictedSettlementAgreementEvidence','RestrictedSettlementEarningCondition','RestrictedSettlementObligationEvidence','RestrictedSettlementReductionEvidence','RestrictedSettlementRecoveryEvidence','RestrictedSettlementApprovalEvidence'];
 const termsBody={previousVersion:0,reviewed:true,feeBasis:'gross',reference:markers[0],earningEvidence:markers[1],outcomes:[{name:'Recovered',bps:2500}]};
 const firstTerms=await h.json(p+'/terms',termsBody,counsel);
 const body={previousVersion:0,termsId:firstTerms.id,outcome:'Recovered',grossCents:100000,reference:markers[4],earnedConfirmed:true,earningEvidence:markers[1],allocations:[{kind:'lien',payee:'Restricted settlement payee',originalCents:20000,reductionCents:5000,reference:markers[2]+' '+markers[3]}],referrals:[]};
 const first=await h.json(p+'/statements',body,counsel);
 await h.json(p+'/approve',{statementId:first.id,capacity:'counsel',note:markers[5]},counsel);
 const secondTerms=await h.json(p+'/terms',{...termsBody,previousVersion:1},counsel);
 const second=await h.json(p+'/statements',{...body,previousVersion:1,termsId:secondTerms.id},counsel);
 await h.json(p+'/approve',{statementId:second.id,capacity:'counsel',note:markers[5]},counsel);
 const before=await h.json(p,undefined,h.owner),dispose={confirm:m.title,reason:'Principal approves disposal of expired restricted settlement evidence'};
 const source=await h.json('/matters/'+m.id+'/documents',{name:'Restricted settlement source.txt',mime:'text/plain',contentBase64:Buffer.from('Original reviewed source remains subject to its document retention controls').toString('base64'),visibility:'private'},h.owner);
 await h.json(p+'/dispose',dispose,h.owner,409);
 await h.json('/retention',{matterId:m.id,disposeAfter:'2099-12-31',basis:'Counsel requires continued settlement evidence retention'},counsel);
 await h.json(p+'/dispose',dispose,h.owner,409);
 await h.json('/retention',{matterId:m.id,disposeAfter:'2020-01-01',basis:'Counsel confirms the settlement evidence retention period expired'},counsel);
 const hold=await h.json('/holds',{matterId:m.id,reason:'Settlement allocation dispute requires preservation'},counsel);
 const refused=await h.json(p+'/dispose',dispose,h.owner,409);assert.match(refused.error,/legal hold/i);
 await h.json('/documents/'+source.id+'/erase',{confirm:source.title,reason:'Must preserve held settlement source'},h.owner,409);
 await h.json('/documents/'+source.id+'/dispose',{confirm:source.title,reason:'Must preserve held settlement source'},h.owner,409);
 await h.json(p+'/dispose',dispose,counsel,403);
 assert.deepEqual(await h.json(p,undefined,h.owner),before,'Refused disposal retains every settlement revision and approval');
 await h.json('/holds/'+hold.id+'/release',{reason:'Counsel resolved the dispute and released preservation'},counsel);
 const oldArchive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
 for(const marker of markers)assert.ok(oldArchive.includes(marker),'The pre-disposal archive retains restricted evidence');
 await h.json(p+'/dispose',{...dispose,confirm:'Wrong matter'},h.owner,400);
 const result=await h.json(p+'/dispose',dispose,h.owner);assert.equal(result.erased,true);
 const after=await h.json(p,undefined,h.owner);
 assert.deepEqual(after.terms.map(t=>[t.id,t.version,t.created_by,t.created_at]),before.terms.map(t=>[t.id,t.version,t.created_by,t.created_at]));
 assert.deepEqual(after.statements.map(s=>[s.id,s.version,s.terms_id,s.created_by,s.created_at]),before.statements.map(s=>[s.id,s.version,s.terms_id,s.created_by,s.created_at]));
 assert.ok(after.terms.every(t=>t.terms===null&&t.erased===true));
 assert.ok(after.statements.every(s=>s.snapshot===null&&s.erased===true));
 for(const statement of after.statements) {
  const original=before.statements.find(s=>s.id===statement.id);
  const identity=a=>[a.actor,a.capacity,a.at,a.authority_epoch,a.policy_version];
  assert.deepEqual(statement.approvals.map(identity),original.approvals.map(identity));
  assert.ok(statement.approvals.every(a=>a.note===''));
 }
 await h.json(p+'/dispose',dispose,h.owner,409);
 await h.json(p+'/terms',{...termsBody,previousVersion:2},counsel,409);
 await h.json(p+'/statements',{...body,previousVersion:2,termsId:secondTerms.id},counsel,409);
 await h.json(p+'/approve',{statementId:second.id,capacity:'counsel',note:'Cannot reactivate erased evidence'},counsel,409);
 const journal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
 for(const marker of markers)assert.ok(!journal.includes(marker),'Disposed terms, obligations, reductions and approval notes leave new archives');
 await h.restart();assert.deepEqual(await h.json(p,undefined,h.owner),after);
 const restored=await harness();try {
  const refusal=await restored.json('/restore',{archive:oldArchive,journal,confirm:'RESTORE'},restored.owner,409);assert.match(refusal.error,/erasure/i);
  await restored.json('/restore',{archive:journal,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json(p,undefined,restored.owner),after,'Erased identities and approval attribution survive native restore');
  await restored.json(p+'/approve',{statementId:second.id,capacity:'counsel',note:'Restore supplies no execution authority'},restored.owner,409);
 } finally {await restored.close();}
}
