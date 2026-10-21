import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {selectExemptTax} from './tax-fixture.mjs';
import {readXml} from './ledes-xml-reader.mjs';
import {harness,open} from './harness.mjs';
import {draft,reviewed,insurer} from './invoice-numbering-fixture.mjs';
for(const width of [1440,390])test(`BILL-015 configure scheme, issue prospective and reserved legacy bills with frozen PDF/LEDES/XML at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(String(e)));
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}};
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup|\/app/);
  if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const billing=async()=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);await page.getByRole('heading',{name:'Invoice numbering',exact:true}).waitFor();};
  const insurance=await insurer(h),reserved=await draft(h,insurance,'Reserved Harbor Mutual prebill'),reservedNumber=reserved.snapshot.ledes.invoiceNumber;
  await billing();await page.getByText('Configure invoice scheme',{exact:true}).click();await page.getByLabel('Invoice prefix',{exact:true}).fill('BL');await page.getByLabel('Next invoice counter',{exact:true}).fill('100');await shot('scheme-form');
  await page.getByRole('button',{name:'Save invoice scheme',exact:true}).click();await page.getByRole('status').getByText('Invoice scheme saved; legacy numbers retained',{exact:true}).waitFor();await page.getByText(/Scheme version 1 · next counter 100/).waitFor();await shot('saved-scheme');
  const d=await draft(h,m,'Barton Workshop lease review');await page.reload();await billing();await page.getByText('Draft ID: '+d.id+' · no invoice number assigned',{exact:true}).waitFor();await shot('unnumbered-draft');
  const approved=await reviewed(h,m,d);await page.reload();await billing();await page.getByRole('button',{name:'Issue exact approved invoice',exact:true}).click();await page.getByRole('status').getByText('Invoice issued; exact reviewed PDF retained',{exact:true}).waitFor();await page.getByText(/Scheme version 1 · next counter 101/).waitFor();
  const bill=page.locator('article.record').filter({has:page.getByText('Barton Workshop lease review · $375.00',{exact:true})});await bill.getByText(/BL-\d{4}-00100/).waitFor();await shot('issued-invoice');
  const [download]=await Promise.all([page.waitForEvent('download'),bill.getByRole('link',{name:'Download issued PDF',exact:true}).click()]);const chunks=[];for await(const c of await download.createReadStream())chunks.push(c);const bytes=Buffer.concat(chunks);assert.match(bytes.toString('ascii',0,8),/^%PDF-/);
  const listing=await h.json('/matters/'+m.id+'/billing',undefined,h.owner),retained=listing.bills.find(b=>b.id===d.id);assert.equal(retained.issue.approved_digest,approved.artifactDigest);assert.equal(retained.artifact,approved.artifact);assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+d.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),bytes);assert.deepEqual(errors,[]);
  // BILL-015/TIME-007: issue a pre-cutover reservation through the same screen.
  await page.getByLabel('Current matter').selectOption(insurance.id);
  const legacy=page.locator('article.record').filter({has:page.locator('strong').filter({hasText:/^Reserved Harbor Mutual prebill ·/})});
  await selectExemptTax(h,page,legacy);await legacy.getByLabel('Review note',{exact:true}).fill('Reviewed reserved number, exact exemption and both insurer formats');
  await legacy.getByRole('button',{name:'Approve exact bill',exact:true}).click();await page.getByRole('status').getByText('Bill approved. The reviewed package is ready to export.',{exact:true}).waitFor();
  await legacy.getByRole('button',{name:'Download reviewed CSV',exact:true}).click();await page.getByRole('alert').getByText('Issue the approved bill before exporting',{exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await legacy.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-legacy-before-issue.png`});
  await legacy.getByRole('button',{name:'Issue exact approved invoice',exact:true}).click();await page.getByRole('status').getByText('Invoice issued; exact reviewed PDF retained',{exact:true}).waitFor();
  await legacy.getByText(reservedNumber,{exact:true}).waitFor();await legacy.getByRole('button',{name:'Download LEDES 1998B',exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await legacy.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-legacy-issued.png`});
  for(const name of ['Download LEDES 1998B','Download LEDES XML 2.1.3']){
   const [file]=await Promise.all([page.waitForEvent('download'),legacy.getByRole('button',{name,exact:true}).click()]);const chunks=[];for await(const c of await file.createReadStream())chunks.push(c);const content=Buffer.concat(chunks).toString();
   if(name.includes('XML'))assert.equal(readXml(content).invoice.inv_id,reservedNumber);else assert.ok(content.includes('|'+reservedNumber+'|'));
  }
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,101);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
