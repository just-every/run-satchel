import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {harness,open} from './harness.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=(bytes,name='Record.pdf',extra={})=>({name,mime:'application/pdf',size:bytes.length,sha256:hash(bytes),visibility:'private',...extra});
export async function proveDocumentUploads(){
 const h=await harness();try{
  const colleagueAddress=['synthetic-satchel-3','example.test'].join('@');
  const m=await open(h,'Resumable original matter'),door='/matters/'+m.id+'/document-uploads';
  const bytes=Buffer.alloc(16*1024*1024,65);bytes.write('%PDF-1.7\nsynthetic-satchel-1\n');
  const start=(files,requestId=randomUUID(),cookie=h.owner,expected=200)=>h.json(door,{requestId,files},cookie,expected);
  const state=()=>h.json(door,undefined,h.owner);
  const part=async(u,number,data,expected=200,claimed=hash(data),cookie=h.owner)=>{
   const r=await h.raw('/api/satchel/document-uploads/'+u.id+'/parts/'+number,{method:'POST',headers:{'content-type':'application/octet-stream','x-part-sha256':claimed},body:data},cookie);
   const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result;
  };
  const complete=(u,cookie=h.owner,expected=200)=>h.json('/document-uploads/'+u.id+'/complete',{},cookie,expected);
  const cancel=u=>h.json('/document-uploads/'+u.id+'/cancel',{},h.owner);
  const key=randomUUID(),files=[manifest(bytes,'Record.pdf',{path:'Matter folder/Record.pdf'}),manifest(Buffer.from('synthetic-satchel-2'),'Notes.txt',{mime:'text/plain',path:'Matter folder/Notes.txt'})];
  const batch=await start(files,key),u=batch.uploads.find(f=>f.name==='Record.pdf'),notes=batch.uploads.find(f=>f.name==='Notes.txt'),limit=batch.limits;
  assert.equal((await state()).usedAndReservedBytes,bytes.length+files[1].size,'Every manifest original reserves bytes before storage');
  assert.deepEqual((await start(files,key)).uploads.map(f=>f.id),batch.uploads.map(f=>f.id),'Replayed manifests retain each original identity');
  await start([{...files[0],name:'Different.pdf',path:'Different.pdf'}],key,h.owner,409);
  await complete(u,h.owner,409);
  const first=bytes.subarray(0,limit.partBytes),second=bytes.subarray(limit.partBytes);
  await part(u,1,first,409,'0'.repeat(64));
  await part(u,1,first);await part(u,1,first);
  const altered=Buffer.from(first);altered[100]=66;await part(u,1,altered,409);
  await h.restart();
  const resumed=(await state()).uploads.find(f=>f.id===u.id);assert.deepEqual(resumed.parts.map(p=>[p.number,p.size,p.sha256]),[[1,first.length,hash(first)]],'Restart recovers the verified part manifest from the real local R2 binding');
  await h.json('/team',{email:colleagueAddress,name:'Upload colleague',role:'lawyer'},h.owner);
  await h.json('/team/invite',{email:colleagueAddress},h.owner);const colleague=await h.login(colleagueAddress);
  await h.json('/matters/'+m.id+'/access',{email:colleagueAddress},h.owner);
  await h.json('/document-uploads/'+u.id+'/complete',{},colleague,404);
  const colleagueView=await h.json(door,undefined,colleague);assert.equal(colleagueView.usedAndReservedBytes,null);assert.equal(colleagueView.uploads.length,0,'Another uploader receives neither private filenames nor storage counts');
  const their=await start([manifest(Buffer.from('synthetic-satchel-4'),'Colleague.txt',{mime:'text/plain',visibility:'matter'})],randomUUID(),colleague);
  await h.json('/matters/'+m.id+'/access',{email:colleagueAddress,remove:true},h.owner);
  await part(their.uploads[0],1,Buffer.from('synthetic-satchel-4'),404,hash(Buffer.from('synthetic-satchel-4')),colleague);
  await complete(their.uploads[0],colleague,404);
  await h.json(door,undefined,colleague,404);
  const session=(await h.json('/security/devices',undefined,colleague)).currentSessionId;
  await h.json('/security/devices/'+session+'/revoke',{},colleague);
  await complete(their.uploads[0],colleague,401);
  await part(their.uploads[0],1,Buffer.from('synthetic-satchel-4'),401,hash(Buffer.from('synthetic-satchel-4')),colleague);
  await cancel(their.uploads[0]);
  await part(u,2,second);const done=await complete(u);assert.equal(done.state,'complete');
  assert.deepEqual(await complete(u),done,'Repeated completion publishes exactly one version');
  const docs=await h.json('/matters/'+m.id+'/documents',undefined,h.owner),doc=docs.find(d=>d.id===done.documentId);
  assert.equal(doc.currentVersion,1);assert.equal(doc.versions.length,1);assert.equal(doc.versions[0].sha256,hash(bytes));assert.equal(doc.versions[0].scanStatus,'quarantined');assert.equal(doc.versions[0].path,'Matter folder/Record.pdf');
  assert.equal((await state()).usedAndReservedBytes,bytes.length+files[1].size,'Completion converts a reservation to retained storage once');
  for(const suffix of ['/file','/file?version=1','/file?version=1&sha256='+hash(bytes)])assert.equal((await h.request('/api/satchel/documents/'+doc.id+suffix,undefined,h.owner)).status,423,'No quarantined download or preview bytes');
  const activeColleague=await h.login(colleagueAddress);await h.json('/matters/'+m.id+'/access',{email:colleagueAddress},h.owner);
  assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,activeColleague)).status,404);
  await h.json('/documents/'+doc.id+'/text?version=1&sha256='+hash(bytes)+'&page=1&format=json',undefined,h.owner,409);
  await h.json('/documents/'+doc.id+'/annotations',{version:1,page:1,note:'Cannot process quarantined bytes'},h.owner,404);
  const search=await h.json('/search?q=synthetic-satchel-1',undefined,h.owner);assert.equal(search.total,0,'No body text derivative of a quarantined original');
  await h.json('/matters/'+m.id+'/productions',{batesPrefix:'S',batesStart:1,recipientName:'Synthetic recipient',recipientEmail:colleagueAddress,items:[{documentId:doc.id,revision:doc.revision,version:1,privilege:'Reviewed',redactedPages:[]}]},h.owner,404);
  await h.json('/matters/'+m.id+'/chronologies/setup',{confirmed:true,authorizationReference:'synthetic-satchel-6',agreementReference:'synthetic-satchel-7'},h.owner);
  await h.json('/matters/'+m.id+'/chronologies',{sources:[{documentId:doc.id,version:1}],gapDays:30,reportedTotalCents:0},h.owner,404);
  const wrong=await start([manifest(Buffer.from('synthetic-satchel-5'),'Wrong.txt',{mime:'text/plain',sha256:'0'.repeat(64)})]);await part(wrong.uploads[0],1,Buffer.from('synthetic-satchel-5'));await complete(wrong.uploads[0],h.owner,409);
  assert.equal((await state()).uploads.find(f=>f.id===wrong.uploads[0].id).state,'invalid');
  const before=(await state()).usedAndReservedBytes;
  const quotaFiles=Array.from({length:21},(_,i)=>manifest(bytes,'Quota-'+i+'.pdf',{size:i===20?limit.matterBytes-20*limit.fileBytes:limit.fileBytes}));
  await start(quotaFiles,randomUUID(),h.owner,409);
  assert.equal((await state()).usedAndReservedBytes,before,'A rejected quota reservation changes nothing');
  await start([manifest(bytes,'Too-big.pdf',{size:limit.fileBytes+1})],randomUUID(),h.owner,400);
  assert.equal((await state()).usedAndReservedBytes,before);
  // Concurrent reservations cannot both consume the final available space.
  const reserve=()=>start(Array.from({length:11},(_,i)=>manifest(bytes,'Concurrent-'+i+'.pdf',{size:limit.fileBytes})));
  const race=await Promise.allSettled([reserve(),reserve()]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  const winning=race.find(r=>r.status==='fulfilled').value;
  let remaining=limit.matterBytes-(await state()).usedAndReservedBytes;const fill=[];
  while(remaining){const size=Math.min(remaining,limit.fileBytes);fill.push(manifest(bytes,'Remaining-'+fill.length+'.pdf',{size}));remaining-=size;}
  const filled=await start(fill);assert.equal((await state()).usedAndReservedBytes,limit.matterBytes);
  await h.json('/matters/'+m.id+'/documents',{name:'Quota-bypass.txt',mime:'text/plain',contentBase64:Buffer.from('synthetic-satchel-9').toString('base64'),visibility:'matter'},h.owner,409);
  assert.equal((await state()).usedAndReservedBytes,limit.matterBytes,'The legacy small-original door cannot bypass reserved quota');
  for(const file of [...winning.uploads,...filled.uploads])await cancel(file);
  await part(notes,1,Buffer.from('synthetic-satchel-2'));await complete(notes);
  const backup=await h.request('/api/satchel/backup',undefined,h.owner);assert.equal(backup.status,200);
  const archive=await backup.text();assert.ok(JSON.parse(archive.split('\n')[0]).objects.some(o=>o.sha256===hash(bytes)),'Streamed archive retains the exact completed original');
  const target=await harness();try{
   const response=await target.raw('/api/satchel/restore',{method:'POST',headers:{'content-type':'application/x-ndjson','x-satchel-confirm':'RESTORE'},body:archive},target.owner);assert.equal(response.status,200,await response.text());
   const restored=(await target.json('/matters/'+m.id+'/documents',undefined,target.owner)).find(d=>d.id===doc.id);
   assert.equal(restored.versions[0].sha256,hash(bytes));assert.equal(restored.versions[0].scanStatus,'quarantined');
   assert.equal((await target.request('/api/satchel/documents/'+doc.id+'/file',undefined,target.owner)).status,423);
   assert.deepEqual((await target.json(door,undefined,target.owner)).uploads,[],'Archive restores originals without transfer credentials or reservations');
  }finally{await target.close();}
  const hold=await h.json('/holds',{matterId:m.id,documentId:doc.id,reason:'Retain original'},h.owner);
  await h.json('/documents/'+doc.id+'/erase',{confirm:doc.title,reason:'Must refuse held bytes'},h.owner,409);
  await h.json('/holds/'+hold.id+'/release',{reason:'Authorized release'},h.owner);
  await h.json('/retention',{matterId:m.id,documentId:doc.id,disposeAfter:'2020-01-01',basis:'Expired synthetic record'},h.owner);
  const disposed=await h.json('/documents/'+doc.id+'/dispose',{confirm:doc.title,reason:'Approved disposal'},h.owner);
  assert.deepEqual(disposed.journal.originals.map(v=>[v.version,v.size,v.sha256]),[[1,bytes.length,hash(bytes)]]);
  await complete(u,h.owner,404);await start(files,key,h.owner,404);assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,404);
  const afterArchive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!JSON.parse(afterArchive.split('\n')[0]).objects.some(o=>o.sha256===hash(bytes)),'Disposed original bytes are absent from the archive');
  const abandoned=await start([manifest(first,'Abandoned.pdf')]);await part(abandoned.uploads[0],1,first);
  assert.equal((await h.request('/api/satchel/backup',undefined,h.owner)).status,409,'Active reservations block incomplete archives');
  await h.scheduled(Date.parse(abandoned.uploads[0].expiresAt)+1);
  const recovered=(await state()).uploads.find(f=>f.id===abandoned.uploads[0].id);assert.equal(recovered.state,'expired');await complete(recovered,h.owner,409);
  assert.equal((await state()).usedAndReservedBytes,files[1].size,'Expired and disposed originals release quota without duplicating charges');
  await proveResumableVersions(h);
  await proveReviewedVersionRecovery(h);
  await proveFolderFormats(h);
  console.log('PROBE DOC-001 native: 16 MiB interrupted and resumed in real local R2; altered parts and final hash refused; quota, revocation, replay, quarantine, archive, holds, disposal and expiry passed');
 }finally{await h.close();}
}

