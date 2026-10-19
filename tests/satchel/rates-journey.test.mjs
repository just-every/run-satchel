import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
test('TIME-003 client override and future rate set at 1440px, work recorded either side, budget crossed and the alert inspected at 1440px and 390px',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const a=await open(h,'Harper v. Reed','Harper family','Reed Logistics');
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),errors=[];let page=await desktop.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,level:1,exact:true}).waitFor();};
  const done=async text=>page.getByRole('status').getByText(text,{exact:true}).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${name}.png`,fullPage:true});}};
  const fees=()=>page.locator('section.panel',{has:page.getByRole('heading',{name:'Fee agreement and budget',exact:true})});
  const opened=async(scope,summary)=>{const d=scope.locator('details',{has:page.getByText(summary,{exact:true})});if(!await d.evaluate(e=>e.open))await d.locator('summary').click();return d;};
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');await page.getByLabel('Current matter').selectOption(a.id);
  await fees().getByText('Firm default $300.00 per hour · 6-minute increment.',{exact:false}).waitFor();

  // A client override from October and a future rate change from November.
  for(const [from,cents,note] of [['2026-10-01','25000','Harper engagement letter'],['2026-11-01','27500','Harper rate increase']]){
   const add=await opened(fees(),'Add a rate');await add.getByLabel('Applies to').selectOption('client');await add.getByLabel('Effective from').fill(from);await add.getByLabel('Hourly rate (USD cents)').fill(cents);await add.getByLabel('Agreement reference').fill(note);await add.getByRole('button',{name:'Add rate'}).click();await done('Rate added');
   await fees().getByRole('article',{name:'Rate Client Harper family from '+from}).waitFor();
  }
  await fees().getByRole('article',{name:'Rate Client Harper family from 2026-11-01'}).getByText('From 2026-11-01 · $275.00 per hour · 6-minute increment',{exact:true}).waitFor();
  const budget=await opened(fees(),'Set budget');await budget.getByLabel('Budget (USD cents)').fill('40000');await budget.getByLabel('Alert at (% of budget)').fill('50');await budget.getByLabel('Budget note').fill('Client approved budget');await budget.getByRole('button',{name:'Set budget'}).click();await done('Budget set');
  await fees().getByText('Budget $400.00 · $0.00 recorded billable · $400.00 remaining · alert at 50% (version 1)',{exact:true}).waitFor();

  // Record work either side of the change on the weekly timesheet; the firm increment bills 50 minutes as 54.
  const sheet=page.locator('section.panel',{has:page.getByRole('heading',{name:'Weekly timesheet',exact:true})});await sheet.getByLabel('Week of').fill('2026-10-26');await sheet.getByText(/^Week 2026-10-26 to 2026-11-01/).waitFor();
  for(const [day,work] of [['2026-10-30','Draft motion'],['2026-11-01','Hearing preparation']]){
   const add=await opened(sheet,'Add time to the timesheet');await add.getByLabel('Day worked').fill(day);await add.getByLabel('Time spent (min)').fill('50');await add.getByLabel('Work performed').fill(work);await add.getByRole('button',{name:'Add to timesheet'}).click();await done('Time added to the timesheet');
  }
  await sheet.getByRole('article',{name:`Draft ${a.matter_number} Draft motion`}).getByText('50 min (billed 54) · billable · timesheet · draft · $225.00',{exact:true}).waitFor();
  await sheet.getByRole('article',{name:`Draft ${a.matter_number} Hearing preparation`}).getByText('50 min (billed 54) · billable · timesheet · draft · $247.50',{exact:true}).waitFor();await shot('1440-rates-drafts');
  await sheet.getByRole('button',{name:'Submit week'}).click();await done('Week submitted');
  const unbilled=page.locator('section.panel',{has:page.getByRole('heading',{name:'Unbilled work',exact:true})});await unbilled.getByRole('cell',{name:'$225.00'}).waitFor();await unbilled.getByRole('cell',{name:'$247.50'}).waitFor();
  await fees().getByText('Budget $400.00 · $472.50 recorded billable · $72.50 over · alert at 50% (version 1)',{exact:true}).waitFor();
  const alert='Budget exceeded: $472.50 of $400.00 recorded';await fees().getByRole('alert').filter({hasText:alert}).waitFor();await fees().getByRole('alert').filter({hasText:'Budget alert threshold reached: $472.50 of $400.00 recorded'}).waitFor();await shot('1440-rates-alert');

  // The same agreement, charges and alert on a phone.
  const phone=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,storageState:await desktop.storageState()});await desktop.close();
  page=await phone.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');await page.getByLabel('Current matter').selectOption(a.id);
  await fees().getByRole('alert').filter({hasText:alert}).waitFor();await fees().getByRole('article',{name:'Rate Client Harper family from 2026-10-01'}).waitFor();
  await page.locator('section.panel',{has:page.getByRole('heading',{name:'Unbilled work',exact:true})}).getByRole('cell',{name:'$247.50'}).waitFor();await shot('390-rates-alert');
  const entries=(await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries;assert.deepEqual(entries.map(e=>[e.date,e.minutes,e.billedMinutes,e.rateCents,e.amountCents,e.rateSource]),[['2026-10-30',50,54,25000,22500,'rule'],['2026-11-01',50,54,27500,24750,'rule']]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
