import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)&&/auth\/confirm/.test(m.text??m.html)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.goto(h.origin+'/app');
}
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`CLIENT-002 staff send a confidential attachment, the client reads and replies in the portal, and the emails carry no content at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings'),base='/matters/'+m.id;
  for(const [email,role,name] of [['lawyer@example.test','lawyer','Marcus Lee'],['client@example.test','client','Casey Client']]){await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  const errors=[],lawyer=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();lawyer.setDefaultTimeout(15000);lawyer.on('pageerror',e=>errors.push(String(e)));
  await signIn(lawyer,h,'lawyer@example.test');await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();
  const panel=lawyer.locator('section.portal-threads');await panel.getByRole('heading',{name:'Client messages'}).waitFor();await panel.getByText('Start a message to the client').click();
  const form=panel.locator('form',{has:lawyer.getByRole('button',{name:'Send message',exact:true})});await form.getByLabel('Subject').fill('Confidential: settlement analysis');await form.getByLabel('Message',{exact:true}).fill('Settle at 40k; the privileged analysis is attached.');await form.getByLabel('Attachment',{exact:true}).setInputFiles({name:'Analysis.txt',mimeType:'text/plain',buffer:Buffer.from('Privileged settlement analysis.')});
  await form.getByRole('button',{name:'Send message',exact:true}).click();const thread=panel.getByRole('article',{name:'Thread Confidential: settlement analysis'});await thread.getByText('Notification to client@example.test: accepted').waitFor();await thread.getByRole('link',{name:'Download Analysis.txt'}).waitFor();await thread.getByText('Not yet read by the client').waitFor();
  const notice=h.mails.toReversed().find(x=>x.to.includes('client@example.test')&&/no message content/.test(x.text));assert.ok(notice&&!/Settle|Analysis|Confidential/.test(JSON.stringify(notice)),'The email names no content');
  assert.deepEqual(await iconOnly(lawyer),[]);assert.equal(await lawyer.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  // The client, in the portal: unread, open, download inside the session, reply with an attachment.
  const client=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();client.setDefaultTimeout(15000);client.on('pageerror',e=>errors.push(String(e)));
  await signIn(client,h,'client@example.test');const messages=client.getByLabel('Messages');await messages.locator('strong',{hasText:'Confidential: settlement analysis'}).waitFor();await messages.getByText('1 unread').waitFor();
  await messages.getByRole('button',{name:'Open Confidential: settlement analysis'}).click();await messages.getByText('Settle at 40k; the privileged analysis is attached.').waitFor();
  const link=await messages.getByRole('link',{name:'Download Analysis.txt'}).getAttribute('href');const download=await client.request.get(h.origin+link);assert.equal(download.status(),200);assert.equal(await download.text(),'Privileged settlement analysis.');
  await messages.getByLabel('Your reply to Confidential: settlement analysis').fill('I agree. Here is the signed page.');await messages.getByLabel('Attachment for Confidential: settlement analysis').setInputFiles({name:'Signed.txt',mimeType:'text/plain',buffer:Buffer.from('Signed page')});await messages.getByRole('button',{name:'Reply to Confidential: settlement analysis'}).click();await messages.getByText('I agree. Here is the signed page.').waitFor();await messages.getByRole('link',{name:'Download Signed.txt'}).waitFor();
  assert.deepEqual(await iconOnly(client),[]);assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await messages.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/portal-threads-${width}.png`});
  // Staff see the reply as unread, read it, and the read state is recorded.
  await lawyer.reload();await lawyer.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await thread.getByText('Confidential: settlement analysis · 1 unread').waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await thread.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/staff-threads-${width}.png`});
  await thread.getByRole('button',{name:'Mark Confidential: settlement analysis read'}).click();await lawyer.getByRole('status').getByText('Marked read').waitFor();await thread.getByText('Read by lawyer@example.test').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
