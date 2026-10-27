import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';

for(const width of [390])test(`TIME-006 record a receipt-backed expense and reconcile its imported reference at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Harper estate administration','Harper family','Elm Trustee'),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup|\/app/);
  if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const tab=async name=>page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();
  await tab('Documents');await page.getByLabel('Current matter').selectOption(m.id);
  const receipt=Buffer.from('County Court receipt 8841: estate filing fee USD 125.00');
  await page.getByLabel('Original file').setInputFiles({name:'court-filing-8841.txt',mimeType:'text/plain',buffer:receipt});await page.getByRole('button',{name:'Save original',exact:true}).click();await page.getByRole('status').getByText('Original saved; version history retained',{exact:true}).waitFor();
  await tab('Time & bills');
  const form=page.locator('form',{has:page.getByRole('button',{name:'Record entry',exact:true})});
  await form.getByLabel('Entry type').selectOption('disbursement');await form.getByLabel('Date',{exact:true}).fill('2026-10-20');await form.getByLabel('Description',{exact:true}).fill('Estate filing advanced by firm');await form.getByLabel('Amount (USD cents)').fill('12500');await form.getByLabel('Expense category').selectOption('advanced_cost');await form.getByLabel('Vendor',{exact:true}).fill('County Court');await form.getByLabel('Vendor reference',{exact:true}).fill('Court receipt 8841');await form.getByLabel('Accounting code').fill('Advanced client costs');await form.getByLabel('Imported reference system (optional)').fill('InfoTrack imported report');await form.getByLabel('Imported reference ID (optional)').fill('filing-8841');
  await form.getByLabel('Receipt (optional)').selectOption({label:'court-filing-8841.txt · court-filing-8841.txt · version 1'});
  const shot=async(name,locator)=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await locator.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`});}};
  await shot('expense-form',form);
  await form.getByRole('button',{name:'Record entry',exact:true}).click();await page.getByRole('status').getByText('Entry recorded',{exact:true}).waitFor();
  const panel=page.locator('section.panel',{has:page.getByRole('heading',{name:'Expense provenance',exact:true})});await panel.getByText('Estate filing advanced by firm · $125.00',{exact:true}).waitFor();
  const [file]=await Promise.all([page.waitForEvent('download'),panel.getByRole('link',{name:'Download receipt · version 1',exact:true}).click()]);const chunks=[];for await(const c of await file.createReadStream())chunks.push(c);assert.deepEqual(Buffer.concat(chunks),receipt);
  // The unchanged source reference reconciles to the same entry, even from UI.
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/billing')&&r.status()===200),form.getByRole('button',{name:'Record entry',exact:true}).click()]);
  await panel.getByText('Estate filing advanced by firm · $125.00',{exact:true}).waitFor();assert.equal(await panel.locator('article.record').count(),1);
  await form.getByLabel('Expense category').selectOption('overhead');await form.getByLabel('Description',{exact:true}).fill('Office stationery');await form.getByLabel('Imported reference ID (optional)').fill('office-120');await form.getByLabel('Receipt (optional)').selectOption('');
  await form.getByRole('button',{name:'Record entry',exact:true}).click();await panel.getByText('Office stationery · $125.00',{exact:true}).waitFor();
  const unbilled=page.locator('section.panel',{has:page.getByRole('heading',{name:'Unbilled work',exact:true})});assert.equal(await unbilled.getByRole('row').count(),2);await unbilled.getByRole('row',{name:/Estate filing advanced by firm/}).waitFor();assert.equal(await unbilled.getByRole('row',{name:/Office stationery/}).count(),0);
  await shot('expense-provenance',panel);
  const entries=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).entries;assert.equal(entries.length,2);assert.equal(entries.find(e=>e.expense.sourceId==='office-120').billable,false);assert.equal(entries.find(e=>e.expense.sourceId==='filing-8841').expense.receipt.version,1);
  await page.reload();await tab('Time & bills');await panel.getByText('Office stationery · $125.00',{exact:true}).waitFor();assert.equal(await panel.locator('article.record').count(),2);assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
