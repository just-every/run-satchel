import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {uploadOriginals} from './document-upload-fixtures.mjs';
import {join} from 'node:path';
export async function exerciseDocumentUploads(page,h,width){
 const panel=page.getByRole('region',{name:'Resumable uploads'}),bytes=Buffer.alloc(16*1024*1024,65);bytes.write('%PDF-1.7\nsynthetic-satchel-8\n');
 const original={name:'Resumable-record.pdf',mimeType:'application/pdf',buffer:bytes};
 await panel.getByLabel('Files to transfer').setInputFiles(original);
 let release,arrived,continued;const blocked=new Promise(r=>arrived=r),resume=new Promise(r=>release=r),finished=new Promise(r=>continued=r);
 await page.route('**/document-uploads/*/parts/2',async route=>{arrived();await resume;try{await route.continue();}finally{continued();}});
 try{
  await panel.getByRole('button',{name:'Reserve and upload files',exact:true}).click();await blocked;
  await panel.getByRole('button',{name:'Pause after part',exact:true}).click();release();await finished;
  await panel.getByText('Paused after the last part. Resume to verify the original.').waitFor();
  await panel.getByRole('button',{name:'Resume Resumable-record.pdf',exact:true}).waitFor();
 }catch(error){if(process.env.SATCHEL_UPLOAD_PROOF)await page.screenshot({path:join(process.env.SATCHEL_UPLOAD_PROOF,'upload-failure-'+width+'.png'),fullPage:true});throw error;}finally{release();await page.unrouteAll({behavior:'wait'});}
 // A fresh page must recover its durable manifest, with no browser storage copy.
 await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();
 await panel.getByRole('button',{name:'Resume Resumable-record.pdf',exact:true}).waitFor();
 await panel.getByLabel('Files to transfer').setInputFiles(original);
 await panel.getByRole('button',{name:'Resume Resumable-record.pdf',exact:true}).click();
 await panel.getByText(/16 MiB · Quarantined/).waitFor();
 if(width===1440){
  assert.equal(await panel.getByRole('button',{name:'Resume Resumable-record.pdf',exact:true}).count(),0);
  const doc=page.locator('.document-originals .record').filter({has:page.getByText('Resumable-record.pdf',{exact:true})});
  await doc.getByText(/Quarantined — awaiting malware scanner verdict/).waitFor();
  assert.equal(await doc.getByRole('link',{name:/Download version/}).count(),0);
  await doc.getByRole('button',{name:'Preview and compare versions',exact:true}).click();
  await doc.getByRole('alert').getByText(/quarantined pending a malware scanner verdict/).waitFor();
  assert.equal(await doc.locator('canvas,img').count(),0,'Quarantined originals produce no preview');
  await doc.getByRole('button',{name:'Close preview',exact:true}).click();
  const legacy=page.locator('.document-originals .record').filter({has:page.getByText('Notice.txt',{exact:true})});
  await legacy.getByRole('button',{name:'Append resumable version',exact:true}).click();
  await panel.getByText('Append a quarantined version to', {exact:false}).waitFor();
  await panel.getByLabel('Files to transfer').setInputFiles({...original,name:'Notice-large.pdf'});
  // An edit committed while transfer completion is in flight must demand
  // human review of the new revision, then reuse every acknowledged part.
  let completionArrived,allowCompletion;
  const intercepted=new Promise(r=>completionArrived=r),proceed=new Promise(r=>allowCompletion=r);
  await page.route('**/document-uploads/*/complete',async route=>{completionArrived();await proceed;await route.continue();},{times:1});
  try{
   await panel.getByRole('button',{name:'Reserve and upload files',exact:true}).click();await intercepted;
   const data=await page.evaluate(()=>fetch('/api/satchel/state').then(r=>r.json())),matter=data.matters.find(m=>m.title==='Harper lease dispute');
   const docs=await page.evaluate(id=>fetch('/api/satchel/matters/'+id+'/documents').then(r=>r.json()),matter.id),notice=docs.find(d=>d.title==='Notice.txt');
   const edited=await page.evaluate(async({matterId,notice})=>{const response=await fetch('/api/satchel/matters/'+matterId+'/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId:notice.id,revision:notice.revision,name:'Notice.txt',mime:'text/plain',visibility:notice.visibility,contentBase64:btoa('synthetic-satchel-34')})});return {status:response.status,body:await response.json()};},{matterId:matter.id,notice});
   assert.equal(edited.status,200,JSON.stringify(edited.body));allowCompletion();
   await panel.getByRole('alert').getByText(/Review its current revision/).waitFor();
   const review=panel.locator('form').filter({has:page.getByRole('button',{name:'Review current version for Notice-large.pdf',exact:true})});
   await review.getByText(/document now has version 2/).waitFor();
   if(process.env.SATCHEL_UPLOAD_PROOF){
    await mkdir(process.env.SATCHEL_UPLOAD_PROOF,{recursive:true});
    for(const proofWidth of [1440,390]){await page.setViewportSize({width:proofWidth,height:1000});await review.scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.SATCHEL_UPLOAD_PROOF,'review-'+proofWidth+'.png'),fullPage:true});}
    await page.setViewportSize({width,height:1000});
   }
   await review.getByLabel('Reason for retaining this transferred version').fill('Reviewed the intervening saved original; keep this transfer next.');
   await review.getByRole('checkbox').check();await review.getByRole('button').click();
   await panel.getByText('Current document revision reviewed. Resume to retain this original in quarantine.').waitFor();
   await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Documents',exact:true}).click();
   await panel.getByRole('button',{name:'Resume Notice-large.pdf',exact:true}).waitFor();
   let retransfers=0;const count=request=>{if(request.url().includes('/parts/'))retransfers++;};page.on('request',count);
   try{await panel.getByRole('button',{name:'Resume Notice-large.pdf',exact:true}).click();await legacy.getByText('Version 3 · '+bytes.length+' bytes · Quarantined',{exact:false}).waitFor();assert.equal(retransfers,0,'Reviewed completion reuses verified parts');}finally{page.off('request',count);}
  }finally{allowCompletion();await page.unrouteAll({behavior:'wait'});}
  assert.equal(await legacy.getByRole('link',{name:/Download version 3/}).count(),0);
  await legacy.getByRole('link',{name:/Download version 1/}).waitFor();
  await legacy.getByRole('button',{name:'Append resumable version',exact:true}).click();
  await panel.getByRole('button',{name:'Cancel version selection',exact:true}).click();
  const folder=await mkdtemp(join(tmpdir(),'satchel-upload-folder-'));
  try{
   const originals=await uploadOriginals();for(const f of originals)await writeFile(join(folder,f.name),f.bytes);
   await panel.getByLabel('Choose a folder',{exact:true}).check();
   await panel.getByLabel('Files to transfer').setInputFiles(folder);
   await panel.getByRole('button',{name:'Reserve and upload files',exact:true}).click();
   for(const f of originals){const record=page.locator('.document-originals .record').filter({has:page.getByText(f.name,{exact:true})});await record.getByText(/Quarantined — awaiting malware scanner verdict/).waitFor();assert.equal(await record.getByRole('link',{name:/Download version/}).count(),0);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'The populated manifest fits the viewport');
  }finally{await rm(folder,{recursive:true,force:true});}

 }
 await panel.scrollIntoViewIfNeeded();
 if(process.env.SATCHEL_UPLOAD_PROOF){await mkdir(process.env.SATCHEL_UPLOAD_PROOF,{recursive:true});await page.screenshot({path:join(process.env.SATCHEL_UPLOAD_PROOF,'documents-'+width+'.png'),fullPage:true});}
}
