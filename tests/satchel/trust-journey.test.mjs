import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
import {statement} from './trust-fixture.mjs';
const form=(p,n)=>p.locator('form',{has:p.getByRole('button',{name:n,exact:true})});
for(const [width,height] of [[1440,1000],[390,844]])test(`TRUST-001 designate officer, review source openings and inspect bank/client registers at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});try{
  const m=await open(h),other=await open(h,'Pine estate advice','Pine Studio','Cedar Property');await statement(h,m);await statement(h,other,'Pine September statement.txt');
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage();page.setDefaultTimeout(15000);
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}};
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();};
  const notice=async text=>page.getByRole('status').getByText(text).waitFor();
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();
  await tab('Team & safety');const member=form(page,'Save member');await member.getByLabel('Full name').fill('Avery Barton');await member.getByLabel('Email',{exact:true}).fill('owner@example.test');await member.getByLabel('Firm role').selectOption('trust_officer');await member.getByRole('button',{name:'Save member',exact:true}).click();await notice('Firm member saved');await shot('team-officer');
  await tab('Trust');for(const [name,kind,ref] of [['Community Bank IOLTA','trust','4821'],['Community Bank Operating','operating','1192']]){const f=form(page,'Create bank register');await f.getByLabel('Account name').fill(name);await f.getByLabel('Account kind').selectOption(kind);await f.getByLabel('Bank reference (last four only)').fill(ref);await f.getByRole('button',{name:'Create bank register',exact:true}).click();await notice('Bank register created');}
  await shot('trust-created');for(const title of [m.title,other.title]){const l=form(page,'Open subsidiary ledger');await l.locator('select[name="matterId"]').selectOption(title===m.title?m.id:other.id);await l.getByRole('button',{name:'Open subsidiary ledger',exact:true}).click();await notice('Subsidiary ledger opened');}
  const data=await h.json('/trust',undefined,h.owner),bank=data.accounts.find(a=>a.kind==='trust');
  for(const [mat,cents,source] of [[m,150001,'September bank statement.txt'],[other,300003,'Pine September statement.txt']]){
   const f=form(page,'Prepare opening');await f.locator('select[name="accountId"]').selectOption(bank.id);await f.getByLabel('Subsidiary ledger').selectOption(data.ledgers.find(l=>l.matter_id===mat.id).id);await f.getByLabel('Opening USD cents').fill(String(cents));await f.getByLabel('Statement date').fill('2026-09-30');await f.locator('select[name="documentId"]').selectOption({label:(await f.locator('select[name="documentId"]').locator('option').allTextContents()).find(t=>t.includes(source))});await f.getByLabel('Statement citation').fill('September statement page 2, client allocation reviewed');await f.getByRole('button',{name:'Prepare opening',exact:true}).click();await notice('Opening prepared');await shot('trust-opening-review');
   const approval=form(page,'Approve exact opening');await approval.getByLabel('Approval note').fill('Original statement and exact client funds allocation reviewed');await approval.getByRole('button',{name:'Approve exact opening',exact:true}).click();await notice('Opening approved and posted');
  }
  await page.getByText('$4,500.04').waitFor();assert.equal((await h.json('/trust',undefined,h.owner)).entries.length,2);await shot('trust-posted');
  for(const name of ['Matters','Time & bills','Deadlines']){await tab(name);await shot(name.toLowerCase().replaceAll(' ','-'));}
 }finally{await browser.close();await h.close();}
});
