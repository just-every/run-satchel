import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
const form=(page,name)=>page.locator('form',{has:page.getByRole('button',{name,exact:true})});
async function notice(page,text){await page.getByRole('status').getByText(text).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`MATTER-003 assign dependent discovery tasks, reassign an absent assistant, complete a prerequisite and inspect blockers and notifications at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@bartonlee.example',phone:'2125550100',address,timezone:'America/New_York',currency:'USD',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Manhattan',phone:'2125550100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  for(const [email,name] of [['dana@example.test','Dana Ortiz'],['eli@example.test','Eli Brooks']]){await h.json('/team',{email,name,role:'assistant'},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  const m=await open(h);for(const email of ['dana@example.test','eli@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);
  // Keep the leave fixture active for the fixed discovery dates and for today,
  // even after 2026 or when this journey crosses a firm-calendar midnight.
  const leaveStart=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),tomorrow=new Date(leaveStart+'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const leaveEnd=[tomorrow.toISOString().slice(0,10),'2026-12-31'].sort().at(-1);
  await h.json('/absences',{email:'dana@example.test',startDate:leaveStart,endDate:leaveEnd,reason:'Leave'},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  async function shot(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
  await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Tasks',exact:true}).click();await page.getByRole('heading',{level:1,name:'Tasks',exact:true}).waitFor();
  const add=page.getByRole('form',{name:'Add task'});
  async function task(title,owner,priority,prerequisites=[]){await add.getByLabel('Task title').fill(title);await add.getByLabel('Owner').selectOption({label:owner});await add.getByLabel('Priority').selectOption(priority);for(const p of prerequisites)await add.getByRole('checkbox',{name:p,exact:true}).check();await add.getByRole('button',{name:'Add task'}).click();await notice(page,'Task added');}
  await task('Draft interrogatories','Dana Ortiz','high');await task('Serve interrogatories','Avery Barton','urgent',['Draft interrogatories']);await task('Review responses','Eli Brooks','normal',['Draft interrogatories','Serve interrogatories']);
  const card=title=>page.locator('article',{has:page.getByText(title,{exact:true})});
  await card('Draft interrogatories').getByText('Dana Ortiz is absent. Reassign to keep it moving.').waitFor();
  await card('Review responses').getByText('Blocked by: Draft interrogatories, Serve interrogatories').waitFor();await shot('tasks-assigned');
  const reassign=form(page,'Reassign Draft interrogatories');await reassign.getByLabel('New owner').selectOption({label:'Eli Brooks'});await reassign.getByLabel('Reassignment reason').fill('Dana is away until January');await reassign.getByRole('button',{name:'Reassign Draft interrogatories'}).click();await notice(page,'Task reassigned');
  await card('Draft interrogatories').getByText(/Owner: Eli Brooks/).waitFor();assert.equal(await card('Draft interrogatories').getByText('Dana Ortiz is absent. Reassign to keep it moving.').count(),0);
  const complete=form(page,'Complete Draft interrogatories');await complete.getByLabel('Completion evidence').fill('Draft approved, DMS #4412');await complete.getByRole('button',{name:'Complete Draft interrogatories'}).click();await notice(page,'Task completed');
  await card('Draft interrogatories').getByText('Evidence: Draft approved, DMS #4412').waitFor();
  await card('Review responses').getByText('Blocked by: Serve interrogatories',{exact:true}).waitFor();assert.equal(await card('Serve interrogatories').getByText(/Blocked by/).count(),0);
  await card('Serve interrogatories').getByRole('button',{name:'Complete Serve interrogatories'}).waitFor();
  const notes=page.locator('section',{has:page.getByRole('heading',{name:'Your notifications',exact:true})});
  await notes.getByText('Draft interrogatories is done; Serve interrogatories is ready to start').waitFor();await shot('tasks-progress');
  const eli=(await h.json('/notifications',undefined,await h.login('eli@example.test'))).map(n=>n.message);
  assert.ok(eli.includes('Draft interrogatories is done; Review responses is still blocked by Serve interrogatories'));assert.ok(eli.includes('Reassigned to you: Draft interrogatories (Dana is away until January)'));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
