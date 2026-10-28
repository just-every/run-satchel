import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
export async function collectionsBrowser(h,m){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});await context.addCookies(h.owner.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin,secure:true};}));
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(h.origin+'/app');
  if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);
  const panel=page.getByRole('region',{name:'Collections',exact:true});await panel.getByText('Retainer replenishment · Balance requires review',{exact:true}).waitFor();
  await panel.getByText('Invoice to void',{exact:false}).count();assert.match(await panel.innerText(),/void/);assert.match(await panel.innerText(),/\$100.00 remaining/);assert.match(await panel.innerText(),/Responsible owner/);
  await panel.getByText('Schedule and collection history',{exact:true}).first().click();await panel.getByRole('heading',{name:'Contact attempts'}).first().waitFor();assert.match(await panel.innerText(),/Step 2/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  assert.deepEqual(await panel.locator('button,a[href],[role=button]').evaluateAll(es=>es.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[]);
  assert.deepEqual(await panel.locator('*').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName)),[]);
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await panel.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/collections-'+width+'.png'});}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Firm',exact:true}).click();const settings=page.getByRole('region',{name:'Client reminder settings'});await settings.getByText('Templates and matter collection authority',{exact:true}).click();await settings.getByLabel('Matter for client reminder authority').selectOption(m.id);await settings.getByRole('button',{name:'Authorize client reminders'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await settings.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/collection-settings-'+width+'.png'});
  await context.close();
 }}finally{await browser.close();}
}
