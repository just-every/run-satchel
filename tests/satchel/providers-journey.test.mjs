import {paymentPlanEdge} from './payment-plan-edge.mjs';
import {stripeEdge} from './stripe-fixture.mjs';
import {stripeBrowser} from './stripe-browser.mjs';
import {invoiceMailEdge} from './invoice-mail-edge.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {capturePanel} from './browser-shots.mjs';
for(const [width,height] of [[1440,1000],[390,844]])test(`OSS-001 provider charges: disclosure, terms review and no payment prompt at ${width}px`,async()=>{
 const edge=paymentPlanEdge(),deliveryEdge=invoiceMailEdge(),h=await harness({...edge,...deliveryEdge,bindings:{...edge.bindings,...deliveryEdge.bindings}}),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
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
  const providerRows=panel.locator('li');assert.ok(await providerRows.count()>0);for(const row of await providerRows.all())assert.match(await row.innerText(),/Billed to the firm directly by the provider under its own terms\. Satchel charge: none\./);
  const microsoftTerms='https://www.microsoft.com/licensing/terms/';
  await panel.locator('select[name=providerId]').selectOption('microsoft');await panel.getByLabel('Provider’s own terms page (https)').fill(microsoftTerms);await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Record provider review'}).click();
  const microsoftRow=panel.locator('li').filter({has:page.getByText('Microsoft Entra',{exact:true})});await microsoftRow.getByRole('link',{name:'its terms'}).waitFor();assert.equal(await microsoftRow.getByRole('link',{name:'its terms'}).getAttribute('href'),microsoftTerms);
  const reviewedMicrosoft=(await h.json('/providers',undefined,h.owner)).providers.find(p=>p.id==='microsoft');assert.equal(reviewedMicrosoft.review.reviewedBy,'owner@example.test');assert.equal(reviewedMicrosoft.review.termsUrl,microsoftTerms);assert.ok(reviewedMicrosoft.review.reviewedAt);
  await panel.locator('select[name=providerId]').selectOption('stripe');await panel.getByLabel('Provider’s own terms page (https)').fill('https://stripe.com/legal/ssa');
  await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Record provider review'}).click();await page.getByRole('status').getByText('Provider review recorded').waitFor();
  await panel.locator('li').filter({has:page.getByText('Stripe',{exact:true})}).getByRole('link',{name:'its terms'}).waitFor();assert.match(await panel.innerText(),/Reviewed by owner@example\.test/);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,'providers-'+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  assert.deepEqual(errors,[]);
  await stripeBrowser({page,browser,h,edge,deliveryEdge,width});
 }finally{await browser.close();await h.close();}
});