async function proveResumableVersions(h){
 const matter=await open(h,'Versioned R2 originals'),door='/matters/'+matter.id+'/document-uploads',small=Buffer.from('synthetic-satchel-10');
 const legacy=await h.json('/matters/'+matter.id+'/documents',{name:'Working.txt',mime:'text/plain',visibility:'private',contentBase64:small.toString('base64')},h.owner);
 const bytes=Buffer.alloc(16*1024*1024,66);bytes.write('%PDF-1.7\nsynthetic-satchel-11\n');
 const files=[manifest(bytes,'Working.pdf',{documentId:legacy.id,revision:legacy.revision})],requestId=randomUUID();
 const start=(input=files,key=requestId,cookie=h.owner,expected=200)=>h.json(door,{files:input,requestId:key},cookie,expected);
 const parts=async(u,data,cookie=h.owner,expected=200)=>{
  for(let n=0;n<data.length;n+=8*1024*1024){const part=data.subarray(n,n+8*1024*1024),r=await h.raw('/api/satchel/document-uploads/'+u.id+'/parts/'+(n/(8*1024*1024)+1),{method:'POST',headers:{'content-type':'application/octet-stream','x-part-sha256':hash(part)},body:part},cookie);assert.equal(r.status,expected,await r.text());}
 };
 const complete=(u,expected=200,cookie=h.owner)=>h.json('/document-uploads/'+u.id+'/complete',{},cookie,expected);
 const cancel=u=>h.json('/document-uploads/'+u.id+'/cancel',{},h.owner);
 const original=await start(),u=original.uploads[0];await parts(u,bytes);await h.restart();
 const done=await complete(u);assert.equal(done.documentId,legacy.id);
 assert.deepEqual(await complete(u),done);assert.equal((await start()).uploads[0].id,u.id,'Manifest replay does not require a now-superseded base revision');
 let doc=(await h.json('/matters/'+matter.id+'/documents',undefined,h.owner)).find(d=>d.id===legacy.id);
 assert.equal(doc.currentVersion,2);assert.deepEqual(doc.versions.map(v=>[v.version,v.sha256,v.scanStatus]),[[1,hash(small),'legacy'],[2,hash(bytes),'quarantined']]);
 assert.equal((await h.json(door,undefined,h.owner)).usedAndReservedBytes,small.length+bytes.length);
 const old=await h.request('/api/satchel/documents/'+legacy.id+'/file?version=1',undefined,h.owner);assert.equal(old.status,200);assert.deepEqual(Buffer.from(await old.arrayBuffer()),small,'An appended quarantine never rewrites its retained predecessor');
 assert.equal((await h.request('/api/satchel/documents/'+legacy.id+'/file',undefined,h.owner)).status,423);
 await h.json('/documents/'+legacy.id+'/text?version=1&sha256='+hash(small)+'&page=1&format=json',undefined,h.owner,409);
 await start(files,randomUUID(),h.owner,409);
 // Two pending versions may retain bytes, but only the exact selected revision may publish.
 const next=Buffer.from('synthetic-satchel-12'),nextFiles=[manifest(next,'Next.txt',{mime:'text/plain',documentId:doc.id,revision:doc.revision})];
 const a=(await start(nextFiles,randomUUID())).uploads[0],b=(await start(nextFiles,randomUUID())).uploads[0];await parts(a,next);await parts(b,next);
 const outcomes=await Promise.all([h.request('/api/satchel/document-uploads/'+a.id+'/complete',{},h.owner),h.request('/api/satchel/document-uploads/'+b.id+'/complete',{},h.owner)]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 const loser=outcomes[0].status===409?a:b;await cancel(loser);
 doc=(await h.json('/matters/'+matter.id+'/documents',undefined,h.owner)).find(d=>d.id===legacy.id);assert.equal(doc.currentVersion,3);assert.equal(doc.versions.length,3);
 const colleagueAddress=['synthetic-satchel-13','example.test'].join('@');
 await h.json('/team',{email:colleagueAddress,name:'Version colleague',role:'lawyer'},h.owner);await h.json('/team/invite',{email:colleagueAddress},h.owner);const colleague=await h.login(colleagueAddress);
 await h.json('/matters/'+matter.id+'/access',{email:colleagueAddress},h.owner);
 await start([{...nextFiles[0],revision:doc.revision}],randomUUID(),colleague,404);
 const shared=await h.json('/matters/'+matter.id+'/documents',{name:'Shared.txt',mime:'text/plain',visibility:'matter',contentBase64:small.toString('base64')},h.owner);
 await start([manifest(next,'Shared.txt',{mime:'text/plain',documentId:shared.id,revision:shared.revision,visibility:'matter'})],randomUUID(),colleague,403);
 // A revoked author cannot read a transfer manifest, add parts, finish or cancel it.
 const theirs=await h.json('/matters/'+matter.id+'/documents',{name:'Their.txt',mime:'text/plain',visibility:'private',contentBase64:small.toString('base64')},colleague);
 const their=(await start([manifest(next,'Their-next.txt',{mime:'text/plain',documentId:theirs.id,revision:theirs.revision})],randomUUID(),colleague)).uploads[0];
 const permissions={rates:'all',bank:'full',reports:'firm',contacts:'write',documents:'read',billing:'write',settings:'write'};
 const role=await h.json('/roles',{name:'Transfer review ceiling',permissions,reason:'Allow document reads only'},h.owner);
 await h.json('/team',{email:colleagueAddress,name:'Version colleague',role:'lawyer',customRoleId:role.id},h.owner);
 const review={revision:theirs.revision,sha256:hash(next),reason:'Explicit author review under current document permissions',confirmed:true};
 await h.json('/document-uploads/'+their.id+'/review',review,colleague,403);
 await h.json('/roles',{id:role.id,revision:role.revision,name:role.name,permissions:{...permissions,documents:'write'},reason:'Allow document maintenance within existing author authority'},h.owner);
 const reviewed=await h.json('/document-uploads/'+their.id+'/review',review,colleague);
 assert.equal(reviewed.reviewedRevision,theirs.revision,'A currently authorized author with a custom document-write role can review');

 await h.json('/matters/'+matter.id+'/access',{email:colleagueAddress,remove:true},h.owner);
 await parts(their,next,colleague,404);await complete(their,404,colleague);await h.json('/document-uploads/'+their.id+'/cancel',{},colleague,404);await h.json('/document-uploads/'+their.id+'/review',{revision:theirs.revision,sha256:hash(next),reason:'Revoked author cannot review',confirmed:true},colleague,404);await h.json(door,undefined,colleague,404);await cancel(their);
 const pending=(await start([manifest(Buffer.from('synthetic-satchel-14'),'Erased.txt',{mime:'text/plain',documentId:doc.id,revision:doc.revision})],randomUUID())).uploads[0];await parts(pending,Buffer.from('synthetic-satchel-14'));
 await h.json('/documents/'+doc.id+'/erase',{confirm:doc.title,reason:'Erase all retained and pending originals'},h.owner);
 await complete(pending,404);await parts(pending,Buffer.from('synthetic-satchel-14'),h.owner,404);
 assert.ok(!(await h.json(door,undefined,h.owner)).uploads.some(s=>s.id===pending.id),'Erased originals cannot return through a saved transfer');
 console.log('PROBE DOC-001 versions: legacy predecessor retained byte-identically; 16 MiB R2 version resumed after restart; replay publishes once; concurrent stale completion, unauthorized author, revoked access and erased transfer refused');
}

async function proveReviewedVersionRecovery(h){
 const m=await open(h,'Reviewed transfer recovery'),door='/matters/'+m.id+'/document-uploads';
 const small=Buffer.from('synthetic-satchel-30'),original=await h.json('/matters/'+m.id+'/documents',{name:'Review.txt',mime:'text/plain',visibility:'private',contentBase64:small.toString('base64')},h.owner);
 const bytes=Buffer.alloc(16*1024*1024,82),files=[manifest(bytes,'Transferred.txt',{mime:'text/plain',documentId:original.id,revision:original.revision})],requestId=randomUUID();
 const u=(await h.json(door,{files,requestId},h.owner)).uploads[0];
 for(let n=0;n<2;n++){const data=bytes.subarray(n*8*1024*1024,(n+1)*8*1024*1024),r=await h.raw('/api/satchel/document-uploads/'+u.id+'/parts/'+(n+1),{method:'POST',headers:{'content-type':'application/octet-stream','x-part-sha256':hash(data)},body:data},h.owner);assert.equal(r.status,200,await r.text());}
 // A normal edit wins while the original is transferring. Completion must
 // preserve both versions and ask for an explicit review, without retransfers.
 const edit=async(doc,value)=>h.json('/matters/'+m.id+'/documents',{documentId:doc.id,revision:doc.revision,name:'Review.txt',mime:'text/plain',visibility:'private',contentBase64:Buffer.from(value).toString('base64')},h.owner);
 let current=await edit(original,'synthetic-satchel-31');
 const complete=(expected=200,cookie=h.owner)=>h.json('/document-uploads/'+u.id+'/complete',{},cookie,expected);
 await complete(409);
 const read=()=>h.json(door,undefined,h.owner),before=await read(),reserved=before.usedAndReservedBytes,retained=before.uploads.find(s=>s.id===u.id).parts;
 assert.deepEqual(retained.map(p=>p.number),[1,2]);assert.equal(before.uploads.find(s=>s.id===u.id).currentRevision,current.revision);
 const reviewBody={revision:current.revision,sha256:hash(bytes),reason:'Reviewed the intervening original; keep this transfer as the next version.',confirmed:true};
 const review=(body=reviewBody,expected=200,cookie=h.owner)=>h.json('/document-uploads/'+u.id+'/review',body,cookie,expected);
 await review({...reviewBody,confirmed:false},400);
 await review({...reviewBody,sha256:'0'.repeat(64)},409);
 await review({...reviewBody,revision:original.revision},409);
 const address=['synthetic-satchel-32','example.test'].join('@');
 await h.json('/team',{email:address,name:'Unrelated reviewer',role:'lawyer'},h.owner);await h.json('/team/invite',{email:address},h.owner);const other=await h.login(address);
 await h.json('/matters/'+m.id+'/access',{email:address},h.owner);await review(reviewBody,404,other);
 assert.equal((await read()).usedAndReservedBytes,reserved,'Refused reviews neither publish nor charge');
 const reviewed=await review();assert.equal(reviewed.baseRevision,original.revision);assert.equal(reviewed.reviewedRevision,current.revision);
 assert.deepEqual(await review(),reviewed,'A replayed exact review is idempotent');
 // Another edit invalidates even a previously accepted review.
 current=await edit(current,'synthetic-satchel-33');await complete(409);await review(reviewBody,409);
 const fresh={...reviewBody,revision:current.revision};await review(fresh);await h.restart();
 const resumed=(await read()).uploads.find(s=>s.id===u.id);assert.equal(resumed.reviewedRevision,current.revision);assert.deepEqual(resumed.parts,retained);
 const done=await complete();assert.deepEqual(await complete(),done);
 const docs=await h.json('/matters/'+m.id+'/documents',undefined,h.owner),doc=docs.find(d=>d.id===original.id);
 assert.equal(doc.currentVersion,4);assert.deepEqual(doc.versions.map(v=>v.sha256),[hash(small),hash(Buffer.from('synthetic-satchel-31')),hash(Buffer.from('synthetic-satchel-33')),hash(bytes)]);
 assert.equal(doc.versions[3].scanStatus,'quarantined');assert.equal((await read()).usedAndReservedBytes,reserved+Buffer.byteLength('synthetic-satchel-33'),'Reviewed completion converts only its existing reservation');
 assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,423);
 await review(fresh,409);
 const audit=await h.json('/audit?action=document.upload_revision_reviewed&matterId='+m.id,undefined,h.owner),reviews=audit.records.filter(a=>a.objectId===doc.id);
 assert.equal(reviews.length,2,'Only successful distinct reviews append history');
 for(const entry of reviews){const data=entry.detail;assert.equal(data.baseRevision,original.revision);assert.equal(data.sha256,hash(bytes));assert.ok(data.reason);}
 const backup=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
 assert.ok(JSON.parse(backup.split('\n')[0]).objects.some(o=>o.sha256===hash(bytes)),'The reviewed quarantined bytes remain recoverable');
 await h.json('/documents/'+doc.id+'/erase',{confirm:doc.title,reason:'Erase reviewed original'},h.owner);
 await h.json(door,{files,requestId},h.owner,404);await complete(404);await review(fresh,404);
 const expiryDoc=await h.json('/matters/'+m.id+'/documents',{name:'Expiring.txt',mime:'text/plain',visibility:'private',contentBase64:small.toString('base64')},h.owner);
 const expired=(await h.json(door,{requestId:randomUUID(),files:[manifest(small,'Expiring-next.txt',{mime:'text/plain',documentId:expiryDoc.id,revision:expiryDoc.revision})]},h.owner)).uploads[0];
 await h.scheduled(Date.parse(expired.expiresAt)+1);
 await h.json('/document-uploads/'+expired.id+'/review',{revision:expiryDoc.revision,sha256:hash(small),reason:'An expired reservation grants no authority',confirmed:true},h.owner,409);
 assert.equal((await h.json('/matters/'+m.id+'/documents',undefined,h.owner)).find(d=>d.id===expiryDoc.id).currentVersion,1);
 console.log('PROBE DOC-001 review: changed target refused until exact-revision and exact-hash human review; stale and unauthorized reviews refused; restart retained all parts; one quarantined version and one quota charge; erased manifest replay refused');
}

