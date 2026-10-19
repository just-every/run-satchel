import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
test('MATTER-004 litigation workflow previewed on an existing matter, selected steps approved, stopped and restarted once at 1440px, template edited without changing history and inspected at 390px',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const m=await open(h,'Harper v. Reed','Harper family','Reed Logistics');
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),errors=[];let page=await desktop.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const done=async text=>page.getByRole('status').getByText(text,{exact:true}).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${name}.png`,fullPage:true});}};
  const panel=()=>page.locator('section.panel',{has:page.getByRole('heading',{name:'Workflows',exact:true})});
  const opened=async(summary)=>{const d=panel().locator('details',{has:page.getByText(summary,{exact:true})});if(!await d.evaluate(e=>e.open))await d.locator('summary').click();return d;};
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await panel().getByText('No workflow runs on this matter.').waitFor();

  const create=await opened('New workflow');await create.getByLabel('Workflow name').fill('Litigation');
  await create.getByLabel('Steps').fill(['answer | task | File answer | 20 | high','kickoff | appointment | Litigation kickoff | 3 | 10:00/60','records | document_request | Client medical records | 7','engagement | draft_document | Engagement letter | 0 | Engagement for {{client}} in {{matter}}.'].join('\n'));
  await create.getByLabel('Version note').fill('Initial litigation workflow');await create.getByRole('button',{name:'Create workflow'}).click();await done('Workflow created');
  await panel().getByRole('article',{name:'Workflow Litigation'}).getByText('Litigation · version 1',{exact:true}).waitFor();

  // Preview on the existing matter and approve three of the four steps.
  await panel().getByRole('button',{name:'Preview workflow'}).click();await done('Workflow previewed');
  for(const title of ['File answer','Litigation kickoff','Engagement letter'])await panel().getByRole('checkbox',{name:new RegExp(`: ${title} · `)}).check();
  await shot('1440-workflow-preview');await panel().getByRole('button',{name:'Approve selected steps'}).click();await done('Selected steps created once');
  const runCard=status=>panel().getByRole('article',{name:'Run Litigation '+status});
  await runCard('active').getByText('Task: File answer · created',{exact:true}).waitFor();await runCard('active').getByText('Document request: Client medical records · not approved',{exact:true}).waitFor();

  // Stop and restart: completed work stays and nothing is created twice.
  let d=await opened('Stop Litigation');await d.getByLabel('Reason').fill('Client paused');await d.getByRole('button',{name:'Stop run'}).click();await done('Run stopped; completed work kept');
  d=await opened('Restart Litigation');await d.getByLabel('Reason').fill('Client resumed');await d.getByRole('button',{name:'Restart run'}).click();await done('Run restarted; only missing steps created');
  await runCard('active').getByText('Appointment: Litigation kickoff · created',{exact:true}).waitFor();
  const tasks=await h.json('/matters/'+m.id+'/tasks',undefined,h.owner);assert.deepEqual(tasks.map(t=>t.title),['File answer']);
  assert.equal((await h.json('/matters/'+m.id+'/documents',undefined,h.owner)).filter(x=>x.title==='Engagement letter.txt').length,1);

  // Edit the template: the run keeps its generated version and history.
  const edit=await opened('Edit Litigation');await edit.getByLabel('Steps').fill(['answer | task | File answer (revised) | 20 | high','kickoff | appointment | Litigation kickoff | 3 | 10:00/60','records | document_request | Client medical records | 7','engagement | draft_document | Engagement letter | 0 | Engagement for {{client}} in {{matter}}.','disclosures | task | Serve initial disclosures | 30 | normal'].join('\n'));
  await edit.getByLabel('Version note').fill('Add disclosures');await edit.getByRole('button',{name:'Save new version'}).click();await done('Workflow version saved; generated history unchanged');
  await panel().getByRole('article',{name:'Workflow Litigation'}).getByText('Litigation · version 2',{exact:true}).waitFor();await runCard('active').getByText('Litigation · version 1 · active',{exact:true}).waitFor();await runCard('active').getByText('Task: File answer · created',{exact:true}).waitFor();
  await panel().getByRole('button',{name:'Preview rollout of Litigation'}).click();await done('Rollout previewed');await panel().getByRole('checkbox',{name:new RegExp(`${m.matter_number} · Harper v. Reed: from version 1, adds Serve initial disclosures`)}).check();
  await panel().getByRole('button',{name:'Roll out to chosen matters'}).click();await done('Rolled out to chosen matters');await runCard('active').getByText('Task: Serve initial disclosures · created',{exact:true}).waitFor();await shot('1440-workflow-run');
  assert.deepEqual((await h.json('/matters/'+m.id+'/tasks',undefined,h.owner)).map(t=>t.title).sort(),['File answer','Serve initial disclosures']);

  const phone=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,storageState:await desktop.storageState()});await desktop.close();
  page=await phone.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await runCard('active').getByText('Task: Serve initial disclosures · created',{exact:true}).waitFor();await shot('390-workflow-run');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
