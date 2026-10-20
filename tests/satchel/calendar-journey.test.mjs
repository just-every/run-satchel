import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function notice(page,text){await page.getByRole('status').getByText(text).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`CAL-001 book a recurring conference across daylight saving, invite two staff, cancel one occurrence and compare matter and firm views at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@bartonlee.example',phone:'2125550100',address,timezone:'America/New_York',currency:'USD',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Manhattan',phone:'2125550100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  for(const [email,name,role] of [['lawyer@example.test','Marcus Lee','lawyer'],['assistant@example.test','Dana Ortiz','assistant']]){await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  const m=await open(h);for(const email of ['lawyer@example.test','assistant@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  async function shot(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
  await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('heading',{level:1,name:'Calendar',exact:true}).waitFor();
  const book=page.getByRole('form',{name:'Book appointment'});
  await book.getByLabel('Appointment title').fill('Weekly status conference');await book.getByLabel('First date').fill('2026-10-26');await book.getByLabel('Start time').fill('10:00');await book.getByLabel('Duration in minutes').fill('45');await book.getByLabel('Number of occurrences').fill('3');
  await book.getByLabel('Video link').fill('https://meet.example.test/barton-status');await book.getByLabel('Marcus Lee').check();await book.getByLabel('Dana Ortiz').check();
  await book.getByRole('button',{name:'Check availability'}).click();await notice(page,'Availability shown');
  await book.getByRole('button',{name:'Book appointment'}).click();await notice(page,'Appointment booked');
  const matterPanel=page.locator('section',{has:page.getByRole('heading',{name:'Matter appointments',exact:true})});
  for(const day of ['2026-10-26','2026-11-02','2026-11-09'])await matterPanel.getByText(`${day} 10:00 America/New_York`,{exact:true}).waitFor();
  await matterPanel.getByText('Attendees: Dana Ortiz, Marcus Lee').waitFor();
  await matterPanel.getByText('Change occurrence 2').click();const cancel=matterPanel.locator('form',{has:page.getByRole('button',{name:'Cancel occurrence 2',exact:true})});await cancel.getByLabel('Cancellation reason').fill('Court closed for election day');await cancel.getByRole('button',{name:'Cancel occurrence 2'}).click();await notice(page,'Occurrence cancelled');
  await matterPanel.getByText('cancelled by owner@example.test: Court closed for election day').waitFor();await shot('calendar-matter');
  const firmPanel=page.locator('section',{has:page.getByRole('heading',{name:'Firm calendar',exact:true})});
  await firmPanel.getByLabel('From').fill('2026-10-26');await firmPanel.getByLabel('To').fill('2026-11-09');await firmPanel.getByRole('button',{name:'Show firm calendar'}).click();
  await firmPanel.getByText('Matter '+m.matter_number,{exact:true}).waitFor();
  // The firm view refreshes after the cancellation; compare once its cancelled occurrence has arrived.
  await firmPanel.locator('ol.occurrences > li',{hasText:'2026-11-02 10:00'}).locator('.badge',{hasText:'cancelled'}).waitFor();
  const rows=panel=>panel.locator('ol.occurrences > li').evaluateAll(items=>items.map(li=>[li.querySelector('span').textContent,li.querySelector('.badge').textContent]));
  const expected=[['2026-10-26 10:00 America/New_York','scheduled'],['2026-11-02 10:00 America/New_York','cancelled'],['2026-11-09 10:00 America/New_York','scheduled']];
  assert.deepEqual(await rows(matterPanel),expected);assert.deepEqual(await rows(firmPanel),expected,'Firm view matches the matter view');
  await shot('calendar-firm');
  const api=await h.json('/calendar?from=2026-10-26&to=2026-11-09',undefined,h.owner);assert.deepEqual(api.appointments[0].occurrences.map(o=>[o.start,o.status]),[['2026-10-26T14:00:00.000Z','scheduled'],['2026-11-02T15:00:00.000Z','cancelled'],['2026-11-09T15:00:00.000Z','scheduled']]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
