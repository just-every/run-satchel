import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';
import {invoiceTemplate} from './invoice-delivery-fixture.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';

export async function provePrebillRun(){
 const h=await harness();let restored;
 try{
  const f=await foundation(h),third=await open(h,'Third run matter','Third client','Third opponent'),matters=[f.m,f.other,third];
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:20000,statementDate:'2026-10-01',documentId:f.source.id,note:'Cleared same-client opening'},h.owner);
  await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Original bank statement and exact opening reviewed'},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);
  const template=await h.json('/invoice-templates',invoiceTemplate(null,{includeTrustBalance:false}),h.owner);
  for(const m of matters)await h.json('/matters/'+m.id+'/invoice-template',{templateId:template.id,previousId:null,reason:'Counsel assigns exact approved billing template'},h.owner);
  const cookies={};for(const [role,email] of [['billing','run-billing@example.test'],['lawyer','run-counsel@example.test'],['trust_officer','run-officer@example.test']]){
   await h.json('/team',{email,name:role,role},h.owner);await h.json('/team/invite',{email},h.owner);cookies[role]=await h.login(email);
   for(const m of matters)await h.json('/matters/'+m.id+'/access',{email},h.owner);
  }
  const entries=[];
  for(const m of matters)entries.push(await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-02',description:'Original advice narrative',minutes:60,rateCents:10000},h.owner));
  const excluded=await h.json('/matters/'+f.m.id+'/entries',{kind:'disbursement',date:'2026-10-02',description:'Counsel excludes this cost',amountCents:500},h.owner);
  const retained=await h.json('/matters/'+f.m.id+'/entries',{kind:'disbursement',date:'2026-10-02',description:'Retained cost',amountCents:500},h.owner);
  const items=matters.map((m,i)=>({matterId:m.id,payer:m.client,periodStart:'2026-10-01',periodEnd:'2026-10-31',arrangement:'hourly',entryIds:[entries[i].id,...(i===0?[excluded.id,retained.id]:[])]}));
  const payload={title:'October three-matter review',date:'2026-10-03',items};
  await h.json('/prebill-runs',{...payload,items:[items[0],{...items[1],periodEnd:'2026-10-01'}]},cookies.billing,422);
  assert.ok((await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).entries.every(e=>e.reservedBy===null),'Failed preparation reserves no source');
  let run=await h.json('/prebill-runs',payload,cookies.billing);assert.equal(run.bills.length,3);assert.equal((await h.json('/prebill-runs',undefined,cookies.billing)).runs.length,1);
  await h.json('/prebill-runs',payload,cookies.billing,409);
  const initial=run.bills[0],returned=await h.json('/bills/'+run.bills[2].id+'/review',{revision:run.bills[2].revision,action:'return',note:'Responsible lawyer requests additional narrative detail'},cookies.lawyer);
  await h.json('/bills/'+returned.id+'/approve',{revision:returned.revision,reviewNote:'Cannot approve returned draft'},cookies.lawyer,409);
  const edit={revision:initial.revision,action:'revise',note:'Counsel reviews exact narratives, exclusion and courtesy write-down',lines:[{sourceId:entries[0].id,description:'Reviewed advice narrative',amountCents:9000},{sourceId:excluded.id,exclude:true}]};
  await h.json('/bills/'+initial.id+'/review',edit,cookies.billing,403);
  const revised=await h.json('/bills/'+initial.id+'/review',edit,cookies.lawyer);await h.json('/bills/'+initial.id+'/review',edit,cookies.lawyer,409);
  assert.equal(revised.snapshot.totalCents,9500);
  const state=await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner);
  assert.equal(state.entries.find(e=>e.id===entries[0].id).description,'Original advice narrative');assert.equal(state.entries.find(e=>e.id===entries[0].id).amountCents,10000);
  assert.equal(state.entries.find(e=>e.id===excluded.id).reservedBy,null);assert.equal(state.entries.find(e=>e.id===entries[0].id).reservedBy,initial.id);
  assert.equal((await h.json('/matters/'+third.id+'/billing',undefined,h.owner)).entries[0].reservedBy,returned.id);
  const approved=[];for(const bill of [revised,run.bills[1]])approved.push(await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,reviewNote:'Counsel approves this exact reviewed revision',taxReviewId:await exemptTaxReview(h,'/bills/'+bill.id+'/approve')},cookies.lawyer));
  const issue={bills:approved.map(b=>({id:b.id,revision:b.revision}))};
  await h.json('/invoices/issue',{bills:[...issue.bills,{id:returned.id,revision:returned.revision}]},cookies.billing,409);
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,100);
  const options=await h.json('/bills/'+approved[0].id+'/trust-options',undefined,cookies.billing);assert.deepEqual(options.ledgers.map(l=>({id:l.id,availableCents:l.availableCents})),[{id:f.ledger.id,availableCents:20000}]);assert.equal(options.components.earnedCents,9500);
  await h.json('/trust',undefined,cookies.billing,403);await h.json('/trust/transfers',undefined,cookies.billing,403);
  const transferBody={billId:approved[0].id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:approved[0].id,allocation:{earnedCents:9500,taxCents:0,reference:'Billing requests exact approved earned fees and explicit zero tax'}};
  await h.json('/trust/transfers',{...transferBody,ledgerId:f.otherLedger.id,requestKey:'wrong-matter'},cookies.billing,409);
  const permissions={rates:'all',bank:'none',reports:'none',contacts:'read',documents:'read',billing:'write',settings:'none'};
  let ceiling=await h.json('/roles',{name:'Prebill finance ceiling',permissions,reason:'Explicit bank visibility for native billing request'},h.owner);
  await h.json('/team',{email:'run-billing@example.test',name:'billing',role:'billing',customRoleId:ceiling.id},h.owner);
  await h.json('/bills/'+approved[0].id+'/trust-options',undefined,cookies.billing,403);
  await h.json('/trust/transfers',transferBody,cookies.billing,403);
  ceiling=await h.json('/roles',{id:ceiling.id,revision:ceiling.revision,name:ceiling.name,permissions:{...permissions,bank:'balances'},reason:'Allow cleared balances and request preparation, no officer decisions'},h.owner);
  assert.equal((await h.json('/bills/'+approved[0].id+'/trust-options',undefined,cookies.billing)).ledgers[0].availableCents,20000);
  const transfer=await h.json('/trust/transfers',transferBody,cookies.billing);assert.equal((await h.json('/trust/transfers',transferBody,cookies.billing)).id,transfer.id);
  await h.json('/matters/'+f.m.id+'/access',{email:'run-billing@example.test',remove:true},h.owner);
  await h.json('/bills/'+approved[0].id+'/trust-options',undefined,cookies.billing,404);await h.json('/trust/transfers',transferBody,cookies.billing,404);
  await h.json('/matters/'+f.m.id+'/access',{email:'run-billing@example.test'},h.owner);
  const decision={revision:transfer.revision,decision:'approved',reviewNote:'Designated officer approves earned invoice and cleared client funds'};
  await h.json('/trust/transfers/'+transfer.id+'/decide',decision,cookies.billing,403);
  await h.json('/invoices/issue',issue,cookies.billing,409);
  await h.json('/trust/transfers/'+transfer.id+'/decide',decision,cookies.trust_officer);
  await h.json('/invoices/issue',issue,cookies.billing,409);
  const bank={revision:transfer.revision,bankDate:'2026-10-03',bankReference:'RUN-TRUST-9500',documentId:f.source.id,evidence:'Officer reconciled exact bank confirmation to original statement'};
  await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'submitted'},cookies.trust_officer);
  await h.json('/invoices/issue',issue,cookies.billing,409);
  await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'cleared'},cookies.trust_officer);
  await h.json('/invoices/issue',issue,cookies.billing,403);
  ceiling=await h.json('/roles',{id:ceiling.id,revision:ceiling.revision,name:ceiling.name,permissions:{...permissions,bank:'full'},reason:'Explicit authority to issue the PDF disclosing the cleared trust payment'},h.owner);
  const issued=await h.json('/invoices/issue',issue,cookies.billing);assert.equal(issued.issues.length,2);assert.equal(new Set(issued.issues.map(i=>i.number)).size,2);
  assert.ok(issued.issues.every(i=>i.template_id===template.id&&i.template_version===template.version));assert.equal(issued.issues[0].payment_snapshot.trust_paid_cents,9500);assert.equal(issued.issues[0].payment_snapshot.status,'paid');assert.equal(issued.issues[0].payment_snapshot.due_cents,0);
  ceiling=await h.json('/roles',{id:ceiling.id,revision:ceiling.revision,name:ceiling.name,permissions:{...permissions,bank:'balances'},reason:'Withhold full trust disclosure after issue'},h.owner);
  assert.equal((await h.request('/api/satchel/bills/'+approved[0].id+'/invoice.pdf',undefined,cookies.billing)).status,403);
  assert.equal((await h.json('/invoices/issue',issue,cookies.billing)).issues[0].payment_snapshot,null);
  ceiling=await h.json('/roles',{id:ceiling.id,revision:ceiling.revision,name:ceiling.name,permissions:{...permissions,bank:'full'},reason:'Restore explicit authority for the retained trust-bearing PDF'},h.owner);
  const pdf=Buffer.from(await(await h.request('/api/satchel/bills/'+approved[0].id+'/invoice.pdf',undefined,cookies.billing)).arrayBuffer());
  const nextTemplate=await h.json('/invoice-templates',invoiceTemplate(template.id,{includeTrustBalance:false,terms:'Prospective revised terms only'}),h.owner);
  const assignment=(await h.json('/matters/'+f.m.id+'/invoice-template',undefined,h.owner)).assignment;
  await h.json('/matters/'+f.m.id+'/invoice-template',{templateId:nextTemplate.id,previousId:assignment.id,reason:'Prospective template update'},h.owner);
  assert.deepEqual(await h.json('/invoices/issue',issue,cookies.billing),issued);assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+approved[0].id+'/invoice.pdf',undefined,cookies.billing)).arrayBuffer()),pdf);
  await h.json('/bills/'+approved[0].id+'/review',{revision:approved[0].revision,action:'revise',note:'Cannot edit an issued invoice',lines:[]},cookies.lawyer,409);
  run=await h.json('/prebill-runs/'+run.id,undefined,cookies.billing);assert.equal(run.bills[0].reviews.length,1);assert.equal(run.bills[2].prebill.reviewState,'returned');assert.equal(run.bills[0].issue.template_id,template.id);
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,102);
  await proveFeePlanPrebillReviews(h,template,cookies.lawyer,cookies.billing);
  await h.restart();restored=await harness();await restored.json('/restore',{archive:await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json('/prebill-runs/'+run.id,undefined,restored.owner),await h.json('/prebill-runs/'+run.id,undefined,h.owner));
  assert.deepEqual(await restored.json('/invoices/issue',issue,restored.owner),issued);
 }finally{await restored?.close();await h.close();}
}

