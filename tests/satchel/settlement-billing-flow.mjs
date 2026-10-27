import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {exemptTaxReview,withTaxAllocation} from './tax-fixture.mjs';

export async function settlementBillingFlow(){
 const h=await harness();try{
  const f=await foundation(h),path='/matters/'+f.m.id,settlement=path+'/settlements';
  await h.json('/team',{email:'billing-counsel@example.test',name:'Settlement Counsel',role:'lawyer'},h.owner);
  await h.json('/team/invite',{email:'billing-counsel@example.test'},h.owner);
  const counsel=await h.login('billing-counsel@example.test');
  await h.json(path+'/access',{email:'billing-counsel@example.test'},h.owner);
  for(const [kind,code] of [['task','L110'],['activity','A101']])await h.json('/ledes/codes',{kind,code,label:'Reviewed settlement fee code'},h.owner);
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'PRINCIPAL',name:'Principal',classification:'PT'},h.owner);
  const guideline={clientLedesId:'RECOVERY',lawFirmId:'13-1234567',requireTask:true,requireActivity:true,requireExpense:false,narrativeMin:10,bannedPhrases:[],maxRates:{PT:1},incrementMinutes:60,note:'Counsel reviewed settlement fee guideline'};
  await h.json(path+'/ledes-guideline',guideline,h.owner);
  const terms=await h.json(settlement+'/terms',{previousVersion:0,reviewed:true,feeBasis:'after_expenses',reference:'Signed contingency agreement section 7',earningEvidence:'Executed release and recovered settlement',outcomes:[{name:'Settlement',bps:2500}]},counsel);
  const input={termsId:terms.id,outcome:'Settlement',grossCents:100003,reference:'Recovery source signed release',earnedConfirmed:true,earningEvidence:'Client and payer executed release; recovery confirmed',allocations:[{kind:'expense',payee:'Firm expense recovery',originalCents:1,reductionCents:0,reference:'Filing cost receipt'}],referrals:[{payee:'Referring counsel',bps:5000,reference:'Reviewed referral agreement inside counsel fee'}]};
  const first=await h.json(settlement+'/statements',{...input,previousVersion:0},counsel);
  // Fee 100002 × 25% = 25000.5 cents; referral 25001 × 50% = 12500.5.
  assert.equal(first.snapshot.feeCents,25001);
  assert.equal(first.snapshot.allocations.find(a=>a.kind==='referral').amountCents,12501);
  assert.equal(first.snapshot.allocations.find(a=>a.kind==='counsel').amountCents,12500);
  assert.equal(first.snapshot.allocations.reduce((n,a)=>n+a.amountCents,0),100003);
  const request={statementId:first.id,reviewed:true,date:'2026-09-01',trustDraw:'prohibited',utbmsTask:'L110',utbmsActivity:'A101'};
  await h.json(settlement+'/bill',request,h.owner,409);
  async function approvals(s,base=settlement){
   await h.json(base+'/approve',{statementId:s.id,capacity:'counsel',note:'Exact contingency, outcome, earning evidence and allocations reviewed'},counsel);
   await h.json(base+'/approve',{statementId:s.id,capacity:'finance',note:'Exact version and accounting allocation reviewed'},h.owner);
  }
  await approvals(first);
  assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.length,0,'Settlement approval alone prepares no invoice');
  const trustBefore=await h.json('/trust',undefined,h.owner);
  await h.json(settlement+'/bill',{...request,reviewed:false},h.owner,422);
  await h.json(settlement+'/bill',{...request,trustDraw:'unknown'},h.owner,422);
  await h.json(settlement+'/bill',{...request,utbmsTask:null,utbmsActivity:null},h.owner,422);
  await h.json('/ledes/codes',{kind:'task',code:'L110',label:'Retired settlement code',active:false},h.owner);
  await h.json(settlement+'/bill',request,h.owner,400);
  await h.json('/ledes/codes',{kind:'task',code:'L110',label:'Reviewed active settlement code',active:true},h.owner);
  const draft=await h.json(settlement+'/bill',request,h.owner);
  assert.equal(draft.status,'draft');assert.equal(draft.snapshot.totalCents,25001);
  assert.equal(draft.snapshot.lines.length,1);assert.equal(draft.snapshot.lines[0].kind,'fee');
  assert.equal(draft.snapshot.feePlan.settlementStatementId,first.id);
  assert.equal((await h.json(settlement+'/bill',request,h.owner)).id,draft.id);
  let state=await h.json(path+'/billing',undefined,h.owner);
  assert.equal(state.entries.length,0,'Settlement fees are native nonhourly sources');
  assert.equal(state.bills.length,1);assert.equal(state.bills[0].trustPayment.earned_cents,0);assert.equal(state.bills[0].earningReview,null);
  await h.json('/retention',{matterId:f.m.id,disposeAfter:'2020-01-01',basis:'Counsel reviews expired settlement evidence retention'},counsel);
  await h.json(settlement+'/dispose',{confirm:f.m.title,reason:'Financial bill source evidence remains required'},h.owner,409);
  assert.deepEqual((await h.json(settlement,undefined,h.owner)).statements.find(s=>s.id===first.id).snapshot,first.snapshot);
  assert.deepEqual(await h.json('/trust',undefined,h.owner),trustBefore);
  const second=await h.json(settlement+'/statements',{...input,previousVersion:1},counsel);
  await approvals(second);
  const review={revision:draft.revision,reviewNote:'Counsel approves exact fee source and completed recovery',earnedConfirmed:true,milestoneCompleted:true,earningEvidence:'Executed release and recovered funds independently reviewed'};
  await h.json('/bills/'+draft.id+'/approve',review,h.owner,409);
  await h.json(settlement+'/bill',request,h.owner,409);
  await h.json(settlement+'/bill',{...request,statementId:second.id},h.owner,409);
  await h.json('/bills/'+draft.id+'/void',{revision:draft.revision,reason:'Superseded statement requires a fresh reviewed source'},h.owner);
  const current=await h.json(settlement+'/bill',{...request,statementId:second.id},h.owner);
  const approval={...review,revision:current.revision};
  await h.json('/bills/'+current.id+'/approve',{revision:current.revision,reviewNote:review.reviewNote},h.owner,422);
  await h.json('/bills/'+current.id+'/approve',{...approval,milestoneCompleted:false},h.owner,422);
  await h.json('/bills/'+current.id+'/approve',{...approval,earningEvidence:''},h.owner,400);
  const approved=await h.json('/bills/'+current.id+'/approve',{...approval,taxReviewId:await exemptTaxReview(h,'/bills/'+current.id+'/approve')},h.owner);
  state=await h.json(path+'/billing',undefined,h.owner);
  const billed=state.bills.find(b=>b.id===approved.id);
  assert.equal(billed.trustPayment.earned_cents,25001);assert.equal(billed.earningReview.trust_eligible,0);
  const refused=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:approved.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'settlement-draw-prohibited'}),h.owner,422);
  assert.match(refused.error,/prohibit.*draw-down/);
  const exported=await h.request('/api/satchel/bills/'+approved.id+'/ledes',undefined,h.owner);assert.equal(exported.status,200);
  const ledes=await exported.text(),records=ledes.trim().split('\r\n'),keys=records[1].slice(0,-2).split('|'),values=records[2].slice(0,-2).split('|'),line=Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
  assert.equal(line['EXP/FEE/INV_ADJ_TYPE'],'F');assert.equal(Number(line.LINE_ITEM_NUMBER_OF_UNITS),1);assert.equal(line.LINE_ITEM_TOTAL,'250.01');assert.equal(line.LINE_ITEM_TASK_CODE,'L110');assert.equal(line.LINE_ITEM_ACTIVITY_CODE,'A101');
  const original=(await h.json(path+'/billing',undefined,h.owner)).bills.find(b=>b.id===approved.id);
  const correctionRequest={revision:original.revision,sourceId:original.snapshot.lines[0].sourceId,date:'2026-09-02',reason:'Counsel reviews an exact courtesy reduction'};
  await h.json('/bills/'+original.id+'/correct',{...correctionRequest,correctedAmountCents:25002},h.owner,422);
  const correction=await h.json('/bills/'+original.id+'/correct',{...correctionRequest,correctedAmountCents:20000},h.owner);
  await h.json('/bills/'+correction.id+'/approve',{...review,revision:correction.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+correction.id+'/approve')},h.owner);
  assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.find(b=>b.id===original.id).trustPayment.earned_cents,20000);
  await h.json(path+'/ledes-guideline',{...guideline,clientLedesId:'UPDATED',note:'Later guideline cannot rewrite a frozen export'},h.owner);
  assert.equal(await(await h.request('/api/satchel/bills/'+approved.id+'/ledes',undefined,h.owner)).text(),ledes);
  const third=await h.json(settlement+'/statements',{...input,previousVersion:2,grossCents:200003},counsel);await approvals(third);
  await h.json(settlement+'/bill',{...request,statementId:third.id},h.owner,409);
  assert.equal((await h.json(path+'/billing',undefined,h.owner)).bills.filter(b=>b.status!=='void'&&!b.correctsBillId).length,1,'Replacement statements cannot charge a second live counsel fee');
  // Explicitly permitted trust draw uses the existing earned-fee pipeline, and
  // every authorization/posting action must retain current settlement authority.
  const otherPath='/matters/'+f.other.id,otherSettlement=otherPath+'/settlements';
  await h.json(otherPath+'/access',{email:'billing-counsel@example.test'},h.owner);
  const otherTerms=await h.json(otherSettlement+'/terms',{previousVersion:0,reviewed:true,feeBasis:'after_expenses',reference:'Other reviewed contingency agreement',earningEvidence:'Release and recovery completed',outcomes:[{name:'Settlement',bps:2500}]},counsel);
  const otherStatement=await h.json(otherSettlement+'/statements',{...input,termsId:otherTerms.id,previousVersion:0},counsel);await approvals(otherStatement,otherSettlement);
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.otherLedger.id,cents:100003,statementDate:'2026-09-01',documentId:f.otherSource.id,note:'Cleared recovery supported by bank statement'},h.owner);
  await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Bank statement and exact opening reviewed'},h.owner);
  const otherDraft=await h.json(otherSettlement+'/bill',{...request,statementId:otherStatement.id,trustDraw:'permitted'},h.owner);
  const otherBill=await h.json('/bills/'+otherDraft.id+'/approve',{...review,revision:otherDraft.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+otherDraft.id+'/approve')},h.owner);
  const counselIndex=otherStatement.snapshot.allocations.findIndex(a=>a.kind==='counsel'),counselAllocation=otherStatement.snapshot.allocations[counselIndex];
  const duplicateDisbursement={accountId:f.account.id,ledgerId:f.otherLedger.id,direction:'disbursement',kind:'wire',cents:counselAllocation.amountCents,counterparty:counselAllocation.payee,bankReference:'NO-SECOND-COUNSEL-FEE',depositDate:'2026-09-02',receivedDate:'2026-09-02',documentId:f.otherSource.id,purpose:'Prevent duplicate counsel fee through another spending door',requestKey:'duplicate-counsel-fee',settlement:{statementId:otherStatement.id,allocationIndex:counselIndex}};
  const generic=await h.json('/trust/transactions',{...duplicateDisbursement,requestKey:'generic-first-counsel-fee'},h.owner);
  const duplicate=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:otherBill.id,ledgerId:f.otherLedger.id,operatingAccountId:f.operating.id,requestKey:'invoice-over-generic-counsel'}),h.owner,409);assert.match(duplicate.error,/reserved or disbursed/);
  await h.json('/trust/transactions/'+generic.id+'/decide',{revision:generic.revision,decision:'declined',reviewNote:'Use the single reviewed fee invoice transfer instead'},h.owner);
  const transfer=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:otherBill.id,ledgerId:f.otherLedger.id,operatingAccountId:f.operating.id,requestKey:'permitted-settlement-fee'}),h.owner);
  assert.equal(transfer.cents,25001);
  await h.json('/trust/transactions',duplicateDisbursement,h.owner,409);
  const decision={revision:transfer.revision,decision:'approved',reviewNote:'Exact earned contingency fee and reviewed draw eligibility'};
  const role=role=>h.json('/team',{email:'billing-counsel@example.test',name:'Settlement Counsel',role},h.owner);
  await role('assistant');await h.json('/trust/transfers/'+transfer.id+'/decide',decision,h.owner,409);await role('lawyer');
  await h.json('/trust/transfers/'+transfer.id+'/decide',decision,h.owner);
  const bank={revision:transfer.revision,bankDate:'2026-09-02',bankReference:'EXACT-SETTLEMENT-FEE',documentId:f.otherSource.id,evidence:'Bank source confirms exact earned settlement fee transfer'};
  await role('assistant');await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'submitted'},h.owner,409);await role('lawyer');
  await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'submitted'},h.owner);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  await role('assistant');await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'cleared'},h.owner,409);await role('lawyer');
  await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'cleared'},h.owner);
  await h.json('/trust/transactions',duplicateDisbursement,h.owner,409);
  const paid=(await h.json(otherPath+'/billing',undefined,h.owner)).bills.find(b=>b.id===otherBill.id);
  assert.equal(paid.trustPayment.paid_cents,25001);assert.equal(paid.trustPayment.due_cents,0);
  assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.otherLedger.id).balance_cents,75002);
  const metadata=await h.json('/audit?matterId='+f.m.id+'&limit=200',undefined,h.owner);
  for(const action of ['bill.prepared','bill.approved','fee.earning_reviewed','tax.calculation_reviewed']){
   const records=metadata.records.filter(r=>r.action===action);assert.ok(records.length>0,action+' is attributed');
   for(const record of records){assert.ok(record.actor.id&&record.at&&record.revision);assert.equal(record.detail,'');assert.equal(record.evidence.record.snapshot,undefined);assert.equal(record.evidence.record.earned_cents,undefined);}
  }
  const general=await(await h.request('/api/satchel/audit/export?matterId='+f.m.id,undefined,h.owner)).text();
  for(const restricted of [terms.terms.reference,input.earningEvidence,review.earningEvidence])assert.ok(!general.includes(restricted),'General audit contains settlement revision metadata without fee source evidence');
  const history=await h.json(path+'/billing',undefined,h.owner);
  await h.restart();assert.deepEqual(await h.json(path+'/billing',undefined,h.owner),history);
  const restored=await harness();try{
   await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
   assert.equal((await restored.request('/api/satchel'+settlement,undefined,h.owner)).status,401,'Archive restores no original native session');
   const owner=await restored.login('owner@example.test');
   assert.deepEqual(await restored.json(path+'/billing',undefined,owner),history);
   assert.equal(await(await restored.request('/api/satchel/bills/'+approved.id+'/ledes',undefined,owner)).text(),ledes);
   await restored.json(settlement+'/bill',{...request,statementId:third.id},owner,409);
   const before=await restored.json('/trust',undefined,owner);
   const refusal=await restored.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'cleared'},owner,409);
   assert.match(refusal.error,/approvals/,'Retained history supplies no current settlement execution authority');
   assert.deepEqual(await restored.json('/trust',undefined,owner),before);
  }finally{await restored.close();}
 }finally{await h.close();}
}
