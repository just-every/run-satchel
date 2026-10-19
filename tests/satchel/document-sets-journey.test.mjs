import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
const form=(p,n)=>p.locator('form',{has:p.getByRole('button',{name:n,exact:true})});
const notice=(p,text)=>p.getByRole('status').getByText(text).waitFor();
for(const [width,height] of [[1440,1000],[390,844]])test(`DOC-004 file mixed originals in two folders, detect and retag duplicates with exact preview at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const m=await open(h,'Mixed production review'),base='/matters/'+m.id;
  const privateDoc=await h.json(base+'/documents',{name:'Counsel-private.txt',mime:'text/plain',visibility:'private',contentBase64:Buffer.from('Privileged instructions').toString('base64')},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  async function shot(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-document-sets-${name}.png`,fullPage:true});}}
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);await page.getByRole('heading',{level:1,name:'Firm',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();await page.getByRole('heading',{name:'Document folders & views'}).waitFor();
  for(const name of ['Medical records','Correspondence']){const f=form(page,'Create folder');await f.getByLabel('Folder name').fill(name);await f.getByRole('button',{name:'Create folder',exact:true}).click();await notice(page,'Folder created');}
  const files=[{name:'Medical-production.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nMedical production original')},{name:'Cover-letter.txt',mimeType:'text/plain',buffer:Buffer.from('Cover letter original')},{name:'Medical-copy.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nMedical production original')}];
  await page.getByLabel('Original file',{exact:true}).setInputFiles(files);await page.getByRole('button',{name:'Save original',exact:true}).click();await notice(page,'Original saved');await page.getByText(/Duplicate content:/).first().waitFor();await shot('before-filing');
  const state=await h.json(base+'/document-sets',undefined,h.owner),medical=state.folders.find(f=>f.name==='Medical records'),correspondence=state.folders.find(f=>f.name==='Correspondence');
  async function file(names,destination,tags){
   for(const name of names)await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();const f=form(page,'Preview filing');await f.getByLabel('Destination folder').selectOption(destination);await f.getByLabel('Replace tags on selected documents').check();await f.getByLabel('Tags, separated by commas').fill(tags);await f.getByLabel('Set document type on selected documents').check();await f.getByLabel('Document type',{exact:true}).fill('Production');await f.getByRole('button',{name:'Preview filing',exact:true}).click();await notice(page,'Filing preview ready');
   const review=page.locator('section',{has:page.getByRole('heading',{name:'Review exact filing'})});assert.equal(await review.locator('article').count(),names.length);await review.getByText('Everyone assigned to this matter · Version 1 retained').first().waitFor();await shot('preview');await review.getByRole('button',{name:'Apply reviewed filing'}).click();await notice(page,'Documents filed');
  }
  await file(['Medical-production.pdf','Medical-copy.pdf'],medical.id,'Production');await file(['Cover-letter.txt'],correspondence.id,'Correspondence');
  await page.getByLabel('Document folder',{exact:true}).selectOption(medical.id);await page.getByText('2 accessible documents in this view',{exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:/^Select Medical/}).count(),2);await shot('medical-folder');
  await page.getByRole('checkbox',{name:'Show hash duplicates only'}).check();await file(['Medical-production.pdf','Medical-copy.pdf'],medical.id,'Production, Reviewed');
  await page.getByLabel('Filter by tag').selectOption('Reviewed');const save=form(page,'Save current view');await save.getByLabel('View name').fill('Reviewed duplicates');await save.getByRole('button',{name:'Save current view'}).click();await notice(page,'Document view saved');await page.getByRole('button',{name:'Reviewed duplicates (2)',exact:true}).waitFor();await shot('retagged');
  await page.getByLabel('Document folder',{exact:true}).selectOption('all');await page.getByLabel('Filter by tag').selectOption('');await page.getByRole('checkbox',{name:'Show hash duplicates only'}).uncheck();await page.getByRole('button',{name:'Reviewed duplicates (2)',exact:true}).click();await page.getByText('2 accessible documents in this view',{exact:true}).waitFor();
  // The folder chooser's file count agrees with the returned permitted contents.
  await h.json('/team',{email:'reader@example.test',name:'Production reader',role:'assistant'},h.owner);await h.json('/team/invite',{email:'reader@example.test'},h.owner);const reader=await h.login('reader@example.test');await h.json(base+'/access',{email:'reader@example.test'},h.owner);
  const readable=await h.json(base+'/document-sets',undefined,reader);assert.equal(readable.total,3);assert.ok(!JSON.stringify(readable).includes(privateDoc.id));assert.ok(!JSON.stringify(readable).includes(privateDoc.title));for(const f of readable.folders)assert.equal(f.count,readable.documents.filter(d=>d.folderId===f.id).length);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
