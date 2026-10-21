import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';

async function brief(revised=false){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const [heading,body] of [['Barton Workshop / lease review',revised?'Notice period: sixty days.':'Notice period: thirty days.'],['Counsel review notes','Draft for review. Source: lease clause 7.']]){
  const page=pdf.addPage([612,792]);page.drawText(heading,{x:48,y:720,size:20,font,color:rgb(.1,.15,.2)});page.drawText(body,{x:48,y:670,size:14,font});
 }
 return Buffer.from(await pdf.save());
}
async function signIn(page,h){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(/\/setup|\/app/);
 if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
}
for(const width of [1440,390])test(`DOC-002 authenticated PDF/image/text previews and exact original version comparison with author/time, revocation, erasure and recovery at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});let recovered;
 try{
  const m=await open(h),base='/matters/'+m.id,original=await brief(),revised=await brief(true);
  const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(20000);
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-'+name+'.png',fullPage:true});
   if(name==='pdf-preview'||name==='version-comparison')await record.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-'+name+'-record.png'});}};
  await signIn(page,h);await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();await page.getByRole('heading',{name:'Documents',level:1,exact:true}).waitFor();await page.getByLabel('Current matter').selectOption(m.id);
  const upload=async bytes=>{await page.getByLabel('Original file',{exact:true}).setInputFiles({name:'Lease-review.pdf',mimeType:'application/pdf',buffer:bytes});await page.getByRole('button',{name:'Save original',exact:true}).click();await page.getByRole('status').getByText('Original saved; version history retained',{exact:true}).waitFor();};
  await upload(original);
  const record=page.locator('article.record').filter({has:page.getByText('Lease-review.pdf',{exact:true})});
  await record.getByRole('button',{name:'Preview and compare versions',exact:true}).click();let first=record.getByRole('region',{name:'Preview version 1',exact:true});
  await first.getByText('Page text',{exact:true}).waitFor();await first.getByText('Page text',{exact:true}).click();await first.getByText(/Notice period: thirty days/).waitFor();await first.getByRole('button',{name:'Next page',exact:true}).click();await first.getByText(/Source: lease clause 7/).waitFor();await first.getByRole('button',{name:'Previous page',exact:true}).click();await first.getByText(/Notice period: thirty days/).waitFor();await shot('pdf-preview');
  await record.getByRole('button',{name:'Append version',exact:true}).click();await upload(revised);await record.locator('p').filter({hasText:/· Version 2$/}).waitFor();await record.getByRole('button',{name:'Preview and compare versions',exact:true}).click();await record.getByLabel('Compare with version',{exact:true}).selectOption('1');
  const second=record.getByRole('region',{name:'Preview version 2',exact:true});first=record.getByRole('region',{name:'Preview version 1',exact:true});
  for(const preview of [first,second]){await preview.getByText('Page text',{exact:true}).waitFor();await preview.getByText('Page text',{exact:true}).click();await preview.getByText(/owner@example.test/).waitFor();assert.match(await preview.locator('time').getAttribute('datetime'),/^\d{4}-\d{2}-\d{2}T/);}
  await first.getByText(/thirty days/).waitFor();await second.getByText(/sixty days/).waitFor();await record.getByRole('status').getByText(/Different original bytes/).waitFor();await shot('version-comparison');
  const [download]=await Promise.all([page.waitForEvent('download'),first.getByRole('link',{name:'Download original version 1',exact:true}).click()]);const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),original);
  const documents=await h.json(base+'/documents',undefined,h.owner),document=documents.find(d=>d.title==='Lease-review.pdf');
  await h.json('/team',{email:'assistant@example.test',name:'Morgan Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  const file='/api/satchel/documents/'+document.id+'/file?version=1';assert.equal((await h.request(file)).status,401);assert.equal((await h.request(file,undefined,assistant)).status,404);await h.json(base+'/access',{email:'assistant@example.test'},h.owner);assert.deepEqual(Buffer.from(await(await h.request(file,undefined,assistant)).arrayBuffer()),original);await h.json(base+'/access',{email:'assistant@example.test',remove:true},h.owner);assert.equal((await h.request(file,undefined,assistant)).status,404);
  const text=await h.json(base+'/documents',{name:'Counsel-notes.txt',mime:'text/plain',contentBase64:Buffer.from('Counsel note: compare the original notice periods. <script>not executable</script>').toString('base64'),visibility:'matter'},h.owner);
  const image=await h.json(base+'/documents',{name:'Receipt.png',mime:'image/png',contentBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',visibility:'matter'},h.owner);
  // Reload obtains real retained originals rather than injecting UI state.
  await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);
  const notes=page.locator('article.record').filter({has:page.getByText(text.title,{exact:true})});await notes.getByRole('button',{name:'Preview and compare versions'}).click();await notes.locator('pre').getByText(/<script>not executable<\/script>/).waitFor();
  const receipt=page.locator('article.record').filter({has:page.getByText(image.title,{exact:true})});await receipt.getByRole('button',{name:'Preview and compare versions'}).click();await receipt.getByRole('img',{name:'Original image, version 1'}).waitFor();assert.ok(await receipt.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));await shot('text-and-image');
  if(width===1440){
   const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();recovered=await harness();await recovered.json('/restore',{archive,confirm:'RESTORE'},recovered.owner);
   assert.deepEqual(Buffer.from(await(await recovered.request(file,undefined,recovered.owner)).arrayBuffer()),original);assert.deepEqual((await recovered.json(base+'/documents',undefined,recovered.owner)).find(d=>d.id===document.id).versions,document.versions);
  }
  await h.json('/documents/'+document.id+'/erase',{confirm:document.title,reason:'Counsel-approved fixture disposal'},h.owner);for(const version of [1,2])assert.equal((await h.request('/api/satchel/documents/'+document.id+'/file?version='+version,undefined,h.owner)).status,404);
  assert.deepEqual(errors,[]);
 }finally{await recovered?.close();await browser.close();await h.close();}
});
