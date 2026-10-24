import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {capturePanel} from './browser-shots.mjs';
import {harness,open} from './harness.mjs';
async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)&&/auth\/confirm/.test(m.text??m.html)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.goto(h.origin+'/app');
}
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`CLIENT-003 counsel requests two records, explains an incomplete upload and accepts the corrected one while the second stays due at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);const setting=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind==='engagement_chase');await h.json('/followups/settings',{...setting,enabled:true},h.owner);
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings'),base='/matters/'+m.id;
  for(const [email,role,name] of [['lawyer@example.test','lawyer','Marcus Lee'],['client@example.test','client','Casey Client']]){await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);
  const errors=[],lawyer=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();lawyer.setDefaultTimeout(15000);lawyer.on('pageerror',e=>errors.push(String(e)));
  await signIn(lawyer,h,'lawyer@example.test');await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
  const panel=lawyer.locator('section.client-requests');await panel.getByRole('heading',{name:'Document requests'}).waitFor();
  const ask=async(title,due)=>{if(!(await panel.locator('form',{has:lawyer.getByRole('button',{name:'Send request',exact:true})}).isVisible()))await panel.getByText('Request a record from the client').click();const form=panel.locator('form',{has:lawyer.getByRole('button',{name:'Send request',exact:true})});await form.getByLabel('Record requested').fill(title);await form.getByLabel('Instructions for the client').fill('Upload a clear copy.');await form.getByLabel('Acceptance criteria').fill('All pages visible; dated within 90 days.');await form.getByLabel('Due date').fill(due);await form.getByRole('button',{name:'Send request',exact:true}).click();await lawyer.getByRole('status').getByText('Request created').waitFor();await panel.getByRole('article',{name:'Request '+title}).waitFor();};
  await ask('Bank statement','2026-11-10');await ask('Signed lease','2026-11-12');
  const client=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();client.setDefaultTimeout(15000);client.on('pageerror',e=>errors.push(String(e)));
  await signIn(client,h,'client@example.test');const requests=client.getByLabel('Requests from your firm');await requests.locator('li',{hasText:'Bank statement'}).waitFor();await requests.locator('li',{hasText:'Signed lease'}).waitFor();
  const bank=requests.locator('li',{hasText:'Bank statement'}),lease=requests.locator('li',{hasText:'Signed lease'});
  const slot=new Date();slot.setUTCDate(slot.getUTCDate()+1);slot.setUTCHours(12,0,0,0);await h.json('/report-schedules',{name:'Client work',dashboard:'workload',filters:{status:'open'},weekday:slot.getUTCDay()||7,time:'12:00',timezone:'UTC',channel:'portal',recipients:['client@example.test']},h.owner);await h.scheduled(slot.getTime()+60000);await client.reload();await client.getByRole('heading',{name:'Weekly summaries'}).waitFor();await client.getByText(/Your shared work: 0 overdue of 2 shared items/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await client.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-summaries-${width}.png`});
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(client,requests,process.env.SATCHEL_SCREENSHOTS,'request-consent-'+width);
  await bank.getByRole('checkbox',{name:/Email me reminders/}).check();await bank.getByRole('button',{name:'Set email reminders for Bank statement'}).click();
  await lawyer.reload();await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const reminder=panel.getByRole('article',{name:'Request Bank statement'});await reminder.getByText('Email reminders for Bank statement',{exact:true}).click();await reminder.getByLabel('Opted-in reader for Bank statement').fill('client@example.test');await reminder.getByRole('checkbox',{name:/I approve this request/}).check();if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(lawyer,reminder,process.env.SATCHEL_SCREENSHOTS,'request-approval-'+width);await reminder.getByRole('button',{name:'Approve reminders for Bank statement'}).click();await lawyer.getByRole('status').getByText('Reminders approved').waitFor();
  await bank.getByLabel('File for Bank statement').setInputFiles({name:'statement-page1.txt',mimeType:'text/plain',buffer:Buffer.from('Page 1 of 3')});await bank.getByRole('button',{name:'Upload for Bank statement'}).click();await bank.getByText(/statement-page1.txt · .* · submitted/).waitFor();
  await lawyer.reload();await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const card=panel.getByRole('article',{name:'Request Bank statement'});
  await card.getByLabel('What is missing from statement-page1.txt').fill('Pages 2 and 3 are missing; send the full statement.');await card.getByRole('button',{name:'Mark statement-page1.txt deficient'}).click();await lawyer.getByRole('status').getByText('Deficiency sent to the client').waitFor();
  await card.getByLabel('Clarification on Bank statement').fill('Download one PDF for the whole month.');await card.getByRole('button',{name:'Send clarification on Bank statement'}).click();await lawyer.getByRole('status').getByText('Clarification sent').waitFor();
  await client.reload();await bank.getByText(/needs correction: Pages 2 and 3 are missing/).waitFor();await bank.getByText('Your firm: Download one PDF for the whole month.').waitFor();
  await bank.getByLabel('File for Bank statement').setInputFiles({name:'statement-full.txt',mimeType:'text/plain',buffer:Buffer.from('Pages 1-3 complete')});await bank.getByRole('button',{name:'Upload for Bank statement'}).click();await bank.getByText(/statement-full.txt · .* · submitted/).waitFor();
  assert.deepEqual(await iconOnly(client),[]);assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  await lawyer.reload();await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
  await card.getByRole('button',{name:'Accept statement-full.txt'}).click();await lawyer.getByRole('status').getByText('Upload accepted and filed').waitFor();await card.getByText('Bank statement · received').waitFor();await panel.getByRole('article',{name:'Request Signed lease'}).getByText('Signed lease · open · due 2026-11-12').waitFor();
  assert.deepEqual(await iconOnly(lawyer),[]);assert.equal(await lawyer.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS){await lawyer.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/requests-staff-${width}.png`});await client.reload();await requests.locator('li',{hasText:'Bank statement'}).waitFor();await client.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/requests-client-${width}.png`});}
  await client.reload();await requests.locator('li',{hasText:'Bank statement'}).getByText(/Bank statement · received/).waitFor();await requests.locator('li',{hasText:'Signed lease'}).getByLabel('File for Signed lease').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