import {open} from './harness.mjs';
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
for(const [width,height] of [[1440,1000]])test(`Reviewed letter and invoice mail expose provider outcomes and a deliberate next human action at ${width}px`,async()=>{
 let lost=false,outcome='bounced',sequence=0;
 const h=await harness({mailResponse:message=>lost&&message.subject==='Lease review letter'?new Response('unavailable',{status:503}):Response.json({id:'synthetic-satchel-'+(++sequence)}),mailReadback:request=>Response.json({id:new URL(request.url).pathname.split('/').at(-1),to:['client@example.test'],last_event:outcome})}),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  const m=await open(h,'Harper lease correspondence','Harper Mail Client','Harper Mail Adverse'),base='/matters/'+m.id;
  await h.json('/team',{email:'client@example.test',name:'Casey Client',role:'client'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Reviewed client recipient'},h.owner);
  let graph=await h.json('/contacts',undefined,h.owner);const contact=graph.contacts.find(c=>c.name==='Harper Mail Client');
  await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:['client@example.test']},h.owner);graph=await h.json('/contacts',undefined,h.owner);
  await h.json('/contacts/'+contact.id+'/consent',{revision:graph.revision,channel:'email',decision:'allowed',evidenceDate:'2026-10-20',source:'Synthetic reviewed client instructions'},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await reviewed(h,m,await draft(h,m));await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')&&/auth\/confirm/.test(m.text??m.html)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
  const panel=page.getByRole('region',{name:'Reviewed email'});await panel.waitFor();
  await panel.getByText('Review a letter or invoice notification',{exact:true}).click();await panel.getByLabel('Email recipient').fill('client@example.test');await panel.getByLabel('Letter subject',{exact:true}).fill('Lease review letter');await panel.getByLabel('Reviewed letter',{exact:true}).fill('The reviewed letter confirms our next authorized step.');await panel.getByLabel('Review and sending authority').fill('Counsel reviewed this exact letter and recipient.');await panel.getByRole('button',{name:'Record email review'}).click();await page.getByRole('status').getByText('Email review recorded').waitFor();
  let letter=panel.getByRole('article',{name:'Email Lease review letter'});await letter.getByText('The reviewed letter confirms our next authorized step.',{exact:true}).waitFor();await letter.getByRole('button',{name:'Send reviewed email'}).click();await page.getByRole('status').getByText('Email attempt recorded').waitFor();await letter.getByText('Attempt 1 · accepted',{exact:true}).waitFor();await letter.getByRole('button',{name:'Check provider outcome'}).click();await page.getByRole('status').getByText('Provider outcome checked').waitFor();await letter.getByText('Attempt 1 · bounced',{exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,letter,process.env.SATCHEL_SCREENSHOTS,'letter-bounce-'+width);
  outcome='complained';await letter.getByRole('button',{name:'Check provider outcome'}).click();await page.getByRole('status').getByText('Provider outcome checked').waitFor();await letter.getByText('Attempt 1 · complained',{exact:true}).waitFor();
  await letter.getByText('Review another attempt',{exact:true}).click();await letter.getByLabel('New decision after checking the provider').fill('Counsel checked provider records, confirmed recipient instructions and accepts duplicate risk.');await letter.getByRole('button',{name:'Authorize another attempt'}).click();await page.getByRole('status').getByText('New email decision recorded').waitFor();
  lost=true;await letter.getByRole('button',{name:'Send reviewed email'}).click();await page.getByRole('status').getByText('Email attempt recorded').waitFor();await letter.getByText('Attempt 2 · uncertain',{exact:true}).waitFor();await letter.getByText('Check the provider before deciding whether to resend. No automatic resend.',{exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,letter,process.env.SATCHEL_SCREENSHOTS,'letter-uncertain-'+width);
  lost=false;await panel.getByText('Review a letter or invoice notification',{exact:true}).click();await panel.getByLabel('Email recipient').fill('client@example.test');await panel.locator('select[name=billId]').selectOption(bill.id);await panel.getByLabel('Review and sending authority').fill('Counsel authorizes this issued invoice notification.');await panel.getByRole('button',{name:'Record email review'}).click();await page.getByRole('status').getByText('Email review recorded').waitFor();
  const invoice=panel.getByRole('article',{name:'Email An invoice is available'});await invoice.getByRole('button',{name:'Send reviewed email'}).click();await page.getByRole('status').getByText('Email attempt recorded').waitFor();outcome='delivered';await invoice.getByRole('button',{name:'Check provider outcome'}).click();await page.getByRole('status').getByText('Provider outcome checked').waitFor();await invoice.getByText('Attempt 1 · delivered',{exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,invoice,process.env.SATCHEL_SCREENSHOTS,'invoice-outcome-'+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,200))),[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});

for(const [width,height] of [[1440,1000],[390,844]])test(`Scheduled client reminders show approved template versions and durable outcomes at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  const m=await open(h,'Client reminder journey','Reminder Client','Reminder Adverse'),base='/matters/'+m.id;
  await h.json('/team',{email:'client@example.test',name:'Casey Client',role:'client'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Reviewed portal authority'},h.owner);
  let graph=await h.json('/contacts',undefined,h.owner);const contact=graph.contacts.find(c=>c.name==='Reminder Client');
  await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:['client@example.test']},h.owner);graph=await h.json('/contacts',undefined,h.owner);
  await h.json('/contacts/'+contact.id+'/consent',{revision:graph.revision,channel:'email',decision:'allowed',evidenceDate:'2026-10-20',source:'Synthetic affirmative reminder consent'},h.owner);
  await h.json(base+'/stage-profile',{revision:null,lawyerEmail:'owner@example.test'},h.owner);
  const invoice=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Counsel approves exact invoice sign-in notice'},h.owner),appointment=await h.json('/client-reminder-templates',{kind:'appointment',confirmed:true,reason:'Counsel approves exact appointment sign-in notice'},h.owner);
  await h.json(base+'/client-reminders',{enabled:true,invoiceTemplate:invoice.id,appointmentTemplate:appointment.id,maxContacts:3,reason:'Responsible counsel opts in this matter'},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await reviewed(h,m,await draft(h,m));await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  const event=await h.json(base+'/appointments',{title:'Private appointment',date:'2026-11-05',time:'10:00',durationMinutes:45,timezone:'UTC',frequency:'once',interval:1,occurrences:1,attendees:['owner@example.test']},h.owner);
  for(const source of [{billId:bill.id},{appointmentId:event.id}])await h.json(base+'/client-reminders/schedule',{recipient:'client@example.test',dueAt:'2026-11-01T12:00:00.000Z',...source},h.owner);
  await h.restart();await h.scheduled('2026-11-01T12:01:00.000Z');
  const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')&&/auth\/confirm/.test(m.text??m.html)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const panel=page.getByRole('region',{name:'Reviewed email'});await panel.waitFor();
  for(const t of [invoice,appointment]){const message=panel.getByRole('article',{name:'Email '+t.subject});await message.getByText('Attempt 1 · accepted',{exact:true}).waitFor();await message.getByText('Decision by owner@example.test: Approved template version '+t.id,{exact:true}).waitFor();}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  assert.deepEqual(await panel.locator('button,a[href],[role=button]').evaluateAll(elements=>elements.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[],'Every control in this populated screen has a visible text label');
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,'client-reminders-'+width);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});

import {matterUpdateBrowser} from './matter-update-browser.mjs';
test('Reviewed matter updates connect counsel approval, distinct delivery states and client follow-up at both viewport widths',matterUpdateBrowser);
