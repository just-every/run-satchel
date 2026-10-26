import {withTaxAllocation} from './tax-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {foundation,earnedBill} from './trust-fixture.mjs';
test('TRUST-004 BILL-016 native payment/void guards / TRUST-005 inherited reconciliation: exact partial earned-fee reservations, distinct dual officers, interrupted bank reconciliation paired invoice payments and exact reviewed reversal post once',async()=>{
 const h=await harness();try{
  const f=await foundation(h),o=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:150000,statementDate:'2026-10-01',documentId:f.source.id,note:'Opening client funds'},h.owner);await h.json('/trust/openings/'+o.id+'/approve',{revision:o.revision,reviewNote:'Reviewed exact statement'},h.owner);
  assert.equal((await h.json('/matters/'+f.m.id+'/revenue',undefined,h.owner)).totals.collectedCents,0,'Trust custody is not collected operating revenue');
  const first=await earnedBill(h,f.m,100000,'Earned October advice'),second=await earnedBill(h,f.m,90000,'Earned supplemental advice');let policy=await h.json('/trust/transfer-policy',undefined,h.owner);await h.json('/trust/transfer-policy',{revision:policy.revision,dualAuthorization:true},h.owner);
  const request=async b=>h.json('/trust/transfers',await withTaxAllocation(h,{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:b.id}),h.owner);
  const a=await request(first),b=await request(second);assert.deepEqual([a.cents,b.cents,a.required_approvals,b.required_approvals],[100000,50000,2,2]);assert.equal((await request(first)).id,a.id);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).available_cents,0);
  await h.json('/trust/transfers',await withTaxAllocation(h,{billId:second.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'overdraw'}),h.owner,409);
  await h.json('/trust/transfers',await withTaxAllocation(h,{billId:first.id,ledgerId:f.otherLedger.id,operatingAccountId:f.operating.id,requestKey:'cross-client'}),h.owner,409);
  policy=await h.json('/trust/transfer-policy',undefined,h.owner);await h.json('/trust/transfer-policy',{revision:policy.revision,dualAuthorization:false},h.owner);
  await h.json('/team',{email:'officer@example.test',name:'Nora Woods',role:'trust_officer'},h.owner);await h.json('/team/invite',{email:'officer@example.test'},h.owner);const officer=await h.login('officer@example.test');await h.json('/matters/'+f.m.id+'/access',{email:'officer@example.test'},h.owner);
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/trust/transfers/'+a.id+'/decide',{revision:a.revision,decision:'approved',reviewNote:'No authority'},assistant,403);
  const key=await h.json('/keys',{label:'Preparation only'},h.owner);await h.json('/trust/transfers/'+a.id+'/decide',{revision:a.revision,decision:'approved',reviewNote:'Agent'},'',401,{authorization:'Bearer '+key.key});
  const bank=(t,outcome,reference)=>({revision:t.revision,outcome,bankDate:'2026-10-03',bankReference:reference,documentId:f.source.id,evidence:'Bank confirmation original, transaction reference and exact amount checked'});
  for(const [t,reference] of [[a,'BANK-XFER-1000'],[b,'BANK-XFER-500']]){
   const approve={revision:t.revision,decision:'approved',reviewNote:'Reviewed earned invoice, exact amount and this client’s cleared funds'};const approval=await h.json('/trust/transfers/'+t.id+'/decide',approve,h.owner);assert.equal((await h.json('/trust/transfers/'+t.id+'/decide',approve,h.owner)).id,approval.id);
   await h.json('/trust/transfers/'+t.id+'/bank-result',bank(t,'submitted',reference),h.owner,409);await h.json('/trust/transfers/'+t.id+'/decide',approve,officer);await h.json('/trust/transfers/'+t.id+'/bank-result',bank(t,'submitted',reference),h.owner);
  }
  await h.json('/invoices/'+second.id+'/void',{revision:second.revision,reason:'Cannot void unresolved trust application'},h.owner,409);
  let s=await h.json('/trust/transfers',undefined,h.owner);assert.ok(s.every(t=>t.status==='awaiting_bank_reconciliation'&&t.invoice.paid_cents===0));assert.equal((await h.json('/trust',undefined,h.owner)).entries.length,1);
  assert.equal((await h.json('/matters/'+f.m.id+'/revenue',undefined,h.owner)).totals.collectedCents,0,'Pending bank applications are not collections');
  await h.restart();await h.json('/trust/transfers/'+a.id+'/bank-result',bank(a,'cleared','WRONG-REFERENCE'),h.owner,409);
  for(const [t,reference] of [[a,'BANK-XFER-1000'],[b,'BANK-XFER-500']]){const result=await h.json('/trust/transfers/'+t.id+'/bank-result',bank(t,'cleared',reference),h.owner);assert.equal((await h.json('/trust/transfers/'+t.id+'/bank-result',bank(t,'cleared',reference),h.owner)).id,result.id);}
  s=await h.json('/trust/transfers',undefined,h.owner);assert.deepEqual(s.map(t=>[t.cents,t.invoice.paid_cents,t.invoice.due_cents]).sort((x,y)=>y[0]-x[0]),[[100000,100000,0],[50000,50000,40000]]);const state=await h.json('/trust',undefined,h.owner);assert.equal(state.accounts.find(v=>v.id===f.account.id).balance_cents,0);assert.equal(state.accounts.find(v=>v.id===f.operating.id).balance_cents,150000);assert.equal(state.entries.length,5);
  assert.equal((await h.json('/matters/'+f.m.id+'/revenue',undefined,h.owner)).totals.collectedCents,150000);
  const reversal=await h.json('/trust/transfers/'+b.id+'/reversal',{reason:'Mistaken application; return exact second payment to client trust'},h.owner);assert.equal(reversal.required_approvals,2);
  const review={revision:reversal.revision,kind:'approved',note:'Original application and exact full return reviewed'};const approved=await h.json('/trust/transfers/'+b.id+'/reversal/action',review,h.owner);assert.equal((await h.json('/trust/transfers/'+b.id+'/reversal/action',review,h.owner)).id,approved.id);
  const result=kind=>({revision:reversal.revision,kind,note:'Actual bank reversal confirmation, exact $500 return reconciled',bankReference:'BANK-REVERSAL-500',bankDate:'2026-10-04',documentId:f.source.id});
  await h.json('/trust/transfers/'+b.id+'/reversal/action',result('submitted'),h.owner,409);await h.json('/trust/transfers/'+b.id+'/reversal/action',review,officer);await h.json('/trust/transfers/'+b.id+'/reversal/action',result('submitted'),h.owner);await h.restart();const reversed=await h.json('/trust/transfers/'+b.id+'/reversal/action',result('cleared'),h.owner);assert.equal((await h.json('/trust/transfers/'+b.id+'/reversal/action',result('cleared'),h.owner)).id,reversed.id);
  s=await h.json('/trust/transfers',undefined,h.owner);assert.equal(s.find(t=>t.id===b.id).invoice.due_cents,90000);assert.equal(s.find(t=>t.id===b.id).invoice.paid_cents,0);assert.equal(s.find(t=>t.id===b.id).reversal.status,'cleared');const restoredFunds=await h.json('/trust',undefined,h.owner);assert.equal(restoredFunds.ledgers.find(l=>l.id===f.ledger.id).balance_cents,50000);assert.equal(restoredFunds.ledgers.find(l=>l.id===f.ledger.id).available_cents,50000);assert.equal(restoredFunds.accounts.find(a=>a.id===f.operating.id).balance_cents,100000);assert.equal(restoredFunds.entries.length,7);
  const collections=await h.json('/matters/'+f.m.id+'/revenue',undefined,h.owner);assert.equal(collections.totals.collectedCents,100000);assert.equal(collections.sources.find(s=>s.netCents===0).reversals.length,1);
  const uncertain=await h.json('/trust/transfers',await withTaxAllocation(h,{billId:second.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'bank-no-execution'}),h.owner);await h.json('/trust/transfers/'+uncertain.id+'/decide',{revision:uncertain.revision,decision:'approved',reviewNote:'Reviewed exact remaining fees and restored funds'},h.owner);await h.json('/trust/transfers/'+uncertain.id+'/bank-result',{...bank(uncertain,'submitted','BANK-NOT-EXECUTED'),bankDate:'2026-10-05'},h.owner);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).available_cents,0);await h.json('/trust/transfers/'+uncertain.id+'/bank-result',{...bank(uncertain,'not_executed','BANK-NOT-EXECUTED'),bankDate:'2026-10-05'},h.owner);assert.equal((await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===f.ledger.id).available_cents,50000);
  s=await h.json('/trust/transfers',undefined,h.owner);assert.equal(s.find(t=>t.id===uncertain.id).status,'not_executed');
  const invoice=async id=>(await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===id);
  const firstCurrent=await invoice(first.id);await h.json('/invoices/'+first.id+'/void',{revision:firstCurrent.revision,reason:'Cannot void a paid invoice'},h.owner,409);
  const secondCurrent=await invoice(second.id),voidRequest={revision:secondCurrent.revision,reason:'Exact trust application reversed and uncertain bank attempt resolved; counsel authorizes void'};
  await h.json('/invoices/'+second.id+'/void',voidRequest,h.owner);
  s=await h.json('/trust/transfers',undefined,h.owner);assert.ok(s.filter(t=>t.bill_id===second.id).every(t=>t.invoice.status==='void'&&t.invoice.due_cents===0&&t.invoice.paid_cents===0));
  await h.json('/trust/transfers',await withTaxAllocation(h,{billId:second.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'no-payment-after-void'}),h.owner,409);
  const period=await h.json('/trust/periods',{accountId:f.account.id,startDate:'2026-10-01',endDate:'2026-10-18',closingBalanceCents:50000,documentId:f.source.id},h.owner),report=await h.json('/trust/periods/'+period.id,undefined,h.owner);
  assert.deepEqual([report.registerCents,report.subsidiaryCents,report.adjustedBankCents],[50000,50000,50000]);assert.equal(report.balanced,true);
  for(const transfer of [a,b])assert.equal(report.entries.filter(e=>e.source_id===transfer.id+':trust').length,1);
  assert.equal(report.entries.filter(e=>e.kind==='earned_fee_reversal').length,1);assert.equal(report.clientStatements.find(l=>l.ledgerId===f.ledger.id).closingBalanceCents,50000);
  await h.json('/trust/periods/'+period.id+'/sign',{reportDigest:report.reportDigest},h.owner);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json('/trust/transfers',undefined,target.owner),s);}finally{await target.close();}
  await proveRetainedBankComponents(h,f);
 }finally{await h.close();}
});

