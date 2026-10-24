import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
async function signIn(page,h,email,name){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();
 if(name){await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill(name);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}else await page.goto(h.origin+'/app');
}
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`CLIENT-001 the principal invites co-clients, a payer and a delegate, shares a release and previews each identity; each portal shows only its own doors at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings'),base='/matters/'+m.id;
  const roster=[['client@example.test','Casey Client'],['cocl@example.test','Jordan Co-client'],['payer@example.test','Pat Payer'],['deleg@example.test','Dana Delegate'],['second@example.test','Sam Co-client']];
  for(const [email,name] of roster){await h.json('/team',{email,name,role:'client'},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  await h.json(base+'/documents',{name:'Settlement release.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Release of all claims, v1.').toString('base64')},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await draft(h,m),approved=await reviewed(h,m,bill);await h.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},h.owner);
  const errors=[],owner=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();owner.setDefaultTimeout(15000);owner.on('pageerror',e=>errors.push(String(e)));
  await signIn(owner,h,'owner@example.test','Avery Barton');
  // Principal: four identities through the portal-sharing form.
  await owner.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();const sharing=owner.getByLabel('Client portal sharing');await sharing.getByText('Joint access can affect privilege.',{exact:false}).waitFor();await sharing.getByLabel('Matter to share').selectOption(m.id);
  const invite=async(person,kind,actsFor)=>{const form=sharing.locator('form',{has:owner.getByRole('button',{name:'Share with client',exact:true})});await form.getByLabel('Client',{exact:true}).selectOption({label:person});await form.getByLabel('Kind of access').selectOption(kind);if(actsFor)await form.getByLabel('Delegate acts for (client email)').fill(actsFor);await form.getByLabel('Reason for sharing').fill('Follows the lease review');await form.getByRole('button',{name:'Share with client',exact:true}).click();await owner.getByRole('status').getByText('Matter shared with the client').waitFor();};
  if(process.env.SATCHEL_SCREENSHOTS)await sharing.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-grant-warning-${width}.png`});
  await invite('Casey Client · client@example.test','client');await invite('Jordan Co-client · cocl@example.test','co_client');await invite('Sam Co-client · second@example.test','co_client');await invite('Pat Payer · payer@example.test','payer');await invite('Dana Delegate · deleg@example.test','delegate','client@example.test');
  await sharing.getByRole('article').filter({hasText:'payer@example.test · Payer'}).waitFor();await sharing.getByRole('article').filter({hasText:'deleg@example.test · Delegate'}).waitFor();
  await sharing.getByRole('button',{name:'Preview what payer@example.test sees'}).click();await sharing.getByLabel('Preview for payer@example.test').getByText(/Payer view: no timeline · no tasks, events or files · 1 invoices · no messages · no document requests/).waitFor();
  await sharing.getByRole('button',{name:'Preview what cocl@example.test sees'}).click();await sharing.getByLabel('Preview for cocl@example.test').getByText(/Co-client view: 0 shared updates · nothing shared · 1 invoices · 0 message threads · 0 document requests/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await sharing.getByLabel('Preview for cocl@example.test').screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-preview-${width}.png`});
  // Principal shares the release from the matter.
  await owner.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const shares=owner.locator('section.client-shares');await shares.getByRole('heading',{name:'Shared with the client'}).waitFor();
  const form=shares.locator('form',{has:owner.getByRole('button',{name:'Share with client',exact:true})});await form.getByLabel('Share a').selectOption('document');await form.getByLabel('Record to share').selectOption({label:'Settlement release.txt'});await form.getByLabel('Instructions for the client').fill('Review and tell us if you agree.');await form.getByRole('button',{name:'Share with client',exact:true}).click();await shares.getByRole('article',{name:'Shared Settlement release.txt'}).waitFor();
  assert.deepEqual(await iconOnly(owner),[]);assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await owner.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-identities-staff-${width}.png`});
  // Each identity's own portal.
  const portal=async(email)=>{const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));await signIn(page,h,email);await page.getByRole('heading',{level:1,name:'Your matters'}).waitFor();return page;};
  const coclient=await portal('cocl@example.test');await coclient.getByText('You are a co-client on this matter.').waitFor();const download=coclient.getByRole('link',{name:'Download Settlement release.txt'});await download.waitFor();
  const url=await download.getAttribute('href');assert.equal((await coclient.request.get(h.origin+url)).status(),200);await coclient.getByLabel('Invoices').getByRole('link',{name:/^Download invoice /}).waitFor();
  const invoiceLink=await coclient.getByLabel('Invoices').getByRole('link',{name:/^Download invoice /}).getAttribute('href');
  const invoicePdf=await coclient.request.get(h.origin+invoiceLink);assert.equal(invoicePdf.status(),200);assert.equal(invoicePdf.headers()['content-type'],'application/pdf','The co-client follows the issued-invoice link in their own session');
  if(process.env.SATCHEL_SCREENSHOTS)await coclient.getByLabel('Invoices').screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-coclient-invoices-${width}.png`});
  const second=await portal('second@example.test');await second.getByText('You are a co-client on this matter.').waitFor();await second.getByRole('link',{name:'Download Settlement release.txt'}).waitFor();assert.equal((await second.request.get(h.origin+url)).status(),200);await second.getByLabel('Invoices').getByRole('link',{name:/^Download invoice /}).waitFor();
  const payer=await portal('payer@example.test');await payer.getByText('You can see this matter’s invoices.').waitFor();await payer.getByText('Issued invoices',{exact:true}).waitFor();assert.ok(!(await payer.locator('body').innerText()).includes(m.title),'The payer screen reveals no matter title');await payer.getByLabel('Invoices').getByRole('link',{name:/^Download invoice /}).waitFor();assert.equal(await payer.getByLabel('Shared updates').count(),0);assert.equal(await payer.getByLabel('Tasks and events').count(),0);assert.equal((await payer.request.get(h.origin+url)).status(),404,'The payer’s direct URL to the release is refused');
  const delegate=await portal('deleg@example.test');await delegate.getByText('You are acting for a client on this matter.').waitFor();await delegate.getByRole('link',{name:'Download Settlement release.txt'}).waitFor();assert.equal((await delegate.request.get(h.origin+url)).status(),200);
  for(const page of [coclient,second,payer,delegate]){assert.deepEqual(await iconOnly(page),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);}
  if(process.env.SATCHEL_SCREENSHOTS){await payer.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-payer-${width}.png`});await coclient.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-coclient-${width}.png`});}
  // Withdrawing the delegate closes the delegate's URL at once.
  await owner.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();await sharing.getByLabel('Matter to share').selectOption(m.id);
  await sharing.getByRole('article').filter({hasText:'deleg@example.test · Delegate'}).getByLabel('Reason for withdrawing from deleg@example.test').fill('Delegate no longer acts for the client');await sharing.getByRole('article').filter({hasText:'deleg@example.test · Delegate'}).getByRole('button',{name:'Withdraw',exact:true}).click();await owner.getByRole('status').getByText('Portal sharing withdrawn').waitFor();
  assert.equal((await delegate.request.get(h.origin+url)).status(),404);assert.equal((await coclient.request.get(h.origin+url)).status(),200);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
