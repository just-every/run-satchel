import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.goto(h.origin+'/app');
}
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`CLIENT-004 a lawyer shares a task, hearing and deadline; the client completes the task from a phone and has no way to change a date at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings'),base='/matters/'+m.id;
  for(const [email,role,name] of [['lawyer@example.test','lawyer','Marcus Lee'],['client@example.test','client','Casey Client']]){await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);
  await h.json(base+'/tasks',{title:'Gather your lease and rent receipts',priority:'normal',dueDate:'2026-11-05'},h.owner);
  await h.json(base+'/appointments',{title:'Hearing: motion to dismiss',date:'2026-11-18',time:'09:30',timezone:'America/New_York',durationMinutes:60,location:'Courtroom 4B',attendees:[]},h.owner);
  const proposed=await h.json(base+'/deadlines',{title:'Serve response',date:'2026-11-12',timezone:'America/New_York',source:'Order, paragraph 3'},h.owner);await h.json('/deadlines/'+proposed.id+'/confirm',{revision:proposed.revision,note:'Checked against the order'},h.owner);
  const errors=[],lawyer=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();lawyer.setDefaultTimeout(15000);lawyer.on('pageerror',e=>errors.push(String(e)));
  await signIn(lawyer,h,'lawyer@example.test');await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
  const panel=lawyer.locator('section.client-shares');await panel.getByRole('heading',{name:'Shared with the client'}).waitFor();
  const share=async(kind,title,instructions)=>{const form=panel.locator('form',{has:lawyer.getByRole('button',{name:'Share with client',exact:true})});await form.getByLabel('Share a').selectOption(kind);await form.getByLabel('Record to share').selectOption({label:title});await form.getByLabel('Instructions for the client').fill(instructions);await form.getByRole('button',{name:'Share with client',exact:true}).click();await lawyer.getByRole('status').getByText('Shared with the client').waitFor();await panel.getByRole('article',{name:'Shared '+title}).waitFor();};
  await share('task','Gather your lease and rent receipts','Upload clear copies by the due date, then mark this done.');await share('event','Hearing: motion to dismiss','Arrive 30 minutes early with photo ID.');await share('deadline','Serve response','The firm will file; no action from you.');
  assert.deepEqual(await iconOnly(lawyer),[]);assert.equal(await lawyer.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  // The client, on a phone-sized screen at both widths, sees the three items and can only acknowledge them and finish the task.
  const client=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();client.setDefaultTimeout(15000);client.on('pageerror',e=>errors.push(String(e)));
  await signIn(client,h,'client@example.test');const items=client.getByLabel('Tasks and events');await items.getByText('Gather your lease and rent receipts',{exact:true}).waitFor();
  await items.getByText('Event · 2026-11-18 09:30 (America/New_York) · Courtroom 4B').waitFor();await items.getByText('Court date · 2026-11-12 (America/New_York)').waitFor();
  assert.equal(await items.getByRole('button',{name:/Mark .* done/}).count(),1,'Only the client task can be marked done');assert.equal(await items.getByRole('button',{name:/Acknowledge/}).count(),3);
  assert.equal(await items.getByText('Dates are set by your firm. Contact your lawyer to change one.').count(),2);
  assert.ok(!(await client.locator('body').innerText()).includes('Internal'));
  await items.getByRole('button',{name:'Acknowledge Hearing: motion to dismiss'}).click();await items.getByText(/You acknowledged this/).first().waitFor();
  await items.getByRole('button',{name:'Mark Gather your lease and rent receipts done'}).click();await items.getByText(/You marked this done/).waitFor();assert.equal(await items.getByRole('button',{name:/Mark .* done/}).count(),0);
  assert.deepEqual(await iconOnly(client),[]);assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await client.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/client-shares-${width}.png`});
  // The firm sees the client's acknowledgment and completion, and the task stays the firm's own.
  await lawyer.reload();await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await panel.getByRole('article',{name:'Shared Gather your lease and rent receipts'}).getByText(/Marked done by client@example.test/).waitFor();await panel.getByRole('article',{name:'Shared Hearing: motion to dismiss'}).getByText(/Acknowledged by client@example.test/).waitFor();
  assert.equal((await h.json(base+'/tasks',undefined,h.owner)).find(t=>t.title==='Gather your lease and rent receipts').status,'open');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