async function proveOfflineBalances(h,m,title,paid,due,stage){
 const {chromium}=await import('@playwright/test'),{mkdir}=await import('node:fs/promises');
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});
  await context.addCookies(h.owner.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin,secure:true};}));
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(h.origin+'/app');
  if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);
  const card=page.locator('.bill-packages > article.record').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+title+' ·')})});
  const dollars=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
  await card.getByText('Payments: '+dollars(paid),{exact:false}).waitFor();await card.getByText('remaining due '+dollars(due),{exact:false}).waitFor();
  if(stage==='returned')await page.getByRole('region',{name:'Invoice void notice'}).getByText('Invoice voided',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await card.scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-offline-'+stage+'.png'});}
  if(stage==='retained-components'){const revenue=page.getByRole('region',{name:'Collected revenue and commissions',exact:true});await revenue.getByText('Collected $100.00 · allocated fees $100.00 · commissions $12.50',{exact:true}).waitFor();await revenue.getByText('Allocation history and reversals (1)',{exact:true}).click();await revenue.getByText('Collected fees $100.00 · expenses $0.00 · tax $0.00',{exact:true}).waitFor();if(process.env.SATCHEL_SCREENSHOTS)await revenue.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-retained-bank-components.png'});}
  await context.close();
 }}finally{await browser.close();}
}

