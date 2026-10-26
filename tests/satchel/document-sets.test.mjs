import {medicalPacketPdfs,inviteRecipient} from './document-packet-fixture.mjs';
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

// Production packets use real PDF originals and the built application.
test('controlled production pins originals, removes whole-page content, freezes exact Bates and privilege artifacts, and fences approval, export, recall and erasure',async()=>{
 const {PDFDocument,StandardFonts}=await import('pdf-lib'),{unzipSync,strFromU8}=await import('fflate'),{createHash}=await import('node:crypto');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const h=await harness();let restored;
 try{
  const m=await open(h,'Controlled evidence production'),base='/matters/'+m.id;
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const line of ['Public treatment record','synthetic-satchel-1 privileged strategy']){const page=pdf.addPage([400,500]);page.drawText(line,{x:30,y:400,font,size:12});}
  pdf.setTitle('synthetic-satchel-2 hidden source metadata');await pdf.attach(Buffer.from('synthetic-satchel-3 attachment'),'private.txt');
  const original=Buffer.from(await pdf.save()),upload=(name,bytes,visibility='matter')=>h.json(base+'/documents',{name,mime:'application/pdf',contentBase64:bytes.toString('base64'),visibility},h.owner);
  const source=await upload('Record.pdf',original),withheld=await upload('Counsel-private.pdf',original,'private');
  const selected=(d,extra={})=>({documentId:d.id,revision:d.revision,version:1,privilege:'None',withheld:false,redactedPages:[],...extra});
  const body={recipientName:'Opposing counsel',recipientEmail:'counsel@example.test',batesPrefix:'SYN-',batesStart:1,items:[selected(source,{redactedPages:[1,2],reason:'Counsel work product',privilege:'Work product'}),selected(withheld,{withheld:true,reason:'Attorney client privilege',privilege:'Attorney client'})]};
  const packet=await h.json(base+'/productions',body,h.owner),door='/productions/'+packet.id;
  assert.equal(packet.status,'draft');assert.equal(packet.snapshot.items[0].firstBates,'SYN-00000001');assert.equal(packet.snapshot.items[0].lastBates,'SYN-00000002');assert.equal(packet.snapshot.recipient.email,body.recipientEmail);
  assert.equal((await h.request('/api/satchel'+door+'/file',undefined,h.owner)).status,409);
  assert.equal((await h.request('/api/satchel'+door+'/preview')).status,401);
  const preview=await h.request('/api/satchel'+door+'/preview',undefined,h.owner),bytes=Buffer.from(await preview.arrayBuffer());
  assert.equal(preview.headers.get('cache-control'),'no-store');assert.equal(createHash('sha256').update(bytes).digest('hex'),packet.sha256);
  const files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json'])),log=JSON.parse(strFromU8(files['privilege-log.json']));
  assert.deepEqual(manifest,packet.snapshot);assert.equal(log.length,2);assert.deepEqual(Object.keys(files).sort(),['001.pdf','manifest.json','privilege-log.json']);
  assert.equal(createHash('sha256').update(files['001.pdf']).digest('hex'),manifest.items[0].producedSha256);
  const task=getDocument({data:new Uint8Array(files['001.pdf']),useSystemFonts:true}),rendered=await task.promise;
  try{
   assert.equal(rendered.numPages,2);const text=[];
   for(let n=1;n<=2;n++)text.push((await(await rendered.getPage(n)).getTextContent()).items.map(x=>x.str??'').join(' '));
   assert.equal(text[0].trim(),'SYN-00000001');assert.equal(text[1].trim(),'SYN-00000002');
   assert.ok(!text.join(' ').includes('synthetic-satchel-1'));assert.equal(await rendered.getAttachments(),null);assert.ok(!(await rendered.getMetadata()).info.Title);
  }finally{await task.destroy();}
  assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/documents/'+source.id+'/file?version=1',undefined,h.owner)).arrayBuffer()),original);
  await h.json(door+'/approve',{sha256:'wrong',reviewNote:'Wrong packet'},h.owner,409);
  await h.json(base+'/productions',body,h.owner,409); // Bates collisions never consume a second packet.
  await h.json(base+'/productions',{...body,batesStart:20,items:[selected(source,{revision:'stale'})]},h.owner,409);
  await h.json(base+'/productions',{...body,batesStart:20,items:[selected(source,{redactedPages:[2],reason:'Partial redaction refused'})]},h.owner,400);
  await h.json(base+'/productions',{...body,batesStart:20,items:[selected(source,{redactedPages:[3],reason:'Outside source'})]},h.owner,400);
  await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test');await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  assert.deepEqual(await h.json(base+'/productions',undefined,lawyer),[]);assert.equal((await h.request('/api/satchel'+door+'/preview',undefined,lawyer)).status,404);
  const publicPacket=await h.json(base+'/productions',{...body,batesStart:20,items:[selected(source)]},h.owner);
  assert.equal((await h.json(base+'/productions',undefined,lawyer)).length,1);
  await h.json(base+'/access',{email:'lawyer@example.test',remove:true},h.owner);
  assert.equal((await h.request('/api/satchel/productions/'+publicPacket.id+'/preview',undefined,lawyer)).status,404);
  await h.json('/team',{email:'assistant@example.test',name:'Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json(base+'/productions',undefined,assistant,403);await h.json(door+'/approve',{sha256:packet.sha256,reviewNote:'Unauthorized'},assistant,403);
  await h.json(door+'/approve',{sha256:packet.sha256,reviewNote:'Reviewed each source, redacted page, privilege log and intended recipient'},h.owner);
  const exported=await h.request('/api/satchel'+door+'/file',undefined,h.owner);assert.deepEqual(Buffer.from(await exported.arrayBuffer()),bytes);
  await h.json(door+'/recall',{reason:'Already exported cannot be recalled'},h.owner,409);
  await h.json('/productions/'+publicPacket.id+'/recall',{reason:'Withdraw before export'},h.owner);
  assert.equal((await h.request('/api/satchel/productions/'+publicPacket.id+'/preview',undefined,h.owner)).status,410);
  const recipient=await inviteRecipient(h),stranger=await inviteRecipient(h,'stranger@example.test');
  const release={sha256:packet.sha256,recipientEmail:body.recipientEmail,expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'Principal authorizes exact reviewed packet to opposing counsel'};
  await h.json(door+'/release',release,lawyer,403);
  await h.json(door+'/release',{...release,sha256:'wrong'},h.owner,409);
  await h.json(door+'/release',{...release,recipientEmail:'stranger@example.test'},h.owner,409);
  await h.json(door+'/release',{...release,expiresAt:'2000-01-01T00:00:00.000Z'},h.owner,400);
  const recalled=await h.json(door+'/release',release,h.owner),recalledDoor='/production-shares/'+recalled.id;
  await h.json(recalledDoor,undefined,recipient); // Viewing metadata leaves a release unopened.
  await h.json(recalledDoor+'/recall',{reason:'Principal withdraws before opening'},h.owner);
  await h.json(recalledDoor+'/file',{},recipient,410);
  const sharedPacket=await h.json(door+'/release',release,h.owner),shareDoor='/production-shares/'+sharedPacket.id;
  await h.json(shareDoor,undefined,'',401);await h.json(shareDoor,undefined,stranger,404);
  await h.json(shareDoor+'/file',{},stranger,404);
  await h.json(shareDoor+'/recall',{reason:'Recipient has no onward authority'},recipient,403);
  assert.equal((await h.request('/api/satchel'+shareDoor+'/file',undefined,recipient)).status,404);
  await h.json('/documents/'+source.id+'/file?version=1',undefined,recipient,403);
  const delivered=await h.request('/api/satchel'+shareDoor+'/file',{},recipient),deliveryBytes=Buffer.from(await delivered.arrayBuffer());
  assert.equal(delivered.status,200);assert.deepEqual(deliveryBytes,bytes);assert.equal(delivered.headers.get('x-production-sha256'),packet.sha256);
  const receiptId=delivered.headers.get('x-production-receipt');assert.ok(receiptId);
  await h.json(shareDoor+'/recall',{reason:'Already opened remains disclosed'},h.owner,409);
  const released=(await h.json(door+'/shares',undefined,h.owner)).find(s=>s.id===sharedPacket.id);
  assert.equal(released.status,'opened');assert.equal(released.receipts[0].id,receiptId);assert.equal(released.receipts[0].sha256,packet.sha256);assert.equal(released.receipts[0].size,bytes.length);
  const disclosed=(await h.json('/audit?matterId='+m.id+'&action=production.recipient_downloaded',undefined,h.owner)).records;
  assert.equal(disclosed[0].detail.receiptId,receiptId);assert.equal(disclosed[0].detail.sha256,packet.sha256);
  const held=await h.json('/holds',{matterId:m.id,documentId:source.id,reason:'New hold must travel in a newly reviewed packet'},h.owner);
  await h.json(door+'/release',release,h.owner,409);await h.json(shareDoor+'/file',{},recipient,410);
  await h.json('/holds/'+held.id+'/release',{reason:'Counsel releases synthetic hold'},h.owner);
  assert.equal((await h.request('/api/satchel'+shareDoor+'/file',{},recipient)).status,200);
  const events=(await h.json('/audit?matterId='+m.id+'&action=production.exported',undefined,h.owner)).records;
  assert.equal(events.length,1);assert.equal(events[0].detail.sha256,packet.sha256);assert.equal(events[0].evidence.record.recordType,'s_document_productions');assert.equal(events[0].evidence.record.status,'approved');
  await h.restart();assert.deepEqual(Buffer.from(await(await h.request('/api/satchel'+door+'/file',undefined,h.owner)).arrayBuffer()),bytes);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(Buffer.from(await(await restored.request('/api/satchel'+door+'/file',undefined,restored.owner)).arrayBuffer()),bytes);
  assert.deepEqual(await restored.json(door+'/shares',undefined,restored.owner),[]);
  await restored.json(shareDoor,undefined,restored.owner,404);
  await h.json('/retention',{matterId:m.id,documentId:source.id,disposeAfter:'2020-01-01',basis:'Expired synthetic source'},h.owner);
  const disposal=await h.json('/documents/'+source.id+'/dispose',{confirm:source.title,reason:'Counsel authorized disposal'},h.owner);assert.equal(disposal.journal.derivatives.productions,2);
  await h.json(shareDoor+'/file',{},recipient,410);
  assert.equal((await h.request('/api/satchel'+door+'/file',undefined,h.owner)).status,404);assert.deepEqual(await h.json(base+'/productions',undefined,h.owner),[]);
  // The later erasure journal also fences an earlier archive that still held a packet.
  const journal=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  assert.ok(!journal.includes('Reviewed each source, redacted page, privilege log and intended recipient'));assert.ok(!journal.includes('Withdraw before export'));
  await restored.close();restored=await harness();await restored.json('/restore',{archive,journal,confirm:'RESTORE'},restored.owner,409);
  await restored.json('/restore',{archive:journal,confirm:'RESTORE'},restored.owner);
  assert.equal((await restored.request('/api/satchel'+door+'/file',undefined,restored.owner)).status,404);
 }finally{await restored?.close();await h.close();}
});

test('native medical chronology requires health setup, pins source pages, reconciles overlapping bills only on counsel review, and erases its derivatives',async()=>{
 const {PDFDocument}=await import('pdf-lib');const h=await harness();let restored;
 try{
  const m=await open(h,'Medical chronology'),base='/matters/'+m.id,door=base+'/chronologies';
  const fixtures=await medicalPacketPdfs(),bytes=fixtures.treatment,upload=(name,content)=>h.json(base+'/documents',{name,mime:'application/pdf',visibility:'private',contentBase64:content.toString('base64')},h.owner),source=await upload('Treatment.pdf',bytes),bill=await upload('Overlapping-bill.pdf',fixtures.bill);
  const entry=(extra={})=>({documentId:source.id,version:1,page:1,kind:'treatment',provider:'Clinic',date:'2026-01-01',treatment:'synthetic-satchel-7 reviewed visit',...extra});
  const packet={reportedTotalCents:2000,gapDays:30,entries:[entry(),entry({date:'2026-03-01',page:2}),entry({kind:'bill',chargeCents:2000,page:2}),entry({documentId:bill.id,kind:'bill',chargeCents:2000,page:2})]};
  assert.equal((await h.json(door,undefined,h.owner)).setup,null);await h.json(door,packet,h.owner,409);
  await h.json(door+'/setup',{authorizationReference:'Received records authorization',agreementReference:'Native storage agreement',confirmed:false},h.owner,400);
  await h.json(door+'/setup',{authorizationReference:'Received records authorization',agreementReference:'Native storage agreement',confirmed:true},h.owner);
  await h.json(door,{...packet,entries:[entry({page:99})]},h.owner,400);
  const shared=await h.json(base+'/documents',{name:'Shared.pdf',mime:'application/pdf',visibility:'matter',contentBase64:bytes.toString('base64')},h.owner);
  await h.json(door,{...packet,entries:[entry({documentId:shared.id})]},h.owner,409);
  const extraction={reportedTotalCents:2000,gapDays:30,sources:[{documentId:source.id,version:1},{documentId:bill.id,version:1}]};
  await h.json(door,{...extraction,sources:[{documentId:shared.id,version:1}]},h.owner,409);
  const blank=await PDFDocument.create();blank.addPage();const unreadable=await upload('Unreadable.pdf',Buffer.from(await blank.save()));
  await h.json(door,{...extraction,sources:[{documentId:source.id,version:1},{documentId:unreadable.id,version:1}]},h.owner,422);
  assert.equal((await h.json(door,undefined,h.owner)).chronologies.length,0);
  const draft=await h.json(door,extraction,h.owner);
  assert.equal(draft.status,'draft');assert.equal(draft.snapshot.grossTotalCents,4000);assert.equal(draft.snapshot.unreviewedDifferenceCents,2000);assert.deepEqual(draft.snapshot.duplicates,[{index:3,possibleDuplicateOf:2}]);assert.equal(draft.snapshot.intervals[0].days,59);
  assert.equal(draft.snapshot.entries[0].sourceSha256,source.versions[0].sha256);assert.equal(draft.snapshot.entries[3].sourceName,'Overlapping-bill.pdf');assert.equal(draft.snapshot.entries[3].page,1);
  const publish='/chronologies/'+draft.id+'/publish',review={sha256:draft.sha256,reviewNote:'Counsel checked every source page and duplicate charge',decisions:[{index:3,decision:'exclude',note:'Same bill charge in overlapping packet'}]};
  await h.json(publish,{...review,decisions:[]},h.owner,400);await h.json(publish,{...review,sha256:'wrong'},h.owner,409);
  await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test');await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  await h.json('/documents/'+source.id+'/file?version=1',undefined,lawyer,404);await h.json(door,undefined,lawyer,403);await h.json(door+'/setup',{authorizationReference:'No',agreementReference:'No',confirmed:true},lawyer,403);await h.json(publish,review,lawyer,403);
  const published=await h.json(publish,review,h.owner);assert.equal(published.review.reconciledTotalCents,2000);assert.equal(published.review.differenceCents,0);await h.json(publish,review,h.owner,409);
  assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/documents/'+source.id+'/file?version=1',undefined,h.owner)).arrayBuffer()),bytes);
  await h.json(base+'/wall',{custodianEmail:'lawyer@example.test',members:['owner@example.test'],reason:'Authorized counsel audit boundary',revision:null},h.owner);
  assert.equal((await h.json('/audit?matterId='+m.id+'&action=chronology.published',undefined,lawyer)).total,0);
  assert.equal(await(await h.request('/api/satchel/audit/export?matterId='+m.id+'&action=chronology.published',undefined,lawyer)).text(),'');
  const audit=(await h.json('/audit?matterId='+m.id+'&action=chronology.published',undefined,h.owner)).records[0];assert.equal(audit.evidence.record.recordType,'s_document_chronologies');assert.equal(audit.evidence.record.sha256,draft.sha256);
  await h.restart();const state=await h.json(door,undefined,h.owner);assert.equal(state.chronologies[0].published_by,'owner@example.test');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual(await restored.json(door,undefined,restored.owner),state);
  await h.json('/retention',{matterId:m.id,documentId:source.id,disposeAfter:'2020-01-01',basis:'Expired received packet'},h.owner);
  const disposal=await h.json('/documents/'+source.id+'/dispose',{confirm:source.title,reason:'Counsel authorized disposal'},h.owner);assert.equal(disposal.journal.derivatives.chronologies,1);
  assert.deepEqual((await h.json(door,undefined,h.owner)).chronologies,[]);await h.json(publish,review,h.owner,404);
  const after=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!after.includes('synthetic-satchel-7 reviewed visit'));
 }finally{await restored?.close();await h.close();}
});
