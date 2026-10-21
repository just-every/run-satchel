import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {chromium} from '@playwright/test';
import {office,wordUpload} from './office-fixture.mjs';
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
  await first.getByText('Page text',{exact:true}).waitFor();await first.getByText('Page text',{exact:true}).click();await first.getByText(/Notice period: thirty days/).waitFor();await first.getByRole('button',{name:'Next page',exact:true}).click();await first.getByText(/Source: lease clause 7/).waitFor();await first.getByRole('button',{name:'Previous page',exact:true}).click();await first.getByText(/Notice period: thirty days/).waitFor();await first.getByRole('link',{name:'Download original version 1',exact:true}).waitFor();
  await record.getByLabel('Annotation',{exact:true}).fill('Review clause 7 notice period separately');await record.getByRole('button',{name:'Save separate annotation',exact:true}).click();await record.getByText(/Page \/ section 1: Review clause 7/).waitFor();await shot('pdf-preview');
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
  const word=await h.json(base+'/documents',wordUpload('Original Word notice'),h.owner);
  const edits=await Promise.all(['Counsel first Word revision','Counsel second Word revision'].map(t=>h.json(base+'/documents',{...wordUpload(t),documentId:word.id,revision:word.revision},h.owner)));
  assert.deepEqual(edits.map(v=>v.saveOutcome).sort(),['conflict','published']);
  for(const kind of ['xlsx','pptx'])await h.json(base+'/documents',{name:'Hearing.'+kind,mime:'application/octet-stream',visibility:'matter',contentBase64:office(kind).toString('base64')},h.owner);
  await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();await page.getByLabel('Current matter').selectOption(m.id);
  const wordRecord=page.locator('article.record').filter({has:page.getByText(word.title,{exact:true})});await wordRecord.getByRole('button',{name:'Preview and compare versions'}).click();await wordRecord.getByText(/Counsel (first|second) Word revision/).waitFor();
  const review=await h.json('/documents/'+word.id+'/review',undefined,h.owner);await wordRecord.getByLabel('Conflict copy',{exact:true}).selectOption(review.conflicts[0].id);await wordRecord.getByRole('region',{name:'Preview version conflict',exact:true}).getByText(/Counsel (first|second) Word revision/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await wordRecord.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-word-conflict.png'});
  await wordRecord.getByRole('button',{name:'Append retained conflict as a new version',exact:true}).click();await wordRecord.locator('p').filter({hasText:/· Version 3$/}).waitFor();await wordRecord.getByRole('button',{name:'Preview and compare versions'}).click();await wordRecord.getByLabel('Compare with version',{exact:true}).selectOption('1');await wordRecord.getByText('Original Word notice',{exact:true}).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await wordRecord.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-word-resolved.png'});
  for(const [kind,expected] of [['xlsx','Reviewed filing cost'],['pptx','Hearing preparation summary']]){const r=page.locator('article.record').filter({has:page.getByText('Hearing.'+kind,{exact:true})});await r.getByRole('button',{name:'Preview and compare versions'}).click();await r.getByText(expected,{exact:true}).waitFor();if(process.env.SATCHEL_SCREENSHOTS)await r.screenshot({path:process.env.SATCHEL_SCREENSHOTS+'/'+width+'-'+kind+'.png'});}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  if(width===1440){
   const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();recovered=await harness();await recovered.json('/restore',{archive,confirm:'RESTORE'},recovered.owner);
   assert.deepEqual(Buffer.from(await(await recovered.request(file,undefined,recovered.owner)).arrayBuffer()),original);assert.deepEqual((await recovered.json(base+'/documents',undefined,recovered.owner)).find(d=>d.id===document.id).versions,document.versions);
  }
  await h.json('/documents/'+document.id+'/erase',{confirm:document.title,reason:'Counsel-approved fixture disposal'},h.owner);for(const version of [1,2])assert.equal((await h.request('/api/satchel/documents/'+document.id+'/file?version='+version,undefined,h.owner)).status,404);
  assert.deepEqual(errors,[]);
 }finally{await recovered?.close();await browser.close();await h.close();}
});

