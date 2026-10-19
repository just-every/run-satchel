import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
const form=(p,name)=>p.locator('form',{has:p.getByRole('button',{name,exact:true})});
for(const [width,height] of [[1440,1000],[390,844]])test(`MATTER-001 litigation template, typed matter fields and docket citation at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'},{code:'EST',name:'Estates'}]}},h.owner);
  const search=await h.json('/conflicts',{client:'Harper family',adverse:'Reed Logistics'},h.owner),m=await h.json('/matters',{title:'Harper v. Reed',practiceCode:'LIT',conflictId:search.id,reviewNote:'Reviewed',confirmed:true},h.owner);
  const order=await h.json('/matters/'+m.id+'/documents',{name:'Scheduling order.txt',mime:'text/plain',contentBase64:Buffer.from('Scheduling order\n¶ 4. Fact discovery shall close on November 14, 2026.').toString('base64'),visibility:'matter'},h.owner);
  const deadline=await h.json('/matters/'+m.id+'/deadlines',{title:'Fact discovery closes',date:'2026-11-14',timezone:'America/New_York',source:'Scheduling order ¶ 4',documentId:order.id,version:1},h.owner);await h.json('/deadlines/'+deadline.id+'/confirm',{revision:deadline.revision,note:'Checked against order'},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const done=async text=>page.getByRole('status').getByText(text).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}};
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await page.getByLabel('Current matter').selectOption(m.id);
  const panel=page.locator('section.panel',{has:page.getByRole('heading',{name:'Matter type and fields',exact:true})});await panel.getByText('Matter type: None',{exact:true}).waitFor();
  await panel.getByText('Configure matter types').click();const create=form(page,'Create matter type');
  await create.getByLabel('Matter type name').fill('Civil litigation');await create.getByLabel('Practice area').selectOption('LIT');await create.getByLabel('Case number').check();await create.getByLabel('Court',{exact:true}).check();
  await create.getByLabel(/Custom fields, one per line/).fill('Jury demanded | yesno | required\nClaim value | money | optional');await create.getByLabel('Required record types, separated by commas').fill('Complaint');
  await create.getByRole('button',{name:'Create matter type'}).click();await done('Matter type created');
  const fields=form(page,'Save matter fields');await fields.getByRole('combobox',{name:/^Matter type/}).selectOption({label:'LIT · Civil litigation · version 1'});
  await fields.getByLabel('Case number').fill('1:26-cv-04417');await fields.getByLabel('Court',{exact:true}).fill('S.D.N.Y.');await fields.getByLabel('Jury demanded').selectOption('yes');await fields.getByLabel('Claim value').fill('lots');
  await fields.getByRole('button',{name:'Save matter fields'}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Claim value must be US dollars/);
  await fields.getByLabel('Claim value').fill('250000.00');await fields.getByRole('button',{name:'Save matter fields'}).click();await done('Matter fields saved');
  await panel.getByText('Matter type: Civil litigation · version 1',{exact:true}).waitFor();await panel.getByText('Complaint: missing',{exact:true}).waitFor();
  const docket=panel.getByRole('article',{name:'Docket'});
  for(const text of ['S.D.N.Y.','1:26-cv-04417','Reed Logistics','2026-11-14 · America/New_York · confirmed','Citation: Scheduling order ¶ 4'])await docket.getByText(text,{exact:true}).waitFor();
  const source=docket.getByRole('link',{name:'Scheduling order.txt · version 1',exact:true});await source.scrollIntoViewIfNeeded();await shot('matter-docket');
  const file=await page.request.get(h.origin+await source.getAttribute('href'));assert.equal(file.status(),200);assert.match(await file.text(),/¶ 4\. Fact discovery shall close on November 14, 2026\./);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
