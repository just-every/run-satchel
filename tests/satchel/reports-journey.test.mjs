import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {reportFoundation,csvRows} from './report-fixture.mjs';
async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup|\/app/);
 if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Jordan Lee');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
 await page.getByRole('heading',{name:'Matters',level:1,exact:true}).waitFor();
}
for(const [width,height] of [[1440,1000],[390,844]])test(`REPORT-001 an attorney filters Litigation, drills an overdue source, downloads matching CSV and inspects outcomes and lead practice at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{
  const f=await reportFoundation(h),context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  const shot=async(locator,name)=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await locator.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`});}};
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,level:1,exact:true}).waitFor();};
  await signIn(page,h,'lawyer@example.test');await tab('Reports');await page.getByText(/permitted matters in this cohort/).waitFor();
  await page.getByLabel('Report practice',{exact:true}).selectOption('LIT');await page.getByLabel('Report owner',{exact:true}).selectOption('lawyer@example.test');
  await page.getByRole('button',{name:'Apply report filters',exact:true}).click();await page.getByText('2 permitted matters in this cohort',{exact:false}).waitFor();
  for(const name of ['Case status','Stage duration','Legal outcomes','Lead conversion','Evidence gaps','Deadlines','Workload'])await page.getByRole('heading',{name,level:2,exact:true}).waitFor();
  assert.ok(!(await page.locator('main').innerText()).includes(f.hidden.title));await shot(page.locator('main'),'reports-overview');
  await page.getByRole('button',{name:'Show Deadlines',exact:true}).click();await page.getByRole('heading',{name:'Deadlines details',exact:true}).waitFor();
  const rows=page.getByRole('region',{name:'Deadlines report rows'});await rows.getByText('Discovery response due',{exact:true}).waitFor();await rows.getByRole('cell',{name:'Overdue',exact:true}).waitFor();assert.equal(await rows.locator('tbody tr').count(),1);await shot(rows,'reports-overdue');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export Deadlines',exact:true}).click()]);const chunks=[];for await(const c of await download.createReadStream())chunks.push(c);const csv=csvRows(Buffer.concat(chunks).toString('utf8'));assert.deepEqual(csv.map(r=>[r.id,r.title]),[[f.deadline.id,'Discovery response due']]);
  await rows.getByRole('button',{name:'Open matter '+f.active.matter_number,exact:true}).click();await page.getByRole('heading',{name:'Matters',level:1,exact:true}).waitFor();assert.equal(await page.getByLabel('Current matter').inputValue(),f.active.id);
  const leads=page.locator('section.panel',{has:page.getByRole('heading',{name:'Lead pipeline',exact:true})});await leads.getByText('Add a lead',{exact:true}).click();const add=leads.locator('form',{has:page.getByRole('button',{name:'Add lead',exact:true})});await add.getByLabel('Practice area',{exact:true}).selectOption('LIT');await add.getByLabel('Prospect name',{exact:true}).fill('Taylor litigation inquiry');await add.getByLabel('Inquiry summary').fill('Advice about a commercial contract dispute');await add.getByLabel('Referral source').fill('Client referral');await shot(add,'lead-practice');await add.getByRole('button',{name:'Add lead',exact:true}).click();await page.getByRole('status').getByText('Lead added',{exact:true}).waitFor();await leads.getByRole('article',{name:'Lead Taylor litigation inquiry',exact:true}).getByText(/^LIT ·/).waitFor();
  await tab('Reports');await page.getByText(/permitted matters in this cohort/).waitFor();await page.getByLabel('Report practice').selectOption('LIT');await page.getByLabel('Report owner').selectOption('lawyer@example.test');await page.getByRole('button',{name:'Apply report filters'}).click();await page.getByText('2 permitted matters in this cohort',{exact:false}).waitFor();await page.getByRole('button',{name:'Show Legal outcomes',exact:true}).click();const outcome=page.getByRole('region',{name:'Legal outcomes report rows'});await outcome.getByRole('cell',{name:'Settled',exact:true}).waitFor();await shot(outcome,'reports-outcomes');
  await page.getByRole('button',{name:'Show Lead conversion',exact:true}).click();const conversion=page.getByRole('region',{name:'Lead conversion report rows'});await conversion.getByText('Dana unclassified inquiry',{exact:true}).waitFor();await conversion.getByRole('cell',{name:'No practice',exact:true}).first().waitFor();await shot(conversion,'reports-conversion');assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