// Real compressed Office files pass the same original upload/download doors.
test('DOC-002 simultaneous Word saves retain the losing copy, version-bound notes, citations, access, archive recovery and disposal',async()=>{
 const h=await harness();let restored;try{
  const m=await open(h),base='/matters/'+m.id,first=await h.json(base+'/documents',wordUpload('Original reviewed notice'),h.owner),door='/documents/'+first.id;
  await h.json(base+'/documents',{...wordUpload('Unbased edit refused'),documentId:first.id},h.owner,400);
  const deadline=await h.json(base+'/deadlines',{title:'Reviewed original notice',date:'2026-12-01',timezone:'America/New_York',source:'Original Word version one clause seven',documentId:first.id,documentVersion:1},h.owner);
  await h.json('/deadlines/'+deadline.id+'/confirm',{revision:deadline.revision,reviewNote:'Reviewed exact source',confirmed:true},h.owner);
  await h.json(door+'/annotations',{version:1,page:1,note:'Separate strategy annotation'},h.owner);
  const unchanged=(await h.json(base+'/documents',undefined,h.owner)).find(d=>d.id===first.id);assert.equal(unchanged.revision,first.revision);assert.equal(unchanged.currentVersion,1);
  assert.equal((await h.json(base+'/deadlines',undefined,h.owner)).find(d=>d.id===deadline.id).status,'confirmed');
  const attempted=['First independent edit','Second independent edit'];const saves=await Promise.all(attempted.map(t=>h.json(base+'/documents',{...wordUpload(t),documentId:first.id,revision:first.revision},h.owner)));
  assert.deepEqual(saves.map(s=>s.saveOutcome).sort(),['conflict','published']);
  const current=(await h.json(base+'/documents',undefined,h.owner)).find(d=>d.id===first.id);assert.equal(current.currentVersion,2);assert.equal(current.versions.length,2);
  const state=await h.json(door+'/review',undefined,h.owner),copy=state.conflicts[0];assert.equal(state.conflicts.length,1);assert.equal(copy.base_revision,first.revision);assert.equal(copy.resolved_at,null);assert.equal(state.annotations[0].version,1);assert.equal(state.annotations[0].note,'Separate strategy annotation');
  const losing=attempted[saves.findIndex(s=>s.saveOutcome==='conflict')];const file='/api/satchel'+door+'/conflicts/'+copy.id+'/file';assert.deepEqual(Buffer.from(await(await h.request(file,undefined,h.owner)).arrayBuffer()),office('docx',losing));
  assert.deepEqual(Buffer.from(await(await h.request('/api/satchel'+door+'/file?version=1',undefined,h.owner)).arrayBuffer()),office('docx','Original reviewed notice'));
  await h.json('/team',{email:'assistant@example.test',name:'Document assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  assert.equal((await h.request('/api/satchel'+door+'/review')).status,401);await h.json(door+'/review',undefined,assistant,404);assert.equal((await h.request(file,undefined,assistant)).status,404);
  await h.json(base+'/access',{email:'assistant@example.test'},h.owner);assert.equal((await h.json(door+'/review',undefined,assistant)).conflicts.length,1);await h.json(door+'/conflicts/'+copy.id+'/resolve',{revision:current.revision},assistant,403);await h.json(base+'/access',{email:'assistant@example.test',remove:true},h.owner);await h.json(door+'/annotations',{version:1,page:1,note:'Revoked'},assistant,404);
  await h.restart();assert.deepEqual(await h.json(door+'/review',undefined,h.owner),state);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(await restored.json(door+'/review',undefined,restored.owner),state);assert.deepEqual(Buffer.from(await(await restored.request(file,undefined,restored.owner)).arrayBuffer()),office('docx',losing));
  await h.json(door+'/conflicts/'+copy.id+'/resolve',{revision:first.revision},h.owner,409);const resolved=await h.json(door+'/conflicts/'+copy.id+'/resolve',{revision:current.revision},h.owner);assert.equal(resolved.currentVersion,3);assert.equal(resolved.saveOutcome,'published');await h.json(door+'/conflicts/'+copy.id+'/resolve',{revision:resolved.revision},h.owner,409);
  assert.equal((await h.json(door+'/review',undefined,h.owner)).conflicts[0].resolved_version,3);assert.equal((await h.json(base+'/deadlines',undefined,h.owner)).find(d=>d.id===deadline.id).version,1);
  const audit=await h.json('/audit?matterId='+m.id,undefined,h.owner);assert.ok(audit.records.some(r=>r.action==='document.annotated'));assert.ok(audit.records.some(r=>r.action==='document.save_received'&&r.evidence.record.saveOutcome?.conflictId===copy.id));
  await h.json('/retention',{matterId:m.id,documentId:first.id,disposeAfter:'2026-01-01',basis:'Fixture retention expired'},h.owner);const disposal=await h.json(door+'/dispose',{confirm:first.title,reason:'Approved fixture disposal'},h.owner);assert.equal(disposal.journal.derivatives.annotations,1);assert.equal(disposal.journal.derivatives.conflictOriginals,1);await h.json(door+'/review',undefined,h.owner,404);assert.equal((await h.request(file,undefined,h.owner)).status,404);
  const journal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),empty=await harness();try{await empty.json('/restore',{archive,journal,confirm:'RESTORE'},empty.owner,409);}finally{await empty.close();}
 }finally{await restored?.close();await h.close();}
});
