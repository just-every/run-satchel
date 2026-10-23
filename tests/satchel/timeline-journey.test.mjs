import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function signIn(page,h,email){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.goto(h.origin+'/app');await page.getByRole('navigation',{name:'Workspace'}).waitFor();
}
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`MATTER-005 a lawyer records private and shared notes, files an email and reads the timeline; the client sees only the shared update at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings'),base='/matters/'+m.id;
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['client@example.test','client']]){await h.json('/team',{email,name:role==='lawyer'?'Marcus Lee':role==='client'?'Casey Client':'Case assistant',role},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  for(const email of ['lawyer@example.test','assistant@example.test'])await h.json(base+'/access',{email},h.owner);await h.json(base+'/portal',{email:'client@example.test',reason:'Client follows the lease review'},h.owner);
  await h.json(base+'/documents',{name:'Landlord reply.eml',mime:'message/rfc822',visibility:'matter',contentBase64:Buffer.from('From: landlord@example.test\r\nSubject: Reply\r\n\r\nWe received the notice.').toString('base64')},h.owner);
  const errors=[],page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await signIn(page,h,'lawyer@example.test');
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const panel=page.locator('section.timeline');await panel.getByRole('heading',{name:'Matter timeline'}).waitFor();
  const add=async(type,title,text,who,share,mention)=>{const form=panel.locator('form');if(!(await form.isVisible()))await panel.getByText('Add a note, call or client commitment').click();await form.getByLabel('Entry type').selectOption(type);await form.getByLabel('Title',{exact:true}).fill(title);await form.getByLabel('Text',{exact:true}).fill(text);await form.getByLabel('Who can read it').selectOption(who);if(share)await form.getByLabel('Share with the client').check();if(mention)await form.getByLabel(/Case assistant/).check();await form.getByRole('button',{name:'Add entry'}).click();await page.getByRole('status').getByText('Entry added').waitFor();};
  await add('note','Strategy: settle below $40k','Counsel only: reserve the adverse-possession argument.','private',false,false);
  await add('note','Progress: notice served','The landlord was served on Monday.','team',true,false);
  await add('call','Call with landlord counsel','They will respond by Friday.','team',false,true);
  await panel.getByRole('listitem').filter({hasText:'Landlord reply.eml'}).getByText('Email · Landlord reply.eml').waitFor();
  for(const title of ['Strategy: settle below $40k','Progress: notice served','Call with landlord counsel'])await panel.getByText(title,{exact:false}).first().waitFor();
  await panel.getByLabel('Show').selectOption('call');await panel.locator('ol.entries > li').filter({hasText:'Landlord reply'}).waitFor({state:'detached'});assert.equal(await panel.locator('ol.entries > li').count(),1);await panel.getByLabel('Show').selectOption('');
  await panel.getByRole('listitem').filter({hasText:'Email · Landlord reply.eml'}).getByRole('button',{name:/Open Documents for Landlord reply.eml/}).click();await page.getByRole('heading',{level:1,name:'Documents',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await panel.waitFor();
  assert.deepEqual(await iconOnly(page),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS){await panel.locator('ol.entries').waitFor();await panel.getByRole('heading',{name:'Matter timeline'}).scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/timeline-${width}.png`});}
  // The assistant reads the team entries but never the private note; the client sees only the shared update.
  const assistant=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();assistant.setDefaultTimeout(15000);await signIn(assistant,h,'assistant@example.test');
  await assistant.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();const theirs=assistant.locator('section.timeline');await theirs.getByText('Call with landlord counsel',{exact:false}).first().waitFor();assert.equal(await theirs.getByText('Strategy: settle below $40k').count(),0);assert.ok(!(await assistant.locator('body').innerText()).includes('adverse-possession'));
  await theirs.getByLabel('Mentions of me').check();await theirs.locator('ol.entries > li').filter({hasText:'Landlord reply'}).waitFor({state:'detached'});assert.equal(await theirs.locator('ol.entries > li').count(),1);
  const client=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();client.setDefaultTimeout(15000);
  await client.goto(h.origin+'/signin');await client.getByLabel('Email').fill('client@example.test');await client.getByRole('button',{name:'Email a sign-in link'}).click();await client.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(x=>x.to.includes('client@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await client.goto(link);await client.getByRole('button',{name:'Confirm'}).click();await client.goto(h.origin+'/app');
  const updates=client.getByLabel('Shared updates');await updates.getByText('Progress: notice served').waitFor();const seen=await client.locator('body').innerText();for(const hidden of ['adverse-possession','Strategy','Call with landlord counsel','Landlord reply'])assert.ok(!seen.includes(hidden),hidden+' is not in the client timeline');
  assert.deepEqual(await iconOnly(client),[]);assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS)await client.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/client-timeline-${width}.png`});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
