import {paymentMoneyBrowser} from './payment-money-browser.mjs';
import {invoiceDeliveryJourney} from './invoice-delivery-journey.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {paymentFixture} from './stripe-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';
export async function stripeBrowser({page,browser,h,edge,deliveryEdge,width}){
 const s=await paymentFixture(h);
 await page.reload();await page.getByRole('navigation',{name:'Workspace'}).waitFor();
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();
 const settings=page.getByRole('region',{name:'Stripe collection settings'});await settings.getByText('Operating arrangement',{exact:true}).waitFor();
 await settings.getByText('Protected trust arrangement',{exact:true}).click();
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,settings,process.env.SATCHEL_SCREENSHOTS,'stripe-settings-'+width);
 const context=await browser.newContext({viewport:page.viewportSize(),ignoreHTTPSErrors:true});
 await context.addCookies(s.client.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),url:h.origin,secure:true};}));
 const client=await context.newPage();
 try{
  await client.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');const panel=client.getByRole('region',{name:'Invoice payment'});await panel.getByRole('heading',{name:'Invoice '+s.card.number,exact:true}).waitFor();await panel.getByRole('button',{name:'Pay by card or ACH'}).waitFor();
  const shot=async stem=>{assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);assert.deepEqual(await panel.locator('button,a[href]').evaluateAll(elements=>elements.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[]);if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(client,panel,process.env.SATCHEL_SCREENSHOTS,stem+'-'+width);};
  await shot('invoice-payment-unpaid');
  await h.json('/portal/invoices/'+s.card.id+'/checkout',{requestKey:'synthetic-satchel-browser-card'},s.client);const card=[...edge.sessions.values()].at(-1);await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(edge.event(card,'checkout.session.completed','paid'))});
  await client.reload();await panel.getByRole('status').getByText('Paid',{exact:true}).waitFor();await shot('invoice-payment-paid');
  await h.json('/portal/invoices/'+s.ach.id+'/checkout',{requestKey:'synthetic-satchel-browser-ach'},s.client);const ach=[...edge.sessions.values()].at(-1);await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(edge.event(ach,'checkout.session.completed','pending'))});
  await client.goto(h.origin+'/app/invoices/'+s.ach.id+'/pay');await panel.getByRole('status').getByText('Payment pending',{exact:true}).waitFor();await shot('invoice-payment-pending');
  await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(edge.event(ach,'checkout.session.async_payment_succeeded','paid'))});await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(edge.event(ach,'charge.failed','returned',{status:'failed',amount_refunded:0}))});
  await client.reload();await panel.getByRole('status').getByText('Payment returned',{exact:true}).waitFor();await shot('invoice-payment-returned');
  await h.json('/invoices/'+s.ach.id+'/void',{revision:s.ach.revision,reason:'Client requests corrected billing'},h.owner);
  const replacement=await s.issue('Corrected operating services');await h.json('/invoices/'+s.ach.id+'/replacement',{replacementBillId:replacement.id,reason:'Counsel names the corrected invoice'},h.owner);
  await client.reload();await panel.getByRole('status').getByText('Voided invoice',{exact:true}).waitFor();await panel.getByRole('link',{name:'Replacement invoice '+replacement.number}).waitFor();assert.equal(await panel.getByRole('button',{name:'Pay by card or ACH'}).count(),0);await shot('invoice-payment-void');
 }finally{await context.close();}
 await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
 let graph=await h.json('/contacts',undefined,h.owner);const contact=graph.contacts.find(c=>c.name===s.m.client);
 await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:['client@example.test']},h.owner);graph=await h.json('/contacts',undefined,h.owner);
 await h.json('/contacts/'+contact.id+'/consent',{revision:graph.revision,channel:'email',decision:'allowed',evidenceDate:'2026-10-20',source:'Synthetic affirmative invoice notification consent'},h.owner);
 await page.goto(h.origin+'/app');await page.getByRole('navigation',{name:'Workspace'}).waitFor();
 await invoiceDeliveryJourney({page,h,m:s.m,bill:s.card,deliveryEdge,width});
 const portalContext=await browser.newContext({viewport:page.viewportSize(),ignoreHTTPSErrors:true});
 await portalContext.addCookies(s.client.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),url:h.origin,secure:true};}));
 try{const portal=await portalContext.newPage();await portal.goto(h.origin+'/app');const statements=portal.getByRole('region',{name:'Payer statements'});await statements.getByRole('link',{name:/Statement/}).waitFor();await statements.scrollIntoViewIfNeeded();if(process.env.SATCHEL_SCREENSHOTS)await portal.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/client-payer-statements-'+width+'.png'});const url=await statements.getByRole('link',{name:/Statement/}).getAttribute('href');assert.equal((await portal.request.get(h.origin+url)).status(),200);assert.equal(await portal.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);}finally{await portalContext.close();}
 if(width===1440&&process.platform==='darwin'){
  const delivered=(await h.json('/matters/'+s.m.id+'/invoice-deliveries',undefined,h.owner)).deliveries.find(d=>d.bill_id===s.card.id),bytes=await(await h.request(delivered.pdfUrl,undefined,h.owner)).arrayBuffer(),directory=await mkdtemp(join(tmpdir(),'satchel-qr-'));
  try{const filename=join(directory,'invoice.pdf');await writeFile(filename,Buffer.from(bytes));await promisify(execFile)('swift',['tests/satchel/invoice-qr-scan.swift',filename,h.origin+'/app/invoices/'+s.card.id+'/pay'],{timeout:60000});}finally{await rm(directory,{recursive:true,force:true});}
 }

 await paymentMoneyBrowser({page,browser,h,edge,s,width});

}
