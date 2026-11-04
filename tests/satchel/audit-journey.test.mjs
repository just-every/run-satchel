import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {auditedTransfer} from './audit-fixture.mjs';
import {authorizeAgent} from './agent-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';
import {exerciseLegacyAttribution} from './legacy-attribution-browser.mjs';
const form=(p,n)=>p.locator('form',{has:p.getByRole('button',{name:n,exact:true})});
for(const [width,height] of [[1440,1000],[390,844]])test(`FIRM-005 filter, inspect source/decision and download the transfer action audit at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{
  const f=await auditedTransfer(h),context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();await page.getByRole('heading',{name:'Action audit',exact:true}).waitFor();
  const filter=form(page,'Filter action audit'),day=new Date().toISOString().slice(0,10);await filter.locator('select[name="matterId"]').selectOption(f.m.id);await filter.getByLabel('From date (UTC)').fill(day);await filter.getByLabel('Through date (UTC)').fill(day);await filter.getByLabel('Exact action (optional)').fill('trust.transfer_bank_cleared');await filter.getByRole('button',{name:'Filter action audit',exact:true}).click();await page.getByText(/^1 matching actions/).waitFor();const audit=page.locator('section',{has:page.getByRole('heading',{name:'Action audit',exact:true})});await audit.locator('summary').click();await audit.getByText(/owner · person/).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await audit.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-action-audit.png`});}
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download matching audit JSONL'}).click();const download=await downloadPromise,stream=await download.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);const rows=Buffer.concat(chunks).toString().trim().split('\n').map(JSON.parse);assert.equal(rows.length,1);assert.equal(rows[0].action,'trust.transfer_bank_cleared');assert.equal(rows[0].detail.bankReference,'BANK-AUDIT-001');assert.equal(rows[0].evidence.record.payment.cents,100000);
  const key=await h.json('/keys',{label:'Audit preparation assistant'},h.owner),{auth}=await authorizeAgent(h,key,f.m.id),preparation=await h.json('/agent/prepare-deadline',{matterId:f.m.id,title:'Retained audit attribution',date:'2027-03-15',timezone:'America/New_York',source:'Reviewed client record'},'',200,auth);
  await h.json('/proposals/'+preparation.id+'/decide',{decision:'decline',reason:'A signed-in person declined this suggestion'},h.owner);
  await filter.getByLabel('Exact action (optional)').fill('proposal.prepared');await filter.getByRole('button',{name:'Filter action audit',exact:true}).click();await audit.getByText(/^1 matching actions/).waitFor();
  await audit.locator('summary').filter({hasText:preparation.preparedBy.label}).click();await audit.getByText('Prepared by: '+preparation.preparedBy.label,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,audit,process.env.SATCHEL_SCREENSHOTS,`agent-action-audit-${width}`);
  const attributionDownload=page.waitForEvent('download');await audit.getByRole('link',{name:'Download matching audit JSONL'}).click();const attributionStream=await(await attributionDownload).createReadStream(),attributionChunks=[];for await(const chunk of attributionStream)attributionChunks.push(chunk);const attributionRows=Buffer.concat(attributionChunks).toString().trim().split('\n').map(JSON.parse);assert.equal(attributionRows.length,1);assert.deepEqual(attributionRows[0].preparedBy,preparation.preparedBy);assert.equal(attributionRows[0].actor.channel,'agent');
  await filter.getByLabel('Exact action (optional)').fill('proposal.declined');await filter.getByRole('button',{name:'Filter action audit',exact:true}).click();await audit.locator('summary').filter({hasText:'proposal.declined'}).click();await audit.getByText('Original preparation: '+preparation.preparedBy.label,{exact:true}).waitFor();await audit.getByText(/owner · person/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,audit,process.env.SATCHEL_SCREENSHOTS,`agent-decision-audit-${width}`);
  await exerciseLegacyAttribution(browser,h,width);
  const actor=(await h.json('/state',undefined,h.owner)).actor,custodianEmail=['synthetic-satchel-33','example.test'].join('@');
  await h.json('/team',{email:custodianEmail,name:'Separate matter custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:custodianEmail},h.owner);await h.login(custodianEmail);
  await h.json('/matters/'+f.m.id+'/wall',{custodianEmail,members:[],reason:'Changed current wall excludes the original sponsor',revision:null},h.owner);
  // The current filter is rechecked on each request and on export.
  await filter.getByRole('button',{name:'Filter action audit',exact:true}).click();await page.getByRole('alert').filter({hasText:'Matter not found'}).waitFor();assert.equal(await audit.locator('summary').count(),0);
  assert.equal((await h.request('/api/satchel/audit/export?matterId='+f.m.id,undefined,h.owner)).status,404);assert.equal((await h.json('/state',undefined,h.owner)).proposals.filter(p=>p.id===preparation.id).length,0);
  assert.ok(actor.id);if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,audit,process.env.SATCHEL_SCREENSHOTS,`agent-audit-refused-${width}`);
 }finally{await browser.close();await h.close();}
});
