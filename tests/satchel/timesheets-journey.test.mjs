import {bulkRevenueJourney} from './bulk-revenue-journey.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
const form=(p,name)=>p.locator('form',{has:p.getByRole('button',{name,exact:true})});
test('TIME-001 timer started on a 390px phone, resumed and switched at 1440px, day reviewed with UTBMS codes and posted once',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const a=await open(h,'Harper v. Reed','Harper family','Reed Logistics'),b=await open(h,'Pine estate','Pine family','Elm Trustee');
  const phone=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true}),errors=[];let page=await phone.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,level:1,exact:true}).waitFor();};
  const done=async text=>page.getByRole('status').getByText(text,{exact:true}).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${name}.png`,fullPage:true});}};
  const timers=()=>page.locator('section.panel',{has:page.getByRole('heading',{name:'Timers',exact:true})});
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');await page.getByLabel('Current matter').selectOption(a.id);
  await form(page,'Start timer').getByLabel('What you are working on').fill('Draft complaint');await form(page,'Start timer').getByRole('button',{name:'Start timer'}).click();await done('Timer started');
  await timers().getByRole('article',{name:'Timer '+a.matter_number}).getByText(/^Running since/).waitFor();await shot('390-timer-running');
  await timers().getByRole('article',{name:'Timer '+a.matter_number}).getByRole('button',{name:'Pause'}).click();await done('Timer paused; interval drafted');

  // The same person continues on a desktop browser: the timer lives on the server.
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true,storageState:await phone.storageState()});await phone.close();
  page=await desktop.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');
  const timerA=timers().getByRole('article',{name:'Timer '+a.matter_number});await timerA.getByText(/^Paused/).waitFor();await timerA.getByRole('button',{name:'Resume'}).click();await done('Timer resumed');await timerA.getByText(/^Running since/).waitFor();
  await page.getByLabel('Current matter').selectOption(b.id);const start=form(page,'Start timer');await start.getByLabel('What you are working on').fill('Estate inventory');await start.getByLabel('Billable work').uncheck();await start.getByRole('button',{name:'Start timer'}).click();await done('Timer started');
  await timers().getByText(`Paused ${a.matter_number} · Draft complaint so timers never overlap.`,{exact:true}).waitFor();await timerA.getByText(/^Paused/).waitFor();
  await timers().getByRole('article',{name:'Timer '+b.matter_number}).getByRole('button',{name:'Stop'}).click();await done('Timer stopped');

  // Review the drafted day: three intervals, one edited, one rejected, then Post day.
  const sheet=page.locator('section.panel',{has:page.getByRole('heading',{name:'Weekly timesheet',exact:true})});
  const drafts=sheet.getByRole('article',{name:`Draft ${a.matter_number} Draft complaint`});await drafts.nth(1).waitFor();
  const today=(await h.json('/time',undefined,h.owner)).days.find(d=>d.drafts.length).date,dayGroup=sheet.getByRole('group',{name:'Day '+today});
  assert.equal(await dayGroup.getByRole('article').count(),3);
  const firstDraft=drafts.first(),edit=firstDraft.locator('form');await edit.getByLabel('Time spent (min)').fill('45');await edit.getByLabel('UTBMS task').fill('L110');await edit.getByLabel('UTBMS activity').fill('A101');await edit.getByRole('button',{name:'Save draft'}).click();await done('Draft saved');
  await drafts.nth(1).getByRole('button',{name:'Reject draft'}).click();await done('Draft rejected');
  await dayGroup.getByRole('heading',{name:`${today} · 0 h 46 min · $240.00 billable`,exact:true}).waitFor();
  await drafts.first().getByText('45 min (billed 48) · billable · timer · draft · L110 · A101 · $240.00',{exact:true}).waitFor();await shot('1440-day-review');
  await dayGroup.getByRole('button',{name:'Post day '+today}).click();await done('Day posted');
  await drafts.first().getByText('45 min (billed 48) · billable · timer · posted · L110 · A101 · $240.00',{exact:true}).waitFor();
  await sheet.getByRole('article',{name:`Draft ${b.matter_number} Estate inventory`}).getByText(/nonbillable · timer · posted/).waitFor();
  await drafts.nth(1).getByText(/· rejected ·/).waitFor();assert.equal(await dayGroup.getByRole('button',{name:'Post day '+today}).count(),0);
  await sheet.getByRole('button',{name:'Submit week'}).click();await done('Week submitted');
  await page.getByLabel('Current matter').selectOption(a.id);const unbilled=page.locator('section.panel',{has:page.getByRole('heading',{name:'Unbilled work',exact:true})});
  await unbilled.getByRole('cell',{name:'$240.00'}).waitFor();assert.equal(await unbilled.getByRole('row').count(),2);await shot('1440-posted');
  await page.getByLabel('Current matter').selectOption(b.id);await unbilled.getByText('Nonbillable time recorded, never billed: 1 entry',{exact:true}).waitFor();
  const entries=(await h.json('/matters/'+a.id+'/billing',undefined,h.owner)).entries;assert.deepEqual(entries.map(e=>[e.minutes,e.amountCents,e.utbmsTask,e.utbmsActivity,e.createdBy]),[[45,24000,'L110','A101','owner@example.test']]);
  await bulkRevenueJourney(h,page);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
