import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
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
 }
 await panel.scrollIntoViewIfNeeded();
 if(process.env.SATCHEL_UPLOAD_PROOF){await mkdir(process.env.SATCHEL_UPLOAD_PROOF,{recursive:true});await page.screenshot({path:join(process.env.SATCHEL_UPLOAD_PROOF,'documents-'+width+'.png'),fullPage:true});}
}
