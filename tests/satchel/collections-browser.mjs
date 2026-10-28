import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
export async function collectionsBrowser(h,m,bill){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});await context.addCookies(h.owner.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin,secure:true};}));
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(h.origin+'/app');
  if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);
  const panel=page.getByRole('region',{name:'Collections',exact:true});await panel.getByText('Retainer replenishment · Balance requires review',{exact:true}).waitFor();
  assert.match(await panel.innerText(),/void/);assert.match(await panel.innerText(),/\$100.00 remaining/);assert.match(await panel.innerText(),/Responsible owner/);
  await panel.getByText('Schedule and collection history',{exact:true}).first().click();await panel.getByRole('heading',{name:'Contact attempts'}).first().waitFor();assert.match(await panel.innerText(),/Step 2/);
  await panel.getByText('Receivables aging queue',{exact:true}).click();
  await panel.getByText('Start a collection sequence',{exact:true}).click();
  await panel.getByLabel('Invoice to collect',{exact:true}).selectOption(bill.id);await panel.getByLabel('Collection recipient email').fill(['client','example.test'].join('@'));await panel.getByLabel('First contact date and time (local time)').fill('2030-05-01T12:00');await panel.getByLabel('Reason for collection',{exact:true}).fill('Counsel approves the exact client reminder schedule on screen');await panel.getByRole('checkbox').check();
  if(width===1440){await panel.getByRole('button',{name:'Start collection sequence',exact:true}).click();await page.getByRole('status').getByText('Collection sequence started',{exact:true}).waitFor();}
  const record=panel.getByRole('article',{name:'Collection for '+bill.number,exact:true});await record.getByText('Record reply or collection decision',{exact:true}).click();await record.getByLabel('Reply or decision',{exact:true}).selectOption(width===1440?'dispute':'hardship');await record.getByLabel('Reply or decision note',{exact:true}).fill('Counsel routes this client reply for human resolution');await record.getByRole('button',{name:'Record collection action',exact:true}).click();await record.locator('.badge').getByText('paused',{exact:true}).waitFor();
  await record.getByLabel('Reply or decision',{exact:true}).selectOption('clear');await record.getByLabel('Reply or decision note',{exact:true}).fill('Responsible counsel cleared the reply and approves continuation');await record.getByRole('button',{name:'Record collection action',exact:true}).click();await record.locator('.badge').getByText('active',{exact:true}).waitFor();
  if(width===1440)await h.scheduled('2030-05-01T12:00:00.000Z');await record.getByRole('button',{name:'Send due collection step',exact:true}).click();await page.getByRole('status').getByText('Due collection step checked',{exact:true}).waitFor();await record.getByText(/Step 2 of 3/).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  assert.deepEqual(await panel.locator('button,a[href],[role=button]').evaluateAll(es=>es.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[]);
  assert.deepEqual(await panel.locator('*').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName)),[]);
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await panel.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/collections-'+width+'.png'});}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Firm',exact:true}).click();const settings=page.getByRole('region',{name:'Client reminder settings'});await settings.getByText('Templates and matter collection authority',{exact:true}).click();await settings.getByLabel('Matter for client reminder authority').selectOption(m.id);await settings.getByRole('button',{name:'Authorize client reminders'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  const authority=settings.locator('form').filter({has:page.getByRole('button',{name:'Authorize client reminders',exact:true})});await authority.getByLabel('Counsel authority decision reason').fill('Responsible counsel confirms these exact templates and contact limits');await authority.getByRole('checkbox').check();if(width===390){await authority.getByRole('button',{name:'Authorize client reminders',exact:true}).click();await page.getByRole('status').getByText('Matter client reminder authority recorded',{exact:true}).waitFor();}
  if(process.env.SATCHEL_SCREENSHOTS)await settings.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/collection-settings-'+width+'.png'});
  await context.close();
 }}finally{await browser.close();}
}