test('Offline operating receipts allocate once, preserve credit, refuse unauthorized write-offs and release payments before an immutable void',async()=>{
 const h=await harness();try{
  const f=await foundation(h),bill1=await earnedBill(h,f.m,10000,'First advice'),bill2=await earnedBill(h,f.m,20000,'Second advice'),bill3=await earnedBill(h,f.m,30000,'Third advice');
  for(const [email,role] of [['billing@example.test','billing'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:role,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.json('/matters/'+f.m.id+'/access',{email},h.owner);}
  const billing=await h.login('billing@example.test'),assistant=await h.login('assistant@example.test');
  const payment={requestKey:'synthetic-satchel-check-1',payer:f.m.client,method:'check',reference:'synthetic-satchel-1',receivedDate:'2026-10-01',depositDate:'2026-10-02',operatingAccountId:f.operating.id,cents:45000,purpose:'operating',oldestFirst:true};
  await h.json('/offline-payments',payment,assistant,403);
  const agent=await h.json('/keys',{label:'Offline proposal only'},h.owner);await h.json('/offline-payments',payment,'',401,{authorization:'Bearer '+agent.key});
  await h.json('/offline-payments',{...payment,purpose:'trust'},billing,400);
  await h.json('/offline-payments',{...payment,operatingAccountId:f.account.id},billing,409);
  const [r,replayed]=await Promise.all([h.json('/offline-payments',payment,billing),h.json('/offline-payments',payment,billing)]);assert.equal(r.id,replayed.id);assert.equal(r.allocations.length,3);assert.equal(r.creditCents,0);
  // The native TIME-008 rule reviews actual invoice allocations, never receipt face value.
  const revenuePath='/matters/'+f.m.id+'/revenue',allocationPath=revenuePath+'/allocations';
  const approvedRule={requestKey:'synthetic-satchel-revenue-rule-1',previousId:null,sourceDocumentId:f.source.id,sourceVersion:f.source.currentVersion,sourceDigest:f.source.versions.find(v=>v.version===f.source.currentVersion).sha256,basis:'proportional_fee_receipts',reference:'Signed firm agreement, origination and responsible-attorney compensation schedule',splits:[{kind:'origination',email:'owner@example.test',shareBps:2500,commissionBps:1000},{kind:'responsible',email:'owner@example.test',shareBps:5000,commissionBps:2000}],approve:true};
  await h.json(revenuePath+'/rules',approvedRule,assistant,403);await h.json(revenuePath+'/rules',approvedRule,billing,403);
  await h.json(revenuePath+'/rules',{...approvedRule,approve:false},h.owner,403);
  await h.json(revenuePath+'/rules',{...approvedRule,sourceVersion:99},h.owner,409);
  const rule=await h.json(revenuePath+'/rules',approvedRule,h.owner);assert.equal((await h.json(revenuePath+'/rules',approvedRule,h.owner)).id,rule.id);
  await h.json(revenuePath+'/rules',{...approvedRule,reference:'Changed approval'},h.owner,409);
  let revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.totals.collectedCents,45000);assert.equal(revenue.totals.commissionCents,0);
  const partial=revenue.sources.find(v=>v.billId===bill3.id);assert.equal(partial.cents,15000);assert.equal(partial.preview.feeCents,15000);
  assert.deepEqual(partial.preview.allocations.map(a=>[a.kind,a.cents,a.commissionCents]),[['origination',3750,375],['responsible',7500,1500]]);
  const allocationRequest={requestKey:'synthetic-satchel-revenue-allocation-1',sourceKey:partial.key,ruleId:rule.id,reviewDigest:partial.preview.reviewDigest,approve:true};
  await h.json(allocationPath,{...allocationRequest,reviewDigest:'stale'},h.owner,409);await h.json(allocationPath,allocationRequest,billing,403);
  const approvedAllocation=await h.json(allocationPath,allocationRequest,h.owner);assert.equal((await h.json(allocationPath,allocationRequest,h.owner)).id,approvedAllocation.id);
  await h.json(allocationPath,{...allocationRequest,requestKey:'synthetic-satchel-revenue-duplicate'},h.owner,409);
  await h.json(allocationPath,{...allocationRequest,ruleId:'changed'},h.owner,409);
  revenue=await h.json(revenuePath,undefined,h.owner);const originalAllocation=revenue.allocations[0].original;
  assert.equal(originalAllocation.firmCents,3750);assert.equal(revenue.totals.commissionCents,1875);
  assert.equal(originalAllocation.sourceLines[0].timekeeper,'owner@example.test');
  const replacementRule=await h.json(revenuePath+'/rules',{...approvedRule,requestKey:'synthetic-satchel-revenue-rule-2',previousId:rule.id,reference:'Prospective replacement, original approved calculations retained',splits:approvedRule.splits.map(a=>({...a,shareBps:3333,commissionBps:3333}))},h.owner);
  assert.equal(replacementRule.version,2);await h.json(revenuePath+'/rules',{...approvedRule,requestKey:'synthetic-satchel-revenue-stale'},h.owner,409);
  assert.deepEqual((await h.json(revenuePath,undefined,h.owner)).allocations[0].original,originalAllocation);
  const ceiling=await h.json('/roles',{name:'Receipt balance ceiling',permissions:{rates:'all',bank:'balances',reports:'firm',contacts:'write',documents:'write',billing:'write',settings:'write'},reason:'Bank transaction details withheld'},h.owner);
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing',customRoleId:ceiling.id},h.owner);
  await h.json('/offline-payments/'+r.id,undefined,billing,403);await h.json('/offline-payments',{...payment,requestKey:'synthetic-satchel-ceiling'},billing,403);
  await h.json('/offline-payments/'+r.id+'/actions',{requestKey:'synthetic-satchel-ceiling-action',kind:'bounce',reason:'No bank transaction authority'},billing,403);
  await h.json('/team',{email:'billing@example.test',name:'Billing',role:'billing',customRoleId:null},h.owner);

  await h.json('/offline-payments',{...payment,cents:44000},billing,409);
  const funds=async id=>(await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===id).trustPayment;
  assert.deepEqual(await Promise.all([bill1,bill2,bill3].map(async b=>{const f=await funds(b.id);return [f.paid_cents,f.due_cents];})),[[10000,0],[20000,0],[15000,15000]]);
  await proveOfflineBalances(h,f.m,'Third advice',15000,15000,'allocated');
  const writeoff={requestKey:'synthetic-satchel-writeoff-1',revision:bill3.revision,cents:15000,reason:'Principal reviewed short-payment concession',approve:true};
  await h.json('/invoices/'+bill3.id+'/writeoff',writeoff,assistant,403);await h.json('/invoices/'+bill3.id+'/writeoff',writeoff,billing,403);
  await h.json('/invoices/'+bill3.id+'/writeoff',{...writeoff,approve:false},h.owner,403);
  const wo=await h.json('/invoices/'+bill3.id+'/writeoff',writeoff,h.owner);assert.equal((await h.json('/invoices/'+bill3.id+'/writeoff',writeoff,h.owner)).id,wo.id);
  assert.deepEqual([(await funds(bill3.id)).paid_cents,(await funds(bill3.id)).written_off_cents,(await funds(bill3.id)).due_cents],[15000,15000,0]);
  assert.deepEqual((await h.json(revenuePath,undefined,h.owner)).allocations[0].current,originalAllocation);
  const fourth=await earnedBill(h,f.m,10000,'Fourth advice'),second={...payment,requestKey:'synthetic-satchel-check-2',oldestFirst:false,cents:25000,allocations:[{billId:fourth.id,cents:10000}]};
  const over=await h.json('/offline-payments',second,billing);assert.equal(over.creditCents,15000);
  revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.sources.filter(v=>v.receiptId===over.id).reduce((n,v)=>n+v.netCents,0),10000);assert.equal(revenue.totals.collectedCents,55000);
  const fifth=await earnedBill(h,f.m,20000,'Fifth advice'),apply={requestKey:'synthetic-satchel-apply-1',kind:'allocate',reason:'Apply retained overpayment',allocations:[{billId:fifth.id,cents:15000}]};
  await h.json('/offline-payments/'+over.id+'/actions',{...apply,allocations:[{billId:fifth.id,cents:15001}]},billing,409);
  const [applied,appliedReplay]=await Promise.all([h.json('/offline-payments/'+over.id+'/actions',apply,billing),h.json('/offline-payments/'+over.id+'/actions',apply,billing)]);assert.equal(applied.id,appliedReplay.id);assert.equal(applied.creditCents,0);assert.equal((await h.json('/offline-payments/'+over.id+'/actions',apply,billing)).allocations.length,2);
  revenue=await h.json(revenuePath,undefined,h.owner);assert.equal(revenue.totals.collectedCents,70000);
  for(const source of revenue.sources.filter(v=>v.receiptId===over.id)){const a={requestKey:'synthetic-satchel-revenue-'+source.id,sourceKey:source.key,ruleId:replacementRule.id,reviewDigest:source.preview.reviewDigest,approve:true};await h.json(allocationPath,a,h.owner);await h.json(allocationPath,a,h.owner);}
  const retainedRevenue=await h.json(revenuePath,undefined,h.owner);assert.equal(retainedRevenue.allocations.length,3);
  const foreign=await earnedBill(h,f.other,10000,'Different payer');await h.json('/offline-payments',{...second,requestKey:'synthetic-satchel-other',allocations:[{billId:foreign.id,cents:10000}]},h.owner,409);
  const voidBody={revision:fourth.revision,reason:'Rebill after moving the receipt to credit'};await h.json('/invoices/'+fourth.id+'/void',voidBody,h.owner,409);
  const move={requestKey:'synthetic-satchel-credit-1',kind:'credit',billId:fourth.id,reason:'Retain receipt as unapplied client credit for replacement invoice'};
  assert.equal((await h.json('/offline-payments/'+over.id+'/actions',move,billing)).creditCents,10000);
  assert.equal((await h.json('/offline-payments/'+over.id+'/actions',move,billing)).creditCents,10000);
  revenue=await h.json(revenuePath,undefined,h.owner);const credited=revenue.allocations.find(a=>a.billId===fourth.id);assert.equal(credited.current.feeCents,0);assert.equal(credited.reversals.length,1);assert.equal(credited.reversals[0].calculation.feeCents,-10000);assert.equal(revenue.totals.collectedCents,60000);
  const original=await(await h.request('/api/satchel/bills/'+fourth.id+'/export',undefined,h.owner)).text();
  const refreshed=(await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===fourth.id);
  const v={...voidBody,revision:refreshed.revision};await h.json('/invoices/'+fourth.id+'/void',v,h.owner);await h.json('/invoices/'+fourth.id+'/void',v,h.owner);
  assert.equal(await(await h.request('/api/satchel/bills/'+fourth.id+'/export',undefined,h.owner)).text(),original);
  const bounce={requestKey:'synthetic-satchel-bounce-1',kind:'bounce',reason:'Bank returned the original check unpaid'};
  await h.json('/offline-payments/'+r.id+'/actions',bounce,billing);await h.json('/offline-payments/'+r.id+'/actions',bounce,billing);
  assert.deepEqual(await Promise.all([bill1,bill2,bill3].map(async b=>{const f=await funds(b.id);return [f.paid_cents,f.due_cents];})),[[0,10000],[0,20000],[0,15000]]);
  revenue=await h.json(revenuePath,undefined,h.owner);const returned=revenue.allocations.find(a=>a.id===approvedAllocation.id);assert.deepEqual(returned.original,originalAllocation);assert.equal(returned.current.feeCents,0);assert.equal(returned.reversals.length,1);assert.deepEqual(returned.reversals[0].calculation.allocations.map(a=>a.commissionCents),[-375,-1500]);
  await h.json('/offline-payments/'+r.id+'/actions',apply,billing,409);
  // A return follows the original receipt even after its credit was reused.
  await h.json('/offline-payments/'+over.id+'/actions',{...bounce,requestKey:'synthetic-satchel-bounce-2'},billing);
  assert.equal((await funds(fifth.id)).due_cents,20000);
  assert.equal((await h.json('/offline-payments/'+over.id,undefined,billing)).creditCents,0);
  for(const method of ['cash','wire','ach']){const bill=await earnedBill(h,f.m,1,'Receipt '+method),receipt=await h.json('/offline-payments',{...second,method,cents:1,requestKey:'synthetic-satchel-'+method,allocations:[{billId:bill.id,cents:1}]},billing);assert.equal((await funds(bill.id)).due_cents,0);assert.equal(receipt.method,method);}

  await proveOfflineBalances(h,f.m,'Third advice',0,15000,'returned');
  await h.restart();assert.equal((await h.json('/offline-payments/'+over.id,undefined,billing)).actions.length,4);
  await h.json('/team',{email:'custodian@example.test',name:'Custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'custodian@example.test'},h.owner);await h.json('/matters/'+f.m.id+'/access',{email:'custodian@example.test'},h.owner);
  await h.json('/matters/'+f.m.id+'/wall',{custodianEmail:'custodian@example.test',members:['owner@example.test'],reason:'Exclude billing from confidential payer work',revision:null},h.owner);
  await h.json('/offline-payments/'+over.id,undefined,billing,404);await h.json('/offline-payments/'+over.id+'/actions',{...apply,requestKey:'synthetic-satchel-excluded'},billing,404);
  await h.json('/offline-payments',{...payment,requestKey:'synthetic-satchel-wall'},billing,404);
  await h.json('/team',{email:'billing@example.test',name:'Former billing',role:'assistant'},h.owner);await h.json('/offline-payments/'+over.id,undefined,billing,403);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json('/offline-payments/'+over.id,undefined,target.owner),await h.json('/offline-payments/'+over.id,undefined,h.owner));assert.deepEqual(await target.json(revenuePath,undefined,target.owner),await h.json(revenuePath,undefined,h.owner));await target.json('/team/invite',{email:'custodian@example.test'},target.owner);const custody=await target.login('custodian@example.test');await target.json(revenuePath,undefined,custody,403);assert.equal((await target.json('/audit?action=revenue.collection_allocated',undefined,custody)).records.length,0);await target.json('/matters/'+f.m.id+'/wall',{custodianEmail:'custodian@example.test',members:[],reason:'Screen the principal from this matter',revision:(await target.json('/ethical-walls',undefined,custody)).walls.find(w=>w.matter_id===f.m.id).revision},custody);await target.json(revenuePath,undefined,target.owner,404);await target.json(allocationPath,allocationRequest,target.owner,404);}finally{await target.close();}
 }finally{await h.close();}
});


