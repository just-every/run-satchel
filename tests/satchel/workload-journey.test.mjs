import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
async function notice(page,text){await page.getByRole('status').getByText(text).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`MATTER-006 hand off an absent lawyer's matters, acknowledge it and confirm imminent work is owned at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  for(const [email,name] of [['lawyer@example.test','Marcus Lee'],['priya@example.test','Priya Shah']]){await h.json('/team',{email,name,role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);}
  const marcus=await h.login('lawyer@example.test');await h.login('priya@example.test');const m=await open(h);for(const email of ['lawyer@example.test','priya@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);
  const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  await h.json('/matters/'+m.id+'/entries',{kind:'time',date:day(-2),description:'Strategy call',minutes:30,rateCents:30000},marcus);const billing=await h.json('/matters/'+m.id+'/billing',undefined,h.owner);
  await h.json('/matters/'+m.id+'/tasks',{title:'Serve interrogatories',ownerEmail:'lawyer@example.test',dueDate:day(3)},marcus);
  await h.json('/absences',{email:'lawyer@example.test',startDate:day(0),endDate:day(10),reason:'Surgery'},h.owner);
  const errors=[];
  async function signIn(email){const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
   const mail=h.mails.toReversed().find(x=>x.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
   await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
   await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Tasks',exact:true}).click();await page.getByRole('heading',{level:1,name:'Tasks',exact:true}).waitFor();return page;}
  async function shot(page,name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  const owner=await signIn('owner@example.test'),panel=owner.locator('section',{has:owner.getByRole('heading',{name:'Workload and coverage',exact:true})});
  const marcusCard=panel.locator('article',{has:owner.getByText('Marcus Lee',{exact:true})});
  await marcusCard.getByText(`Absent ${day(0)} to ${day(10)}; no coverage`).waitFor();await marcusCard.getByText(`${day(3)} · task · Matter ${m.matter_number} · Serve interrogatories`).waitFor();
  const form=owner.getByRole('form',{name:'Hand off work'});await form.getByLabel('Hand off from').selectOption({label:'Marcus Lee'});await form.getByLabel('Hand off to').selectOption({label:'Priya Shah'});await form.getByRole('checkbox',{name:new RegExp(m.matter_number)}).check();await form.getByLabel('Handoff reason').fill('Marcus on leave');await form.getByRole('button',{name:'Hand off'}).click();await notice(owner,'Handoff recorded');
  await panel.locator('article',{has:owner.getByText('Priya Shah',{exact:true})}).getByText(/1 handoff awaiting acknowledgment/).waitFor();await shot(owner,'workload');
  const priya=await signIn('priya@example.test');const handed=priya.locator('section',{has:priya.getByRole('heading',{name:'Handoffs to you',exact:true})});await handed.getByText('task · Serve interrogatories',{exact:true}).waitFor();await handed.getByText('Marcus on leave',{exact:true}).waitFor();
  await priya.getByRole('button',{name:'Acknowledge handoff from lawyer@example.test'}).click();await notice(priya,'Handoff acknowledged');await shot(priya,'handoff-acknowledged');
  await owner.reload();await owner.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Tasks',exact:true}).click();
  await panel.getByText('Every imminent task and deadline has an active owner.').waitFor();await panel.getByText('Marcus Lee to Priya Shah · 1 items · acknowledged').waitFor();
  const priyaCard=panel.locator('article',{has:owner.getByText('Priya Shah',{exact:true})});await priyaCard.getByText(`${day(3)} · task · Matter ${m.matter_number} · Serve interrogatories`).waitFor();
  assert.deepEqual(await h.json('/matters/'+m.id+'/billing',undefined,h.owner),billing,'Historic time entries are unchanged');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
