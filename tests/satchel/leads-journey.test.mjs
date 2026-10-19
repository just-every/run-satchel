import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
test('INTAKE-002 assign two prospects, merge a duplicate with its source kept, miss a follow-up and inspect the owner’s due queue and conversion report at 1440px and 390px',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  await h.json('/team',{email:'lawyer@example.test',name:'Lee Lawyer',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);
  const matter=await open(h,'Lopez v. Fresh Market','Maria Lopez','Fresh Market LLC');
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),errors=[];let page=await desktop.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();
  const done=async text=>page.getByRole('status').getByText(text,{exact:true}).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await panel().screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${name}.png`});}};
  const panel=()=>page.locator('section.panel',{has:page.getByRole('heading',{name:'Lead pipeline',exact:true})});
  const opened=async(scope,summary)=>{const d=scope.locator('details',{has:page.getByText(summary,{exact:true})});if(!await d.evaluate(e=>e.open))await d.locator('summary').click();return d;};
  await panel().getByText('No open leads.').waitFor();

  for(const name of ['New inquiry','Consultation held']){const d=await opened(panel(),'Edit lead stages');await d.getByLabel('Stage name').fill(name);await d.getByRole('button',{name:'Add stage'}).click();await done('Lead stage added');}
  // Two prospects assigned (one to the principal, with a follow-up already missed), then a duplicate.
  for(const [name,email,source,assigned,action,date] of [['Maria Lopez','maria@example.test','Google Ads','owner@example.test','Call back about records',day(-2)],['James Chen','james@example.test','Referral: Smith & Co','lawyer@example.test','Send questionnaire',day(3)],['maria lopez','MARIA@example.test','Website chat','','Reply to chat',day(1)]]){
   const d=await opened(panel(),'Add a lead');await d.getByLabel('Prospect name').fill(name);await d.getByLabel('Email').fill(email);await d.getByLabel('Inquiry summary').fill('Inquiry from '+source);await d.getByLabel('Referral source').fill(source);await d.getByLabel('Stage').selectOption({label:'New inquiry'});await d.getByLabel('Assigned to').fill(assigned);await d.getByLabel('Next action',{exact:true}).fill(action);await d.getByLabel('Next action date').fill(date);await d.getByRole('button',{name:'Add lead'}).click();await done('Lead added');
  }
  const dupCard=panel().getByRole('article',{name:'Lead maria lopez',exact:true});await dupCard.getByText('Possible duplicate of Maria Lopez (same email)',{exact:true}).waitFor();await shot('1440-leads-duplicate');
  const merge=await opened(dupCard,'Merge maria lopez into Maria Lopez');await merge.getByLabel('Reason').fill('Same prospect contacted twice');await merge.getByRole('button',{name:'Merge duplicate'}).click();await done('Duplicate merged; its source is kept');
  await panel().getByRole('article',{name:'Lead maria lopez',exact:true}).waitFor({state:'detached'});
  const kept=(await h.json('/leads',undefined,h.owner)).leads.find(l=>l.name==='Maria Lopez');const detail=await h.json('/leads/'+kept.id,undefined,h.owner);assert.deepEqual(detail.mergedFrom.map(m=>m.referralSource),['Website chat']);

  // The principal's due queue shows the missed follow-up; the report shows conversion.
  await panel().getByRole('list',{name:'Your due follow-ups'}).getByText(`Maria Lopez: Call back about records · ${day(-2)} · overdue`,{exact:true}).waitFor();
  await panel().getByRole('article',{name:'Lead Maria Lopez',exact:true}).getByText('Stalled: Next action overdue',{exact:true}).waitFor();
  const convert=await opened(panel().getByRole('article',{name:'Lead Maria Lopez',exact:true}),'Convert Maria Lopez');await convert.getByLabel('Matter opened after conflict review').selectOption(matter.id);await convert.getByRole('button',{name:'Link opened matter'}).click();await done('Lead converted');
  await panel().getByText('2 leads · 1 converted (50%) · 0 lost · merged duplicates not counted',{exact:true}).waitFor();
  const table=panel().getByRole('table',{name:'Conversion by referral source'});await table.getByRole('row',{name:'Google Ads 1 1 (100%) 0'}).waitFor();await table.getByRole('row',{name:'Referral: Smith & Co 1 0 (0%) 0'}).waitFor();await shot('1440-leads-report');

  const phone=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,storageState:await desktop.storageState()});await desktop.close();
  page=await phone.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();
  await panel().getByText('2 leads · 1 converted (50%) · 0 lost · merged duplicates not counted',{exact:true}).waitFor();await panel().getByRole('article',{name:'Lead James Chen',exact:true}).waitFor();await shot('390-leads-report');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
