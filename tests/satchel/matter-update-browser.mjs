import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {capturePanel} from './browser-shots.mjs';
import {updateFixture,updateTick,updateWording} from './matter-update-fixture.mjs';

async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)&&/auth\/confirm/.test(m.text??m.html)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/(setup|app)/);
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
}
async function staffPanel(page){
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
 const panel=page.getByRole('region',{name:'Client updates',exact:true});await panel.getByText(/^Review client updates/).click();return panel;
}
async function shot(page,panel,name,width){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'No horizontal overflow');
 assert.deepEqual(await page.locator('button,a[href],[role=button]').evaluateAll(es=>es.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[],'Every control has a visible text label');
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,'matter-update-'+name+'-'+width);
}
export async function matterUpdateBrowser(){
 for(const [width,height] of [[1440,1000],[390,844]]){
  const h=await harness({mailReadback:request=>Response.json({id:new URL(request.url).pathname.split('/').at(-1),to:['client@example.test'],last_event:'delivered'})}),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
  try{
   const f=await updateFixture(h);await f.consent('allowed');const proof=await f.upload('Checklist-delivery.txt','Client acknowledged receipt of the revised hearing preparation checklist.',{visibility:'private'});const errors=[];
   const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
   await signIn(page,h,'owner@example.test');let panel=await staffPanel(page);
   let draft=panel.getByRole('article',{name:'Draft update A confirmed date has changed',exact:true}).filter({hasText:'Previously confirmed: 2027-01-10'});await draft.getByText(/^Prepare draft:/).click();
   await draft.getByLabel('Update title',{exact:true}).fill('Reviewed trial update');await draft.getByLabel('Client update wording').fill(updateWording);
   await draft.getByRole('group',{name:'Update recipients',exact:true}).getByRole('checkbox',{name:'Casey Client · client@example.test',exact:true}).check();
   await draft.getByLabel('Scheduled delivery time').fill('2026-10-01T12:00');await draft.getByLabel('Maximum email contacts in seven days').fill('7');
   await draft.getByRole('button',{name:'Add promise',exact:true}).click();await draft.getByLabel('Promise 1, including its due time',{exact:true}).fill('Deliver the revised hearing preparation checklist by Friday');
   await shot(page,draft,'draft',width);await draft.getByRole('button',{name:'Save update draft',exact:true}).click();await page.getByRole('status').getByText('Update draft saved for counsel review').waitFor();
   draft=panel.getByRole('article',{name:'Draft update Reviewed trial update',exact:true});await draft.getByText('Review exact delivery packet: Reviewed trial update',{exact:true}).click();
   await draft.getByRole('paragraph').filter({hasText:updateWording}).waitFor();
   // Counsel inspects the cited order and both dates in the review packet, then opens the exact cited original version.
   const cited=draft.locator('details',{has:page.getByText('Review exact delivery packet: Reviewed trial update',{exact:true})}).getByLabel('Cited order',{exact:true});
   await cited.getByText('Revised order paragraph 7 · version 2',{exact:false}).waitFor();await cited.getByText('Previously confirmed: 2027-01-10 → Now confirmed: 2027-02-12',{exact:true}).waitFor();
   const [order]=await Promise.all([page.waitForEvent('download'),cited.getByRole('link',{name:'Open cited original version',exact:true}).click()]),orderUrl=new URL(order.url());
   assert.equal(orderUrl.pathname+orderUrl.search,'/api/satchel/documents/'+f.order.id+'/file?version=2');assert.equal(Buffer.concat(await Array.fromAsync(await order.createReadStream())).toString(),'Revised order paragraph 7: trial on February 12, 2027. Counsel-private strategy remains separate.');for(const checkbox of await draft.getByRole('checkbox').all())await checkbox.check();await draft.getByLabel('Counsel approval note').fill('Counsel reviewed exact recipients, dates, promises and wording against the revised order.');
   await shot(page,draft,'review',width);await draft.getByRole('button',{name:'Approve scheduled update',exact:true}).click();await page.getByRole('status').getByText('Exact update approved for scheduled delivery').waitFor();
   await h.scheduled(updateTick);await page.reload();panel=await staffPanel(page);let approved=panel.getByRole('article',{name:'Approved update Reviewed trial update',exact:true});await approved.getByText('Approved packet and delivery: Reviewed trial update',{exact:true}).click();
   await approved.getByText(/Email: accepted/).waitFor();await approved.getByText('Review email delivery for client@example.test',{exact:true}).click();await approved.getByRole('button',{name:'Reconcile email outcome'}).click();await page.getByRole('status').getByText('Email delivery reconciled').waitFor();await approved.getByText(/Email: delivered/).waitFor();await shot(page,approved,'delivered',width);
   const cp=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();cp.setDefaultTimeout(15000);cp.on('pageerror',e=>errors.push(String(e)));await signIn(cp,h,'client@example.test');
   const client=cp.getByRole('article',{name:'Matter update Reviewed trial update',exact:true});await client.getByText(updateWording,{exact:true}).waitFor();await client.getByText(/Previous confirmed date: 2027-01-10/).waitFor();await client.getByText(/New confirmed date: 2027-02-12/).waitFor();assert.doesNotMatch(await client.innerText(),/Counsel-private strategy/);
   await client.getByLabel('Your reply about Reviewed trial update',{exact:true}).fill('Please call me to review the new hearing preparations.');await client.getByRole('button',{name:'Send reply about Reviewed trial update',exact:true}).click();await cp.getByText('Reply sent. Your responsible lawyer has an open follow-up.',{exact:true}).waitFor();await client.getByText('Replies and follow-up: Reviewed trial update',{exact:true}).click();await client.getByText('Awaiting your responsible lawyer’s follow-up',{exact:false}).waitFor();await shot(cp,client,'client-reply',width);
   await page.reload();panel=await staffPanel(page);approved=panel.getByRole('article',{name:'Approved update Reviewed trial update',exact:true});await approved.getByText('Approved packet and delivery: Reviewed trial update',{exact:true}).click();await approved.getByText('Open follow-up · owner@example.test',{exact:true}).waitFor();await shot(page,approved,'open-followup',width);
   await approved.getByLabel('Reply completion evidence',{exact:true}).fill('Counsel called the client and recorded the revised preparation steps.');await approved.getByRole('button',{name:'Complete update follow-up',exact:true}).click();await page.getByRole('status').getByText('Reply follow-up completed with evidence').waitFor();await panel.getByText('No unresolved replies.',{exact:true}).waitFor();
   await approved.getByText('Record promise fulfillment',{exact:true}).click();await approved.getByLabel('Promise fulfillment original version').selectOption(proof.id+':1');await approved.getByLabel('Promise fulfillment evidence').fill('Counsel delivered the reviewed preparation checklist as confirmed by the client receipt.');await approved.getByRole('button',{name:'Fulfil reviewed promise',exact:true}).click();await page.getByRole('status').getByText('Reviewed promise fulfilled with original evidence').waitFor();await approved.getByText(/Fulfilled with retained original version 1/).waitFor();await shot(page,approved,'completed',width);
   await cp.reload();const done=cp.getByRole('article',{name:'Matter update Reviewed trial update',exact:true});await done.getByText(/Friday · fulfilled/).waitFor();await done.getByText('Replies and follow-up: Reviewed trial update',{exact:true}).click();await done.getByText(/Your firm completed this follow-up/).waitFor();await shot(cp,done,'client-completed',width);assert.deepEqual(errors,[]);
  }finally{await browser.close();await h.close();}
 }
}
