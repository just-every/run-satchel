import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
for(const [width,height] of [[1440,1000],[390,844]])test(`CONNECT-001 principal scopes an integration, inspects delivery and replay, then revokes it at ${width}px`,async()=>{
 const received=[],h=await harness({webhookResponse:async r=>{received.push(await r.json());return new Response(null,{status:204});}}),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try {
  const m=await open(h),other=await open(h,'Pine estate advice','Pine Studio','Cedar Property'),context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await panel.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`});}};
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();
  const panel=page.locator('section.panel',{has:page.getByRole('heading',{name:'Scoped integrations',exact:true})});await panel.getByLabel('Integration name',{exact:true}).fill('Reviewed docket sync');await panel.getByLabel(m.title,{exact:true}).check();await panel.getByLabel('tasks:read',{exact:true}).check();await panel.getByLabel('HTTPS webhook destination (optional)').fill('https://receiver.example.com/events');await panel.getByLabel('task.changed',{exact:true}).check();await shot('integration-scope');
  await panel.getByRole('button',{name:'Create scoped integration',exact:true}).click();await page.getByRole('status').getByText('Integration created.',{exact:false}).waitFor();
  const key=await panel.getByLabel('New integration key',{exact:true}).inputValue(),secret=await panel.getByLabel('New webhook signing secret',{exact:true}).inputValue();assert.ok(key&&secret);
  await panel.getByRole('heading',{name:'Reviewed docket sync',exact:true}).waitFor();await shot('integration-created');await panel.getByRole('button',{name:'Hide integration credentials'}).click();assert.equal(await panel.getByLabel('New integration key').count(),0);
  const auth={authorization:'Bearer '+key};assert.deepEqual((await h.json('/v1/matters',undefined,'',200,auth)).items.map(x=>x.id),[m.id]);await h.json('/v1/matters/'+other.id,undefined,'',404,auth);
  await h.json('/matters/'+m.id+'/tasks',{title:'Review insurer docket',priority:'high'},h.owner);await panel.getByRole('button',{name:'Dispatch webhooks',exact:true}).click();await page.getByRole('status').getByText('Webhook dispatch finished.',{exact:false}).waitFor();await panel.getByText('task.changed · delivered',{exact:true}).waitFor();await shot('integration-delivered');
  await panel.getByRole('button',{name:'Re-deliver event',exact:true}).click();await page.getByRole('status').getByText('Event re-delivery attempted with the same event ID; inspect the recorded outcome',{exact:true}).waitFor();assert.equal(received.length,2);assert.equal(received[0].id,received[1].id);await shot('integration-replayed');
  await panel.getByRole('button',{name:'Rotate integration credentials',exact:true}).click();await page.getByRole('status').getByText('Credentials rotated.',{exact:false}).waitFor();await panel.getByText(/^Paused ·/).waitFor();const rotatedKey=await panel.getByLabel('New integration key',{exact:true}).inputValue();assert.notEqual(rotatedKey,key);await h.json('/v1/matters',undefined,'',401,auth);await shot('integration-rotated');await panel.getByRole('button',{name:'Hide integration credentials'}).click();await panel.getByRole('button',{name:'Resume deliveries',exact:true}).click();await page.getByRole('status').getByText('Webhook deliveries resumed',{exact:true}).waitFor();await shot('integration-resumed');
  await panel.getByRole('button',{name:'Revoke integration',exact:true}).click();await page.getByRole('status').getByText('Integration revoked',{exact:true}).waitFor();await panel.getByText(/^Revoked ·/).waitFor();await h.json('/v1/matters',undefined,'',401,auth);await shot('integration-revoked');
 }finally{await browser.close();await h.close();}
});
test('CONNECT-001 refuses private or credential-bearing destinations and keeps scoped API-only access usable at desktop and phone widths',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h);
  for(const endpoint of ['https://127.0.0.1/events','https://hooks.local/events','https://example:example@receiver.example.com/events'])await h.json('/integrations',{label:'Unsafe transport attempt',matterIds:[m.id],scopes:['matters:read'],endpoint,eventTypes:['matter.updated']},h.owner,400);
  assert.equal((await h.json('/integrations',undefined,h.owner)).integrations.length,0);
  for(const [width,height] of [[1440,1000],[390,844]]){
   const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true});await context.addCookies(h.owner.split('; ').map(c=>{const n=c.indexOf('=');return {name:c.slice(0,n),value:c.slice(n+1),url:h.origin,secure:true};}));const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
   if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
   await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();const panel=page.locator('section.panel',{has:page.getByRole('heading',{name:'Scoped integrations',exact:true})});
   await panel.getByText(/Only the principal enters webhook destinations/).waitFor();assert.equal(await panel.getByLabel('HTTPS webhook destination (optional)').isEnabled(),true);await panel.getByLabel('Integration name',{exact:true}).fill('API docket '+width);await panel.getByLabel(m.title,{exact:true}).check();await panel.getByRole('button',{name:'Create scoped integration',exact:true}).click();await page.getByRole('status').getByText('Integration created.',{exact:false}).waitFor();const key=await panel.getByLabel('New integration key',{exact:true}).inputValue();assert.deepEqual((await h.json('/v1/matters',undefined,'',200,{authorization:'Bearer '+key})).items.map(x=>x.id),[m.id]);await panel.getByRole('button',{name:'Hide integration credentials'}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await panel.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-integration-api-only.png`});}await context.close();
  }
 }finally{await browser.close();await h.close();}
});
