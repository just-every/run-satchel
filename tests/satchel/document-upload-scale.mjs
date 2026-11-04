// Outside push Verify: bounded-memory transport probe of a multi-gigabyte folder.
// This local R2 receipt grants neither hosted-provider proof nor scanner clearance.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {harness,open} from './harness.mjs';
// Run explicitly with: node tests/satchel/document-upload-scale.mjs
async function proveScale(){
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const h=await harness(),started=Date.now();
try{
 const m=await open(h,'Synthetic large original folder'),door='/matters/'+m.id+'/document-uploads';
 const {limits}=await h.json(door,undefined,h.owner),size=500*1024*1024,count=5;
 const block=(file,part)=>{
  const bytes=Buffer.alloc(Math.min(limits.partBytes,size-part*limits.partBytes),65+file);
  if(!part)bytes.write('synthetic-satchel-'+(20+file)+'\n');
  return bytes;
 };
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),files=[];
 for(let i=0;i<count;i++){
  const digest=createHash('sha256');for(let p=0;p<Math.ceil(size/limits.partBytes);p++)digest.update(block(i,p));
  files.push({name:'Original-'+i+'.bin',path:'Large matter folder/Original-'+i+'.bin',mime:'application/octet-stream',visibility:'private',size,sha256:digest.digest('hex')});
 }
 const requestId=randomUUID(),batch=await h.json(door,{requestId,files},h.owner);
 assert.equal((await h.json(door,undefined,h.owner)).usedAndReservedBytes,count*size);
 for(let i=0;i<count;i++){
  const u=batch.uploads.find(u=>u.name===files[i].name);
  for(let p=0;p<Math.ceil(size/limits.partBytes);p++){
   const bytes=block(i,p),r=await h.raw('/api/satchel/document-uploads/'+u.id+'/parts/'+(p+1),{method:'POST',headers:{'content-type':'application/octet-stream','x-part-sha256':hash(bytes)},body:bytes},h.owner);assert.equal(r.status,200,await r.text());
   if(i===0&&p===3){await h.restart();const state=await h.json(door,undefined,h.owner);assert.equal(state.uploads.find(s=>s.id===u.id).parts.length,4);}
  }
  const done=await h.json('/document-uploads/'+u.id+'/complete',{},h.owner);assert.equal(done.state,'complete');assert.deepEqual(await h.json('/document-uploads/'+u.id+'/complete',{},h.owner),done);
  console.log('Completed original '+(i+1)+' of '+count+' with server-verified bytes='+size);
 }
 const docs=await h.json('/matters/'+m.id+'/documents',undefined,h.owner);assert.equal(docs.length,count);
 for(const f of files){const doc=docs.find(d=>d.title===f.name),v=doc.versions[0];assert.deepEqual([v.size,v.sha256,v.path,v.scanStatus],[f.size,f.sha256,f.path,'quarantined']);assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,423);}
 await h.json(door,{requestId,files},h.owner);assert.equal((await h.json(door,undefined,h.owner)).usedAndReservedBytes,count*size);
 console.log('PROBE DOC-001 local-scale: '+JSON.stringify({head,files:count,fileBytes:size,totalBytes:count*size,restartAfterParts:4,serverIntegrity:true,replayOnce:true,quarantined:true,durationMs:Date.now()-started,storage:'real local R2 binding',hosted:false,scannerClearance:false}));
}finally{await h.close();}
}
proveScale().catch(error=>{console.error(error);process.exitCode=1;});