async function proveFolderFormats(h){
 const {uploadOriginals}=await import('./document-upload-fixtures.mjs'),originals=await uploadOriginals(),m=await open(h,'Mixed original folder'),door='/matters/'+m.id+'/document-uploads';
 const files=originals.map(f=>manifest(f.bytes,f.name,{mime:f.mime,path:'Matter folder/'+f.name,visibility:'matter'})),requestId=randomUUID();
 await h.json(door,{requestId,files:[{...files[0],path:'../Record.pdf'}]},h.owner,400);
 await h.json(door,{requestId,files:[files[0],files[0]]},h.owner,400);
 const batch=await h.json(door,{requestId,files},h.owner),total=originals.reduce((n,f)=>n+f.bytes.length,0);
 assert.equal((await h.json(door,undefined,h.owner)).usedAndReservedBytes,total);
 for(const file of originals){
  const u=batch.uploads.find(u=>u.name===file.name),r=await h.raw('/api/satchel/document-uploads/'+u.id+'/parts/1',{method:'POST',headers:{'content-type':'application/octet-stream','x-part-sha256':hash(file.bytes)},body:file.bytes},h.owner);assert.equal(r.status,200,await r.text());
  await h.json('/document-uploads/'+u.id+'/complete',{},h.owner);
 }
 const docs=await h.json('/matters/'+m.id+'/documents',undefined,h.owner);assert.equal(docs.length,originals.length);
 for(const file of originals){
  const doc=docs.find(d=>d.title===file.name),v=doc.versions[0];assert.deepEqual([v.size,v.sha256,v.declaredMime,v.path,v.scanStatus],[file.bytes.length,hash(file.bytes),file.mime,'Matter folder/'+file.name,'quarantined']);
  assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file?version=1',undefined,h.owner)).status,423);
 }
 assert.equal((await h.json(door,{requestId,files},h.owner)).uploads.length,originals.length);assert.equal((await h.json(door,undefined,h.owner)).usedAndReservedBytes,total);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),manifestRow=JSON.parse(archive.split('\n')[0]);
 for(const file of originals)assert.ok(manifestRow.objects.some(o=>o.sha256===hash(file.bytes)&&o.size===file.bytes.length),'The streamed archive includes each exact original format');
 console.log('PROBE DOC-001 folder: actual PDF, DOCX, PNG, WAV and MP4 originals retained under relative folder paths; every original hash verified, quota reserved once, archive includes every original and quarantine refuses every download');
}
