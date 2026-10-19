import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('DOC-004 mixed production, exact guarded filing, private-safe counts and duplicate detection survive archive restore',async()=>{
 const h=await harness();let target;
 try{
  const m=await open(h,'Production review'),base='/matters/'+m.id,sets=base+'/document-sets';
  await h.json('/team',{email:'reader@example.test',name:'Production reader',role:'assistant'},h.owner);
  await h.json('/team/invite',{email:'reader@example.test'},h.owner);const reader=await h.login('reader@example.test');
  await h.json(sets,undefined,reader,404);await h.json(base+'/access',{email:'reader@example.test'},h.owner);
  const upload=(name,content,visibility='matter',extra={})=>h.json(base+'/documents',{name,mime:'text/plain',contentBase64:Buffer.from(content).toString('base64'),visibility,...extra},h.owner);
  const pdf=await upload('Production.pdf','%PDF-1.7\nReviewed medical production'),note=await upload('Cover-letter.txt','Cover letter for medical production'),image=await upload('Exhibit.gif','GIF89a image exhibit');
  const duplicate=await upload('Repeated-production.pdf','%PDF-1.7\nReviewed medical production');assert.ok(duplicate.duplicates.some(d=>d.id===pdf.id));
  const privateDoc=await upload('Privileged-counsel-notes.txt','Privileged counsel only','private');
  // Private same-hash originals cannot leak by name, ID, duplicate or facet count.
  const hiddenDuplicate=await upload('Privileged-copy-name.pdf','%PDF-1.7\nReviewed medical production','private');
  const before=await h.json(sets,undefined,reader);assert.equal(before.total,4);assert.equal(before.unfiledCount,4);
  assert.ok(!JSON.stringify(before).includes(privateDoc.id));assert.ok(!JSON.stringify(before).includes(hiddenDuplicate.id));assert.ok(!JSON.stringify(before).includes('Privileged'));
  const medical=await h.json(sets+'/folder',{name:'Medical records'},h.owner),correspondence=await h.json(sets+'/folder',{name:'Correspondence'},h.owner);
  const file=async(documents,folderId,tags,documentType)=>{
   const p=await h.json(sets+'/preview',{documents:documents.map(d=>({id:d.id,revision:d.revision})),folderId,tags,documentType},h.owner);
   assert.equal(p.items.length,documents.length);assert.ok(p.items.every(d=>d.after.folderId===folderId&&d.permissions&&d.currentVersion));
   await h.json(sets+'/apply',{previewId:p.id,folderId:'ignored-tamper',visibility:'matter'},h.owner);
   await h.json(sets+'/apply',{previewId:p.id},h.owner,409);return p;
  };
  await file([pdf,image,duplicate,privateDoc,hiddenDuplicate],medical.id,['Production'],'Medical record');await file([note],correspondence.id,['Production'],'Correspondence');
  const publicState=await h.json(sets,undefined,reader),ownerState=await h.json(sets,undefined,h.owner);
  for(const [folderId,count] of [[medical.id,3],[correspondence.id,1]]){
   assert.equal(publicState.folders.find(f=>f.id===folderId).count,count);
   assert.equal(publicState.documents.filter(d=>d.folderId===folderId).length,count);
  }
  assert.equal(ownerState.folders.find(f=>f.id===medical.id).count,5);assert.equal(publicState.tags.find(t=>t.name==='Production').count,4);
  await h.json(sets+'/preview',{documents:[{id:privateDoc.id,revision:privateDoc.revision}],tags:['Leak']},reader,404);
  await h.json(sets+'/preview',{documents:[{id:pdf.id,revision:publicState.documents.find(d=>d.id===pdf.id).revision}],tags:['Unauthorized edit']},reader,403);
  const selected=ownerState.documents.filter(d=>[pdf.id,duplicate.id].includes(d.id));
  const p=await h.json(sets+'/preview',{documents:selected.map(d=>({id:d.id,revision:d.revision})),tags:['Reviewed','Production']},h.owner);
  assert.deepEqual(p.items[0].before.tags,['Production']);assert.deepEqual(p.items[0].after.tags,['Production','Reviewed']);
  await h.json(sets+'/apply',{previewId:p.id},reader,404);
  // A version changes after review: the entire operation must be refused.
  const revised=await upload('Production-revised.pdf','%PDF-1.7\nRevised production','matter',{documentId:pdf.id,revision:selected.find(d=>d.id===pdf.id).revision});
  await h.json(sets+'/apply',{previewId:p.id},h.owner,409);
  let current=await h.json(sets,undefined,h.owner);assert.deepEqual(current.documents.find(d=>d.id===duplicate.id).tags,['Production']);
  const retag=await h.json(sets+'/preview',{documents:current.documents.filter(d=>[pdf.id,duplicate.id].includes(d.id)).map(d=>({id:d.id,revision:d.revision})),tags:['Reviewed','Production']},h.owner);
  await h.json(sets+'/apply',{previewId:retag.id},h.owner);
  current=await h.json(sets,undefined,h.owner);const filed=current.documents.find(d=>d.id===pdf.id);
  assert.equal(filed.id,pdf.id);assert.equal(filed.currentVersion,2);assert.deepEqual(filed.versions,revised.versions);
  assert.equal(await(await h.request('/api/satchel/documents/'+pdf.id+'/file?version=1',undefined,h.owner)).text(),'%PDF-1.7\nReviewed medical production');
  const view=await h.json(sets+'/view',{name:'Reviewed production',filters:{folderId:medical.id,tag:'Reviewed'}},h.owner);
  assert.equal((await h.json(sets,undefined,h.owner)).views.find(v=>v.id===view.id).count,2);
  assert.equal((await h.json(sets,undefined,reader)).views.length,0);
  // Counts and all metadata round-trip through the actual public archive doors.
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  target=await harness();assert.equal((await target.json('/restore',{archive,confirm:'RESTORE'},target.owner)).phase,'complete');
  const restored=await target.json(sets,undefined,target.owner),source=await h.json(sets,undefined,h.owner);
  assert.deepEqual(restored,source);
  assert.equal(await(await target.request('/api/satchel/documents/'+pdf.id+'/file?version=1',undefined,target.owner)).text(),'%PDF-1.7\nReviewed medical production');
  const audit=await h.json('/audit?matterId='+m.id+'&action=document.bulk-filed',undefined,h.owner);
  const filedAudit=audit.records.find(a=>a.objectId===pdf.id&&a.detail.after.tags.includes('Reviewed'));assert.ok(filedAudit);assert.equal(filedAudit.evidence.record.recordType,'s_documents');assert.ok(filedAudit.evidence.record.tags.includes('Reviewed'));
  for(const [action,type] of [['document.folder-created','s_document_folders'],['document.view-saved','s_document_views'],['document.bulk-previewed','s_document_bulk_previews']]){const event=(await h.json('/audit?matterId='+m.id+'&action='+action,undefined,h.owner)).records[0];assert.equal(event.evidence.record.recordType,type);}

 }finally{await target?.close();await h.close();}
});