async function proveFeePlanPrebillReviews(h,template,counsel,billing){
 await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'FEE-OWNER',name:'Reviewing principal',classification:'PT'},h.owner);
 for(const kind of ['capped','blended']){
  const m=await open(h,kind+' prebill adjustment',kind+' prebill client',kind+' opposing party'),base='/matters/'+m.id;
  for(const email of ['run-counsel@example.test','run-billing@example.test'])await h.json(base+'/access',{email},h.owner);
  await h.json(base+'/invoice-template',{templateId:template.id,previousId:null,reason:'Exact template for reviewed fee adjustment'},h.owner);
  const plan=await h.json(base+'/fee-plans',{kind,title:kind+' reviewed agreement',recurrence:'once',startDate:'2026-10-01',endDate:'2026-10-31',earning:'on_approval',trustDraw:'permitted',amountCents:kind==='capped'?45000:20001,includedWork:'Recorded advice under the reviewed agreement',exceptions:'none',reference:'Synthetic signed fee agreement section 4',reviewed:true},h.owner);
  await h.json(base+'/ledes-guideline',{clientLedesId:kind.toUpperCase(),lawFirmId:'SATCHEL',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Reviewed fee-plan client guideline'},h.owner);
  const entries=[];for(const narrative of ['Retained reviewed advice','Excluded reviewed advice'])entries.push(await h.json(base+'/entries',{kind:'time',date:'2026-10-02',description:narrative,minutes:kind==='blended'?17:60,rateCents:kind==='blended'?99000:30000},h.owner));
  const run=await h.json('/prebill-runs',{title:kind+' counsel review',date:'2026-10-03',items:[{matterId:m.id,payer:m.client,periodStart:'2026-10-01',periodEnd:'2026-10-31',arrangement:kind,feePlanId:plan.id,entryIds:entries.map(e=>e.id)}]},billing),initial=run.bills[0];
  const oldTax=await exemptTaxReview(h,'/bills/'+initial.id+'/approve'),target=kind==='capped'?25000:5000;
  await h.json('/bills/'+initial.id+'/review',{revision:initial.revision,action:'revise',note:'An increase cannot replace a reviewed decrease',lines:[{sourceId:entries[0].id,amountCents:initial.snapshot.lines[0].amountCents+1}]},counsel,400);
  const edit={revision:initial.revision,action:'revise',note:'Counsel excludes one source and reviews the exact courtesy write-down',lines:[{sourceId:entries[0].id,description:'Counsel-approved fee narrative',amountCents:target},{sourceId:entries[1].id,exclude:true}]};
  const revised=await h.json('/bills/'+initial.id+'/review',edit,counsel);
  assert.deepEqual(revised.snapshot.feePlan,initial.snapshot.feePlan);assert.equal(revised.snapshot.totalCents,target);assert.equal(revised.snapshot.lines.length,1);
  assert.equal(revised.snapshot.lines[0].rateCents,initial.snapshot.lines[0].rateCents);assert.equal(revised.snapshot.lines[0].sourceRevision,entries[0].revision);
  const adjustment=revised.snapshot.lines[0].prebillAdjustments[0];assert.equal(adjustment.priorAmountCents,initial.snapshot.lines[0].amountCents);assert.equal(adjustment.amountCents,target);assert.equal(adjustment.adjustmentCents,target-initial.snapshot.lines[0].amountCents);assert.equal(adjustment.note,edit.note);
  assert.deepEqual(revised.snapshot.prebill.reviewedAdjustments.map(a=>[a.sourceId,a.action]),[[entries[0].id,'write_down'],[entries[1].id,'exclude']]);
  const coded=revised.snapshot.ledes.lines[0],before=initial.snapshot.ledes.lines[0];assert.equal(coded.units4,before.units4);assert.equal(coded.unitCostCents,before.unitCostCents);assert.equal(coded.totalCents,target);assert.equal(coded.adjustmentCents-before.adjustmentCents,target-before.totalCents);
  const state=await h.json(base+'/billing',undefined,h.owner);for(const entry of entries){const source=state.entries.find(e=>e.id===entry.id);assert.equal(source.amountCents,entry.amountCents);assert.equal(source.rateCents,entry.rateCents);assert.equal(source.revision,entry.revision);assert.equal(source.description,entry.description);assert.equal(source.reservedBy,entry.id===entries[0].id?revised.id:null);}
  const approval={revision:revised.revision,reviewNote:'Counsel approves exact decreased fee and source exclusion',earnedConfirmed:true,earningEvidence:'Recorded work completed and reviewed under original agreement'};
  await h.json('/bills/'+revised.id+'/approve',{revision:revised.revision,reviewNote:approval.reviewNote,taxReviewId:oldTax},counsel,422);
  await h.json('/bills/'+revised.id+'/approve',{...approval,taxReviewId:oldTax},counsel,422);
  const currentTax=await exemptTaxReview(h,'/bills/'+revised.id+'/approve');
  await h.json('/bills/'+revised.id+'/approve',{...approval,revision:initial.revision,taxReviewId:currentTax},counsel,409);
  const approved=await h.json('/bills/'+revised.id+'/approve',{...approval,taxReviewId:currentTax},counsel);
  const approvedState=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===approved.id);assert.equal(approvedState.earningReview.earned_cents,target);assert.equal(approvedState.snapshot.taxReview.billRevision,revised.revision);assert.deepEqual(approvedState.snapshot.feePlan,initial.snapshot.feePlan);
  const replacement=await h.json(base+'/bills',{title:'Excluded source separately reconsidered',date:'2026-10-03',entryIds:[entries[1].id],feePlanId:plan.id},h.owner);
  assert.equal(replacement.snapshot.totalCents,kind==='capped'?20000:initial.snapshot.lines[1].amountCents);
  if(kind==='capped')assert.equal(approved.snapshot.totalCents+replacement.snapshot.totalCents,plan.amountCents);
  const payload={bills:[{id:approved.id,revision:approved.revision}]},issued=await h.json('/invoices/issue',payload,billing);assert.deepEqual(issued.issues[0].line_snapshot,revised.snapshot.lines);assert.deepEqual(await h.json('/invoices/issue',payload,billing),issued);
  await h.json('/bills/'+approved.id+'/review',{revision:approved.revision,action:'revise',note:'Issued fee adjustments are immutable',lines:[]},counsel,409);
  const history=(await h.json('/prebill-runs/'+run.id,undefined,counsel)).bills[0].reviews;assert.equal(history.length,1);assert.deepEqual(JSON.parse(history[0].excluded_sources),[entries[1].id]);assert.equal(history[0].note,edit.note);
 }
}