async function proveRetainedBankComponents(h,f){
 const base='/matters/'+f.other.id,day='2026-10-19';
 const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.otherLedger.id,cents:10000,statementDate:day,documentId:f.otherSource.id,note:'Reviewed opening statement for component-specific application'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Checked retained statement and exact available funds'},h.owner);
 const tax=await h.json(base+'/tax-rules',{state:'NY',jurisdiction:'Reviewed component-specific service tax',rounding:'half_up',reference:'Principal reviewed component treatment',reviewed:true,service:{eligibility:'taxable',ratePpm:200000,reference:'Reviewed service tax'},expense:{eligibility:'exempt',ratePpm:0,reference:'Reviewed expense exemption'},trust:{eligibility:'permitted',reference:'Exact earned-base and tax split required'}},h.owner);
 const entry=await h.json(base+'/entries',{kind:'time',date:day,description:'Earned advice with separately reviewed tax',minutes:60,rateCents:10000},h.owner);let bill=await h.json(base+'/bills',{title:'Earned advice and distinct tax',date:day,entryIds:[entry.id]},h.owner);
 const taxReview=await h.json('/bills/'+bill.id+'/tax-reviews',{revision:bill.revision,ruleId:tax.id},h.owner);bill=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,taxReviewId:taxReview.id,reviewNote:'Reviewed exact earned work and separate tax component'},h.owner);assert.equal(bill.snapshot.totalCents,12000);
 const transfer=await h.json('/trust/transfers',{billId:bill.id,ledgerId:f.otherLedger.id,operatingAccountId:f.operating.id,requestKey:'synthetic-satchel-component-bank',allocation:{earnedCents:10000,taxCents:0,reference:'Officer explicitly allocated this receipt entirely to earned work; tax remains due'}},h.owner);
 await h.json('/trust/transfers/'+transfer.id+'/decide',{revision:transfer.revision,decision:'approved',reviewNote:'Checked exact earned-base-only component allocation'},h.owner);
 const bank={revision:transfer.revision,bankDate:'2026-10-20',bankReference:'synthetic-satchel-component-clearance',documentId:f.otherSource.id,evidence:'Bank confirmed exact operating receipt for the reviewed component split'};
 await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'submitted'},h.owner);await h.json('/trust/transfers/'+transfer.id+'/bank-result',{...bank,outcome:'cleared'},h.owner);
 const rule=await h.json(base+'/revenue/rules',{requestKey:'synthetic-satchel-component-rule',previousId:null,sourceDocumentId:f.otherSource.id,sourceVersion:f.otherSource.currentVersion,sourceDigest:f.otherSource.versions[0].sha256,basis:'proportional_fee_receipts',reference:'Firm approved compensation on actual earned-work collections',splits:[{kind:'origination',email:'owner@example.test',shareBps:2500,commissionBps:1000},{kind:'responsible',email:'owner@example.test',shareBps:5000,commissionBps:2000}],approve:true},h.owner);
 let revenue=await h.json(base+'/revenue',undefined,h.owner);assert.equal(revenue.sources.length,1);const source=revenue.sources[0];assert.deepEqual([source.preview.feeCents,source.preview.taxCents],[10000,0],'A retained bank component split takes precedence over the proportions of an unsplit invoice receipt');
 await h.json(base+'/revenue/allocations',{requestKey:'synthetic-satchel-component-allocation',sourceKey:source.key,ruleId:rule.id,reviewDigest:source.preview.reviewDigest,approve:true},h.owner);revenue=await h.json(base+'/revenue',undefined,h.owner);assert.equal(revenue.allocations[0].current.feeCents,10000);assert.equal(revenue.allocations[0].current.taxCents,0);
 await proveOfflineBalances(h,f.other,'Earned advice and distinct tax',10000,2000,'retained-components');
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.deepEqual(await target.json(base+'/revenue',undefined,target.owner),revenue);}finally{await target.close();}
}
