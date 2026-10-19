import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
for(const [width,height] of [[1440,1000],[390,844]])test(`CAL-007 schedule, inspect failed delivery, escalate and complete with evidence at ${width}px`,async()=>{
 const h=await harness({mailResponse:message=>message.subject==='Satchel deadline reminder'?Response.json({name:'validation_error',message:'Mailbox refused'},{status:422}):Response.json({id:'provider-accepted'})}),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Barton lease dispute');await h.json('/team',{email:'marcus@example.test',name:'Marcus Lee',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'marcus@example.test'},h.owner);await h.login('marcus@example.test');await h.json('/matters/'+m.id+'/access',{email:'marcus@example.test'},h.owner);
  const proposed=await h.json('/matters/'+m.id+'/deadlines',{title:'Serve notice',date:'2026-11-20',timezone:'America/New_York',source:'Court order, paragraph 8'},h.owner);const d=await h.json('/deadlines/'+proposed.id+'/confirm',{revision:proposed.revision,note:'Independently reviewed by counsel'},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  const notice=async text=>page.getByRole('status').getByText(text).waitFor();
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Deadlines',exact:true}).click();await page.getByText('Serve notice',{exact:true}).waitFor();await page.getByText('Reminders for Serve notice',{exact:true}).click();await page.getByText('Set up reminders',{exact:true}).click();
  await page.getByLabel('Primary recipient for Serve notice').selectOption('marcus@example.test');await page.getByLabel('Backup recipient for Serve notice').selectOption('owner@example.test');await page.getByRole('button',{name:'Save reminder rule',exact:true}).click();await notice('Reminder rule saved');await page.getByText('Primary: marcus@example.test',{exact:false}).first().waitFor();
  await h.scheduled('2026-11-13T14:00:00Z');await h.restart();await h.scheduled('2026-11-14T14:00:00Z');
  await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Deadlines',exact:true}).click();await page.getByText('Reminders for Serve notice',{exact:true}).click();await page.getByText('failed',{exact:true}).waitFor();await page.getByText('accepted',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-reminders.png`,fullPage:true});}
  await page.getByRole('button',{name:/Acknowledge workspace escalation reminder to owner@example.test/}).click();await notice('Reminder acknowledged');assert.equal((await h.json('/matters/'+m.id+'/deadlines',undefined,h.owner))[0].status,'confirmed');
  await page.getByLabel('What was done (evidence or reference)').fill('Court filing receipt ECF-182, verified by counsel');await page.getByRole('button',{name:'Mark complete',exact:true}).click();await notice('Completion recorded');await page.getByText('done',{exact:true}).waitFor();
  const final=await h.json('/matters/'+m.id+'/deadlines',undefined,h.owner);assert.equal(final.find(v=>v.id===d.id).completionEvidence,'Court filing receipt ECF-182, verified by counsel');assert.deepEqual(errors,[]);
  if(process.env.SATCHEL_SCREENSHOTS)await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-reminders-complete.png`,fullPage:true});
 }finally{await browser.close();await h.close();}
});
