import assert from 'node:assert/strict';
import {capturePanel} from './browser-shots.mjs';

async function screens(page,target,stem){
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  const table=target.locator('.table-scroll').first();
  if(width===390&&await table.count())assert.ok(await table.evaluate(element=>element.scrollWidth>element.clientWidth),'Settlement amounts stay readable in the phone scroll area');
  if(process.env.SATCHEL_SCREENSHOTS){
   if(stem.includes('refused'))await capturePanel(page,page.getByRole('alert'),process.env.SATCHEL_SCREENSHOTS,stem+'-notice-'+width);
   await capturePanel(page,target,process.env.SATCHEL_SCREENSHOTS,stem+'-'+width);
   if(width===390&&await table.count()){await table.evaluate(element=>{element.scrollLeft=element.scrollWidth;});await capturePanel(page,table,process.env.SATCHEL_SCREENSHOTS,stem+'-'+width+'-amounts');await table.evaluate(element=>{element.scrollLeft=0;});}
  }
 }
}

export async function settlementExecutionJourney({h,page,f,done}){
 const panel=page.locator('section.settlement-panel');
 const record=panel.locator('article.record').first();
 const spending=panel.locator('details.settlement-spending');
 const navigate=async tab=>page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:tab,exact:true}).click();
 const submitRefused=async(button,path)=>{
  const response=page.waitForResponse(value=>value.url().includes('/api/satchel/')&&new URL(value.url()).pathname.endsWith(path)&&value.request().method()==='POST');
  await button.click();assert.equal((await response).status(),409);await page.getByRole('alert').waitFor();
 };
 await record.getByLabel('Settlement trust ledger').selectOption(f.ledger.id);
 await submitRefused(record.getByRole('button',{name:'Check cleared settlement funds'}),'/settlements/check-funds');
 await spending.locator('summary').click();
 await spending.getByLabel('Exact settlement allocation').selectOption('1');
 await spending.getByLabel('Disbursement trust ledger').selectOption(f.ledger.id);
 await spending.getByLabel('Settlement payment method').selectOption('wire');
 await spending.getByLabel('Settlement bank transaction reference').fill('RECOVERY-LIEN-001');
 await spending.getByLabel('Settlement bank record date').fill('2026-10-27');
 await spending.getByLabel('Settlement payment date').fill('2026-10-27');
 await spending.getByLabel('Settlement supporting original').selectOption(f.source.id);
 await spending.getByLabel('Settlement authorized payment purpose').fill('Client authorized exact reduced lien payment under reviewed settlement');
 await submitRefused(spending.getByRole('button',{name:'Prepare settlement disbursement',exact:true}),'/trust/transactions');
 assert.equal((await h.json('/trust/transactions',undefined,h.owner)).filter(value=>value.direction==='disbursement').length,0);
 await screens(page,panel,'settlement-refused-approvals');

 await navigate('Firm');const settings=page.locator('section.settlement-settings');
 await settings.getByRole('button',{name:'Record settlement approval setting'}).waitFor();
 await settings.getByLabel('Sole-practitioner approval').selectOption('no');
 await settings.getByLabel('Settlement setting reason').fill('Retain separate people while staffing is reviewed');
 await settings.getByLabel('Settlement setting scope').fill('All firm settlement approvals');
 await settings.getByRole('button',{name:'Record settlement approval setting'}).click();await done('Settlement approval setting recorded');
 let policy=await h.json('/settlement-policy',undefined,h.owner);assert.equal(policy.solePractitionerEnabled,false);assert.ok(policy.reason&&policy.scope&&policy.actor&&policy.effectiveAt);
 await settings.getByText(policy.reason,{exact:true}).waitFor();await settings.getByText(policy.scope,{exact:true}).waitFor();await settings.getByText(policy.actor,{exact:true}).waitFor();await settings.getByText(policy.effectiveAt,{exact:true}).waitFor();
 await screens(page,settings,'settlement-settings-disabled');
 await settings.getByLabel('Sole-practitioner approval').selectOption('yes');
 await settings.getByLabel('Settlement setting reason').fill('Principal is the sole practitioner and designated trust officer');
 await settings.getByLabel('Settlement setting scope').fill('Firm settlements; separate counsel and finance approvals of each exact revision');
 await settings.getByRole('button',{name:'Record settlement approval setting'}).click();await done('Settlement approval setting recorded');
 const enabled=await h.json('/settlement-policy',undefined,h.owner);assert.equal(enabled.solePractitionerEnabled,true);assert.ok(enabled.version>policy.version);assert.ok(enabled.reason&&enabled.scope&&enabled.actor&&enabled.effectiveAt);
 await settings.getByText(enabled.reason,{exact:true}).waitFor();await settings.getByText(enabled.scope,{exact:true}).waitFor();await settings.getByText(enabled.actor,{exact:true}).waitFor();await settings.getByText(enabled.effectiveAt,{exact:true}).waitFor();
 await screens(page,settings,'settlement-settings-enabled');

 await navigate('Time & bills');await page.getByLabel('Current matter').selectOption(f.m.id);
 await record.getByLabel('Approval capacity').selectOption('counsel');
 await record.getByLabel('Settlement approval evidence').fill('Counsel reapproved this exact statement under the recorded sole-practitioner setting');
 await record.getByRole('button',{name:'Approve settlement revision',exact:true}).click();await done('Settlement approval recorded');
 await record.getByLabel('Approval capacity').selectOption('finance');
 await record.getByLabel('Settlement approval evidence').fill('Designated officer separately reviewed this exact statement and authority');
 await record.getByRole('button',{name:'Approve settlement revision',exact:true}).click();await done('Settlement approval recorded');
 const current=(await h.json('/matters/'+f.m.id+'/settlements',undefined,h.owner)).statements[0];
 const approvals=current.approvals.filter(value=>value.policy_version===enabled.version);
 assert.deepEqual(approvals.map(value=>value.capacity).sort(),['counsel','finance']);assert.equal(new Set(approvals.map(value=>value.actor)).size,1);
 for(const approval of approvals){assert.equal(approval.statement_id,current.id);assert.ok(approval.at&&approval.note);}
 await record.getByText(/finance approved by owner@example.test/).waitFor();
 await record.getByLabel('Settlement trust ledger').selectOption(f.ledger.id);
 await submitRefused(record.getByRole('button',{name:'Check cleared settlement funds'}),'/settlements/check-funds');
 await screens(page,panel,'settlement-refused-funds');

 const receipt=await h.json('/trust/transactions',{direction:'receipt',accountId:f.account.id,ledgerId:f.ledger.id,kind:'wire',cents:current.snapshot.grossCents,counterparty:'Recovery payer',bankReference:'RECOVERY-CLEARED-001',receivedDate:'2026-10-27',depositDate:'2026-10-27',clearedDate:'2026-10-27',documentId:f.source.id,purpose:'Cleared settlement recovery supported by the bank original',requestKey:'settlement-browser-recovery'},h.owner);
 await h.json('/trust/transactions/'+receipt.id+'/decide',{revision:receipt.revision,decision:'approved',reviewNote:'Reviewed exact cleared settlement receipt'},h.owner);
 await record.getByRole('button',{name:'Check cleared settlement funds'}).click();await done('Settlement funds checked');
 await spending.locator('summary').click();await spending.getByLabel('Exact settlement allocation').selectOption('1');
 await spending.getByLabel('Disbursement trust ledger').selectOption(f.ledger.id);await spending.getByLabel('Settlement payment method').selectOption('wire');
 await spending.getByLabel('Settlement bank transaction reference').fill('RECOVERY-LIEN-001');await spending.getByLabel('Settlement bank record date').fill('2026-10-27');await spending.getByLabel('Settlement payment date').fill('2026-10-27');
 await spending.getByLabel('Settlement supporting original').selectOption(f.source.id);await spending.getByLabel('Settlement authorized payment purpose').fill('Client authorized exact reduced lien payment under reviewed settlement');
 await spending.getByRole('button',{name:'Prepare settlement disbursement',exact:true}).click();await done('Settlement disbursement prepared for review');
 await spending.locator('summary').click();
 const linked=spending.locator('article.settlement-transaction');await linked.getByRole('heading',{name:'Health lien holder · $1,500.00',exact:true}).waitFor();
 const prepared=(await h.json('/matters/'+f.m.id+'/settlements',undefined,h.owner)).transactions.find(value=>value.statement_id===current.id);
 assert.ok(prepared);assert.equal(prepared.allocation_index,1);assert.equal(prepared.counterparty,current.snapshot.allocations[prepared.allocation_index].payee);assert.equal(prepared.cents,current.snapshot.allocations[prepared.allocation_index].amountCents);assert.equal(prepared.decision,null);
 await screens(page,panel,'settlement-populated-disbursement');
 await linked.getByLabel('Settlement disbursement review evidence').fill('Current exact revision, payee, amount, approvals and cleared funds reviewed');
 await linked.getByRole('button',{name:'Decide settlement disbursement'}).click();await done('Settlement disbursement decision recorded');
 await spending.locator('summary').click();
 const decided=(await h.json('/trust/transactions',undefined,h.owner)).find(value=>value.id===prepared.transaction_id);assert.equal(decided.decision,'approved');assert.equal(decided.cents,prepared.cents);
 await screens(page,panel,'settlement-posted-disbursement');
 const billing=panel.locator('details').filter({has:page.locator('summary').getByText('Prepare settlement fee for billing',{exact:true})});
 await billing.locator('summary').click();await billing.getByLabel('Settlement fee billing date').fill('2026-10-27');
 await billing.getByLabel('Reviewed settlement fee eligibility').selectOption('yes');await billing.getByLabel('Reviewed settlement retainer draw-down').selectOption('prohibited');
 await billing.getByLabel('Settlement fee UTBMS task').fill('L110');await billing.getByLabel('Settlement fee UTBMS activity').fill('A101');
 await billing.getByRole('button',{name:'Prepare settlement fee bill'}).click();await done('Settlement fee bill prepared for review');
 const feeBill=(await h.json('/matters/'+f.m.id+'/billing',undefined,h.owner)).bills.find(value=>value.snapshot.feePlan?.settlementStatementId===current.id);
 assert.ok(feeBill);assert.equal(feeBill.snapshot.totalCents,current.snapshot.feeCents);assert.equal(feeBill.status,'draft');
 await page.locator('section.bill-packages article.record').filter({hasText:'Settlement counsel fee'}).waitFor();
}
