import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function notice(page,text){await page.getByRole('status').getByText(text).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`FIRM-002 the principal adds finance and client roles and shares one matter with a client at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h),errors=[];
  async function signIn(email,tab){const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
   const mail=h.mails.toReversed().find(x=>x.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
   await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Casey Client');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
   if(tab)await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:tab,exact:true}).click();return page;}
  async function shot(page,name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  const owner=await signIn('owner@example.test','Team & safety');
  for(const [name,email,role] of [['Blake Billing','billing@example.test','Billing staff'],['Avery Accountant','accountant@example.test','Accountant'],['Casey Client','client@example.test','Client']]){
   await owner.getByLabel('Full name').fill(name);await owner.getByLabel('Email',{exact:true}).fill(email);await owner.getByLabel('Firm role').selectOption({label:role});await owner.getByRole('button',{name:'Save member'}).click();await notice(owner,'Firm member saved');
   await owner.getByText(`${email} · ${role==='Billing staff'?'billing':role.toLowerCase()} · active`).waitFor();
  }
  await owner.getByText('Accountants reconcile trust records and change nothing else.',{exact:false}).waitFor();
  await h.json('/team/invite',{email:'client@example.test'},h.owner);
  const sharing=owner.locator('section',{has:owner.getByRole('heading',{name:'Client portal sharing',exact:true})});
  await sharing.getByLabel('Matter to share').selectOption({label:`${m.number??m.matter_number} · ${m.title}`});
  await sharing.getByLabel('Client',{exact:true}).selectOption({label:'Casey Client · client@example.test'});await sharing.getByLabel('Reason for sharing').fill('Client follows the lease review');await sharing.getByRole('button',{name:'Share with client'}).click();await notice(owner,'Matter shared with the client');
  await sharing.locator('article.record').getByText('client@example.test',{exact:true}).waitFor();await shot(owner,'portal-sharing');
  const client=await signIn('client@example.test');
  await client.getByRole('heading',{level:1,name:'Your matters',exact:true}).waitFor();await client.getByText(`${m.number??m.matter_number} · ${m.title}`).waitFor();await client.getByText(/open · shared/).waitFor();
  assert.equal(await client.getByRole('navigation',{name:'Workspace'}).count(),0,'A client reaches no staff workspace');await shot(client,'client-portal');
  await sharing.getByLabel('Reason for withdrawing from client@example.test').fill('Engagement ended');await sharing.getByRole('button',{name:'Withdraw'}).click();await notice(owner,'Portal sharing withdrawn');await sharing.getByText(/withdrawn .* · Engagement ended/).waitFor();
  await client.reload();await client.getByText('Your firm has not shared a matter with you yet.').waitFor();await shot(client,'client-portal-empty');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
for(const [width,height] of [[1440,1000],[390,844]])test(`FIRM-008 the principal defines, assigns and widens a custom role at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h),errors=[];
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/matters/'+m.id+'/access',{email:'assistant@example.test'},h.owner);
  const entry=(cookie,cents,description)=>h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-01',description,minutes:60,rateCents:cents},cookie);
  await entry(h.owner,41000,'Principal strategy session');await entry(assistant,12000,'Assistant chronology');
  async function signIn(email,tab){const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
   const mail=h.mails.toReversed().find(x=>x.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
   await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
   if(tab)await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:tab,exact:true}).click();return page;}
  async function shot(page,name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  const owner=await signIn('owner@example.test','Team & safety'),panel=owner.locator('section',{has:owner.getByRole('heading',{name:'Custom roles',exact:true})});
  await panel.getByText('Define a custom role').click();
  const create=panel.locator('details',{has:owner.getByText('Define a custom role')});
  await create.getByLabel('New role name').fill('Own-rate assistant');
  for(const [label,option] of [['Billing rates','Own rates'],['Operating and trust bank accounts','None'],['Reports','None'],['Contacts','Read only'],['Documents','Read only'],['Billing','Read and change'],['Settings','None']])await create.getByLabel(label,{exact:true}).selectOption({label:option});
  await create.getByLabel('Reason for this role').fill('Assistants see their own hourly rate only');await create.getByRole('button',{name:'Create custom role'}).click();await notice(owner,'Custom role saved');
  const card=panel.locator('article.record',{has:owner.getByText('Own-rate assistant',{exact:true})});await card.getByText(/Billing rates: Own rates · Operating and trust bank accounts: None/).waitFor();
  await panel.getByLabel('Member to assign').selectOption({label:'Case assistant · assistant'});await panel.getByLabel('Custom role',{exact:true}).selectOption({label:'Own-rate assistant'});await panel.getByRole('button',{name:'Assign role'}).click();await notice(owner,'Custom role assigned');
  await card.getByText('Assigned to assistant@example.test').waitFor();await shot(owner,'custom-roles');
  const staff=await signIn('assistant@example.test','Time & bills');
  await staff.getByText('Principal strategy session').waitFor();await staff.getByText('Withheld by your role').first().waitFor();await staff.getByText('$120.00').first().waitFor();assert.equal(await staff.getByText('$410.00').count(),0,'The principal’s rate is not shown');await shot(staff,'rates-withheld');
  await card.getByText('Edit Own-rate assistant').click();const edit=card.locator('details');
  await edit.getByLabel('Billing rates',{exact:true}).selectOption({label:'All'});await edit.getByLabel('Reason for this change').fill('Assistants now see every hourly rate');await edit.getByRole('button',{name:'Save role changes'}).click();await notice(owner,'Custom role saved');
  await staff.reload();await staff.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Time & bills',exact:true}).click();await staff.getByText('Principal strategy session').waitFor();await staff.getByText('$410.00').first().waitFor();assert.equal(await staff.getByText('Withheld by your role').count(),0);await shot(staff,'rates-widened');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
