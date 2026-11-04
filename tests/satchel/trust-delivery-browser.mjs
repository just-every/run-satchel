import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {transaction} from './trust-period-fixture.mjs';

export async function trustDeliveryBrowser({h,f,page,browser,width,form,notice}){
 const email=['trust-client','example.test'].join('@'),payer=['trust-payer','example.test'].join('@');
 for(const [address,name,kind] of [[email,'Barton client','client'],[payer,'Invoice payer','payer']]){
  await h.json('/team',{email:address,name,role:'client'},h.owner);await h.json('/team/invite',{email:address},h.owner);
  await h.json('/matters/'+f.m.id+'/portal',{email:address,kind,reason:'Explicit named portal recipient for trust review'},h.owner);
 }
 const clientContext=await browser.newContext({viewport:{width,height:width===390?844:1000},ignoreHTTPSErrors:true,reducedMotion:'reduce'});
 try{
 const cookie=await h.login(email);await clientContext.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin};}));
 const client=await clientContext.newPage();client.setDefaultTimeout(15000);await client.goto(h.origin+'/app');await client.getByRole('heading',{name:'Your matters',exact:true}).waitFor();
 const clientTrust=client.getByRole('region',{name:'Your trust records',exact:true});await clientTrust.getByText('No client trust statement is currently released to you.',{exact:true}).waitFor();
 const panel=page.getByRole('region',{name:'Client trust delivery',exact:true});await panel.getByLabel('Client delivery ledger').selectOption(f.ledger.id);
 await panel.getByText('No approved retainer policy. Record one in Settings below.',{exact:true}).waitFor();
 await panel.getByLabel('Signed client statement').selectOption({label:'2026-09-01 to 2026-09-30 · version 2'});
 await panel.getByText('Through 2026-09-30 · closing $800.00',{exact:true}).waitFor();
 const release=form(page,'Release exact client statement');assert.equal(await release.getByRole('option',{name:'Invoice payer · Payer',exact:true}).count(),0);
 await release.getByLabel('Trust publication recipient').selectOption(email);await release.getByLabel('Statement release reason').fill('Principal reviewed the exact signed client statement and current grant');await release.getByRole('checkbox').check();await release.getByRole('button',{name:'Release exact client statement',exact:true}).click();await notice('Exact client statement published');
 await clientTrust.getByRole('button',{name:'Refresh trust records',exact:true}).click();await clientTrust.getByText('Statement through 2026-09-30 · $800.00',{exact:true}).waitFor();
 const clientStatements=(await h.json('/portal/matters/'+f.m.id+'/trust-statements',undefined,cookie)).statements;
 for(const e of clientStatements[0].entries){assert.ok((await clientTrust.innerText()).includes(e.date));assert.ok((await clientTrust.innerText()).includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(e.cents/100)));}
 await panel.getByText('Settings',{exact:true}).click();const policy=form(page,'Approve retainer policy');await policy.getByLabel('Low retainer USD cents').fill('79000');await policy.getByLabel('Target retainer USD cents').fill('125000');await policy.getByLabel('Retainer policy reason').fill('Principal approves reviewed retainer terms; no automatic collection');await policy.getByRole('checkbox').check();await policy.getByRole('button',{name:'Approve retainer policy',exact:true}).click();await notice('Retainer policy version approved');
 await panel.getByText('At or above the approved threshold',{exact:true}).waitFor();
 await transaction(h,f,{direction:'disbursement',cents:2500,day:'2026-10-04',reference:'synthetic-satchel-client-alert'});
 // Reload the inspector through the ledger selector, retaining the actual page.
 await panel.getByLabel('Client delivery ledger').selectOption('');await panel.getByLabel('Client delivery ledger').selectOption(f.ledger.id);await panel.getByText('Below the approved threshold',{exact:true}).waitFor();
 const requests=form(page,'Publish exact replenishment request');await requests.getByLabel('Trust publication recipient').selectOption(email);await requests.getByLabel('Replenishment approval reason').fill('Principal approves exact posted balance and amount for this client');await requests.getByRole('checkbox').check();
 const before=await h.json('/trust',undefined,h.owner),mailCount=h.mails.length;
 // A changed policy invalidates the balance digest still displayed in the form.
 await h.json('/trust/ledgers/'+f.ledger.id+'/retainer-policy',{thresholdCents:79000,targetCents:130000,reason:'Updated terms require new exact review',confirmed:true},h.owner);
 await requests.getByRole('button',{name:'Publish exact replenishment request',exact:true}).click();await panel.getByRole('alert').getByText('Approve the exact current balance alert',{exact:true}).waitFor();assert.deepEqual((await h.json('/portal/matters/'+f.m.id+'/replenishments',undefined,cookie)).requests,[]);
 await proof(page,panel,'stale-replenishment-refused');
 await panel.getByLabel('Client delivery ledger').selectOption('');await panel.getByLabel('Client delivery ledger').selectOption(f.ledger.id);await panel.getByText('Below the approved threshold',{exact:true}).waitFor();
 await requests.getByLabel('Trust publication recipient').selectOption(email);await requests.getByLabel('Replenishment approval reason').fill('Review refreshed: exact balance $775.00 and requested $525.00');await requests.getByRole('checkbox').check();await requests.getByRole('button',{name:'Publish exact replenishment request',exact:true}).click();await notice('Approved replenishment request published');
 assert.deepEqual((await h.json('/trust',undefined,h.owner)).entries,before.entries);assert.equal(h.mails.length,mailCount);
 await clientTrust.getByRole('button',{name:'Refresh trust records',exact:true}).click();await clientTrust.getByText('Requested replenishment $525.00',{exact:true}).waitFor();await clientTrust.getByText('Balance at approval $775.00 · retainer target $1,300.00',{exact:true}).waitFor();
 await panel.getByText('Replenishment publication history',{exact:true}).click();await panel.getByText('$525.00 requested · '+email,{exact:true}).waitFor();
 await proof(page,panel,'staff-client-publications');await proof(client,clientTrust,'client-trust-statement-and-request');
 const shown=await clientTrust.innerText();for(const privateValue of [f.other.id,f.account.id,'4821','Bank reference','Registration'])assert.ok(!shown.includes(privateValue));
 await panel.getByText('Statement publication history',{exact:true}).click();const withdraw=form(page,'Withdraw statement release');await withdraw.getByLabel('Statement withdrawal reason').fill('Principal withdraws this exact statement release');await withdraw.getByRole('button',{name:'Withdraw statement release',exact:true}).click();await notice('Statement release withdrawn');await clientTrust.getByRole('button',{name:'Refresh trust records',exact:true}).click();await clientTrust.getByText('No client trust statement is currently released to you.',{exact:true}).waitFor();await clientTrust.getByText('Requested replenishment $525.00',{exact:true}).waitFor();
 const grant=(await h.json('/matters/'+f.m.id+'/portal',undefined,h.owner)).grants.find(g=>g.email===email);
 await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Client authority withdrawn; existing request must disappear'},h.owner);await clientTrust.getByRole('button',{name:'Refresh trust records',exact:true}).click();await clientTrust.getByText('No approved replenishment request is currently published to you.',{exact:true}).waitFor();await proof(client,clientTrust,'client-publication-withdrawn');
 console.log('PROBE TRUST-008 CLIENT: signed release, threshold crossing and exact approval -> client statement $800.00 and request $525.00; stale approval refused, zero debits or mail; withdrawn grant hides records');
 }finally{await clientContext.close();}
 async function proof(target,section,name){
  if(!process.env.SATCHEL_SCREENSHOTS)return;
  await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});
  for(const proofWidth of [1440,390]){await target.setViewportSize({width:proofWidth,height:proofWidth===390?844:1000});await section.scrollIntoViewIfNeeded();assert.equal(await target.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);await section.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+proofWidth+'-'+name+'.png'});}
  await target.setViewportSize({width,height:width===390?844:1000});
 }
}
