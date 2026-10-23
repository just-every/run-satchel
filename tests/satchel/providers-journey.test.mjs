import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {capturePanel} from './browser-shots.mjs';
for(const [width,height] of [[1440,1000],[390,844]])test(`OSS-001 provider charges: disclosure, terms review and no payment prompt at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
  await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  const forbidden=/upgrade|subscribe|free trial|license key|choose a plan|pricing|payment required/i;
  for(const name of ['Firm','Matters','Time & bills','Documents','Deadlines','Team & safety']){
   await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();
   assert.doesNotMatch(await page.locator('body').innerText(),forbidden,name+' shows no payment, plan or license prompt');
   assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,200))),[],name+' has no icon-only control without a tooltip');
  }
  const panel=page.locator('section.providers');await panel.getByRole('heading',{name:'Provider charges'}).waitFor();
  await panel.getByText(/free, MIT-licensed software/).waitFor();const shown=await panel.innerText();assert.match(shown,/free, MIT-licensed software/);
  for(const name of ['LawPay','Stripe','DocuSign','Inkwell','QuickBooks Online','Xero','Cloudflare'])assert.match(shown,new RegExp(name));
  assert.equal((shown.match(/Billed to the firm directly by the provider under its own terms\. Satchel charge: none\./g)??[]).length,10);
  await panel.locator('select[name=providerId]').selectOption('stripe');await panel.getByLabel('Provider’s own terms page (https)').fill('https://stripe.com/legal/ssa');
  await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Record provider review'}).click();await page.getByRole('status').getByText('Provider review recorded').waitFor();
  await panel.getByRole('link',{name:'its terms'}).waitFor();assert.match(await panel.innerText(),/Reviewed by owner@example\.test/);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,'providers-'+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
