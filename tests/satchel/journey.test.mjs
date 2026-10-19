// SAT-013: the installed product's own surfaces, driven in a browser at desktop and phone widths.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
const form=(page,button)=>page.locator('form',{has:page.getByRole('button',{name:button,exact:true})});
async function signIn(page,h,email){
 if(!page.url().endsWith('/signin'))await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();
 await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();
}
async function tab(page,name){
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();
 await page.getByRole('heading',{level:1,name,exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits without horizontal scrolling`);
}
async function done(page,notice){await page.getByRole('status').getByText(notice).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`SAT-013 sign-in, setup and every workspace tab with real records at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  // The installed root stays the Lobby: one door into sign-in or setup.
  await page.goto(h.origin+'/');const door=page.locator('a.btn');assert.match(await door.innerText(),/Sign in|Finish setup/);await door.click();
  await signIn(page,h,'owner@example.test');
  await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();
  await page.waitForURL(/\/app/);await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--cognac').trim()),'','The workspace keeps the picked theme');
  const firm=form(page,'Save firm settings');
  for(const [label,value] of [['Firm name','Barton & Lee LLP'],['Firm email','office@bartonlee.example'],['Firm phone','212 555 0100'],['Office phone','212 555 0100'],['Code (2–6 letters or digits)','LIT'],['Practice area','Litigation']])await firm.getByLabel(label,{exact:true}).fill(value);
  for(const address of await firm.locator('fieldset.address').all())for(const [label,value] of [['Street address','200 Park Avenue'],['City','New York'],['State (two letters)','NY'],['ZIP code','10166']])await address.getByLabel(label).fill(value);
  await firm.getByRole('button',{name:'Save firm settings'}).click();await done(page,'Firm settings saved');
  await tab(page,'Matters');await page.getByText('No matters yet').waitFor();
  const search=form(page,'Run conflict search');await search.getByLabel('Client name').fill('Harper Bakery LLC');await search.getByLabel('Adverse party name').fill('Main Street Holdings');await search.getByRole('button',{name:'Run conflict search'}).click();
  await done(page,'Search recorded');const opening=form(page,'Open reviewed matter');await opening.getByLabel('Matter title').fill('Harper lease dispute');await opening.getByLabel('Review conclusion and any conflict clearance').fill('No matches in firm records; cleared.');await opening.getByRole('checkbox').check();await opening.getByRole('button',{name:'Open reviewed matter'}).click();
  await done(page,'Matter opened');await page.getByRole('button',{name:/Harper lease dispute/}).waitFor();
  await tab(page,'Team & safety');const member=form(page,'Save member');await member.getByLabel('Full name').fill('Case assistant');await member.getByLabel('Email').fill('assistant@example.test');await member.getByLabel('Firm role').selectOption('assistant');await member.getByRole('button',{name:'Save member'}).click();
  await done(page,'Firm member saved');await page.getByRole('button',{name:'Send invitation'}).click();await done(page,'Invitation sent');
  await tab(page,'Matters');await form(page,'Grant access').getByRole('button',{name:'Grant access'}).click();await done(page,'Matter access granted');
  await tab(page,'Time & bills');const work=form(page,'Record entry');assert.equal(await work.getByLabel('Hourly rate (USD cents)').inputValue(),'30000','Time entries start at the firm rate');
  await work.getByLabel('Description').fill('Review lease and notice');await work.getByLabel('Minutes').fill('90');await work.getByRole('button',{name:'Record entry'}).click();await done(page,'Entry recorded');await page.getByRole('cell',{name:'$450.00'}).waitFor();
  await tab(page,'Documents');await page.getByLabel('Original file').setInputFiles({name:'Notice.txt',mimeType:'text/plain',buffer:Buffer.from('Notice to cure, served 2026-10-01.')});await form(page,'Save original').getByRole('button',{name:'Save original'}).click();
  await done(page,'Original saved');await page.getByRole('link',{name:/Download version 1/}).waitFor();await page.getByRole('heading',{name:'Legal holds & retention'}).waitFor();
  await tab(page,'Deadlines');const deadline=form(page,'Propose deadline');await deadline.getByLabel('Deadline title').fill('Cure period ends');await deadline.getByLabel('Date').fill('2026-10-31');assert.equal(await deadline.getByLabel('Timezone').inputValue(),'America/New_York');await deadline.getByLabel('Source and citation').fill('Notice to cure, paragraph 2');await deadline.getByRole('button',{name:'Propose deadline'}).click();
  await page.getByText('proposed',{exact:true}).waitFor();const confirm=form(page,'Confirm deadline');await confirm.getByLabel('Review note').fill('Checked against the served notice');await confirm.getByRole('button',{name:'Confirm deadline'}).click();await page.getByText('confirmed',{exact:true}).waitFor();
  await tab(page,'Preparations');await page.getByRole('heading',{name:'Prepared by your agent'}).waitFor();
  await tab(page,'Move in');await page.getByRole('heading',{name:'Clio contacts'}).waitFor();
  await tab(page,'Firm');await page.getByRole('heading',{name:'Barton & Lee LLP'}).waitFor();
  // The assistant signs in from the invitation and sees only what the role allows.
  const staff=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),assistant=await staff.newPage();assistant.on('pageerror',e=>errors.push(String(e)));
  const invite=h.mails.toReversed().find(m=>m.to.includes('assistant@example.test')),link=(invite.text??invite.html).match(/https:\/\/[^\s"<]+\/auth\/[^\s"<]+/)[0];
  await assistant.goto(link.replaceAll('&amp;','&'));await assistant.getByRole('button').first().click();await assistant.goto(h.origin+'/app');
  await assistant.getByText('Case assistant · assistant').waitFor();await assistant.getByRole('button',{name:/Harper lease dispute/}).waitFor();
  assert.equal(await assistant.getByRole('heading',{name:'Open a matter'}).count(),0,'Assistants cannot open matters');
  await tab(assistant,'Deadlines');await assistant.getByText('Cure period ends',{exact:true}).waitFor();assert.equal(await assistant.getByRole('button',{name:'Mark complete'}).count(),0);
  await tab(assistant,'Documents');assert.equal(await assistant.getByRole('heading',{name:'Legal holds & retention'}).count(),0);
  await tab(assistant,'Firm');await assistant.getByRole('heading',{name:'Barton & Lee LLP'}).waitFor();assert.equal(await assistant.getByRole('button',{name:'Save firm settings'}).count(),0);
  await tab(assistant,'Team & safety');assert.equal(await assistant.getByRole('heading',{name:'Firm members'}).count(),0);assert.equal(await assistant.getByRole('heading',{name:'Backup & restore'}).count(),0);
  assert.equal(await assistant.evaluate(()=>fetch('/api/satchel/conflicts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client:'A',adverse:'B'})}).then(r=>r.status)),403);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
