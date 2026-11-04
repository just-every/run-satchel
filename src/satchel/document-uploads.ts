import {createHash} from 'node:crypto';
import {atomic,audit,digest,human,id,insist,integer,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterGuard,mediaType,visibleDocument} from './documents';
import {guard} from './trust-guards';

type Store={DB:D1Database;ORIGINALS:R2Bucket};
export const uploadLimits={fileBytes:500*1024*1024,partBytes:8*1024*1024,files:100,matterBytes:10*1024*1024*1024,expiresHours:24};
const live="state IN ('active','completing')";
const hex=(value:unknown)=>{const v=text(value,'SHA-256',64);insist(/^[a-f0-9]{64}$/.test(v),'Supply a lowercase SHA-256 digest');return v;};
const usageSql=`SELECT
 COALESCE((SELECT SUM(v.size) FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.matter_id=? AND v.content_base64 IS NOT NULL),0)
 +COALESCE((SELECT SUM(v.size) FROM s_document_r2_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.matter_id=? AND v.object_key IS NOT NULL),0)
 +COALESCE((SELECT SUM(v.size) FROM s_document_conflicts v JOIN s_documents d ON d.id=v.document_id WHERE d.matter_id=? AND v.content_base64 IS NOT NULL),0)
 +COALESCE((SELECT SUM(size) FROM s_document_uploads WHERE matter_id=? AND ${live}),0) AS bytes`;
export function matterStorageGuard(db:D1Database,matterId:string,additionalBytes:number){return guard(db,`(${usageSql})+?<=?`,matterId,matterId,matterId,matterId,additionalBytes,uploadLimits.matterBytes);}
async function access(env:Store,actor:Actor,uploadId:string){
 human(actor);
 const u=await stmt(env.DB,'SELECT * FROM s_document_uploads WHERE id=? AND (actor_id=? OR ?=\'owner\')',uploadId,actor.id,actor.role).first<Data>();
 insist(u,'Upload not found',404);await matter(env.DB,actor,u.matter_id);
 if(u.state==='complete'){const d=await visibleDocument(env.DB,actor,u.document_id);insist(!d.erased_at,'Document not found',404);}
 return u;
}
function sessionGuard(db:D1Database,u:Data,lease?:string){return guard(db,`EXISTS(SELECT 1 FROM s_document_uploads WHERE id=? AND ${live} AND expires_at>? AND (? IS NULL OR lease=?))`,u.id,now(),lease??null,lease??null);}
async function claim(env:Store,actor:Actor,u:Data){
 insist(['active','completing'].includes(u.state)&&u.expires_at>now(),'This upload is no longer active. Start a new manifest.',409);
 const lease=id(),until=new Date(Date.now()+15*60*1000).toISOString();
 await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u),guard(env.DB,'NOT EXISTS(SELECT 1 FROM s_document_uploads WHERE id=? AND lease_until>?)',u.id,now()),stmt(env.DB,'UPDATE s_document_uploads SET lease=?,lease_until=? WHERE id=?',lease,until,u.id)]);
 return lease;
}
async function release(env:Store,u:Data,lease:string){await stmt(env.DB,'UPDATE s_document_uploads SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?',u.id,lease).run();}
async function describe(env:Store,u:Data){
 const parts=await rows(env.DB,'SELECT part_number,size,sha256 FROM s_document_upload_parts WHERE upload_id=? AND etag IS NOT NULL ORDER BY part_number',u.id);
 return {id:u.id,batchId:u.batch_id,documentId:u.state==='complete'?u.document_id:null,name:u.name,path:u.relative_path,mime:u.declared_mime,size:u.size,sha256:u.sha256,visibility:u.visibility,state:u.state,expiresAt:u.expires_at,parts:parts.map(p=>({number:p.part_number,size:p.size,sha256:p.sha256}))};
}
export async function uploadState(env:Store,actor:Actor,matterId:string){
 human(actor);await matter(env.DB,actor,matterId);
 await recoverDocumentUploads(env);
 const uploads=await rows(env.DB,'SELECT * FROM s_document_uploads WHERE matter_id=? AND (actor_id=? OR ?=\'owner\') ORDER BY created_at DESC,id',matterId,actor.id,actor.role);
 return {limits:uploadLimits,usedAndReservedBytes:actor.role==='owner'?(await stmt(env.DB,usageSql,matterId,matterId,matterId,matterId).first<Data>())!.bytes:null,uploads:await Promise.all(uploads.map(u=>describe(env,u)))};
}
export async function beginUploads(env:Store,actor:Actor,matterId:string,body:Data){
 human(actor);await matter(env.DB,actor,matterId);
 const requestKey=text(body.requestId,'Manifest request identity',100);
 insist(Array.isArray(body.files)&&body.files.length>0&&body.files.length<=uploadLimits.files,'Choose between 1 and 100 files');
 const paths=new Set<string>();
 const files=body.files.map((f:Data)=>{
  const name=text(f.name,'Filename',240),path=text(f.path??name,'Folder path',1000),mime=text(f.mime,'MIME type',120);
  insist(!/[\x00-\x1f\x7f/\\]/.test(name),'Filename cannot contain paths or control characters');
  insist(!/[\x00-\x1f\x7f\\]/.test(path)&&!path.startsWith('/')&&path.split('/').every(p=>p&&p!=='.'&&p!=='..')&&path.split('/').at(-1)===name,'Use a relative folder path ending with the filename');
  insist(!paths.has(path),'Each manifest path must be distinct');paths.add(path);
  insist(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime),'Use a MIME type without parameters');
  insist(f.visibility==='matter'||f.visibility==='private','Choose matter or private visibility');
  return {name,path,mime,size:integer(f.size,'File bytes',1,uploadLimits.fileBytes),sha256:hex(f.sha256),visibility:f.visibility};
 });
 const fingerprint=await digest(JSON.stringify({matterId,files}));
 const replay=async()=>{
  const batch=await stmt(env.DB,'SELECT * FROM s_document_upload_batches WHERE actor_id=? AND request_key=?',actor.id,requestKey).first<Data>();
  if(!batch)return null;
  insist(batch.matter_id===matterId&&batch.fingerprint===fingerprint,'That manifest identity already describes different files',409);
  const uploads=await rows(env.DB,'SELECT * FROM s_document_uploads WHERE batch_id=? ORDER BY relative_path',batch.id);
  return {id:batch.id,limits:uploadLimits,uploads:await Promise.all(uploads.map(u=>describe(env,u)))};
 };
 const previous=await replay();if(previous)return previous;
 await recoverDocumentUploads(env);
 const batchId=id(),at=now(),expires=new Date(Date.now()+uploadLimits.expiresHours*3600000).toISOString(),total=files.reduce((n:number,f:Data)=>n+f.size,0);
 insist(total<=uploadLimits.matterBytes,'This manifest exceeds the matter storage quota',413);
 const writes=[...matterGuard(env.DB,actor,matterId),matterStorageGuard(env.DB,matterId,total),stmt(env.DB,'INSERT INTO s_document_upload_batches VALUES(?,?,?,?,?,?)',batchId,matterId,actor.id,requestKey,fingerprint,at)];
 for(const f of files)writes.push(stmt(env.DB,`INSERT INTO s_document_uploads(id,batch_id,matter_id,actor_id,created_by,document_id,name,relative_path,declared_mime,size,sha256,visibility,object_key,state,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,id(),batchId,matterId,actor.id,actor.email,id(),f.name,f.path,f.mime,f.size,f.sha256,f.visibility,'matter/'+id(),expires,at));
 writes.push(audit(env.DB,actor,'document.upload_reserved',batchId,JSON.stringify({matterId,files:files.length,bytes:total})));
 try{await atomic(env.DB,actor,writes);}catch(error){const raced=await replay();if(raced)return raced;throw error;}
 return (await replay())!;
}
export async function uploadPart(env:Store,actor:Actor,uploadId:string,number:number,request:Request){
 const u=await access(env,actor,uploadId);integer(number,'Part number',1,Math.ceil(u.size/uploadLimits.partBytes));
 const expected=Math.min(uploadLimits.partBytes,u.size-(number-1)*uploadLimits.partBytes),claimed=hex(request.headers.get('x-part-sha256'));
 insist(request.body,'Supply the original part bytes');
 const chunks:Uint8Array[]=[],reader=request.body.getReader(),hash=createHash('sha256');let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;insist(size<=expected,'Part exceeds its reserved size',413);chunks.push(next.value);hash.update(next.value);}}finally{await reader.cancel();}
 insist(size===expected&&hash.digest('hex')===claimed,'Part size or SHA-256 does not match its bytes',409);
 const lease=await claim(env,actor,u);
 try{
  insist(u.state==='active','Upload completion has started',409);
  const old=await stmt(env.DB,'SELECT * FROM s_document_upload_parts WHERE upload_id=? AND part_number=?',u.id,number).first<Data>();
  insist(!old||old.sha256===claimed&&old.size===size,'A retained part cannot be replaced with different bytes',409);
  if(old?.etag)return describe(env,u);
  await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u,lease),stmt(env.DB,'INSERT OR IGNORE INTO s_document_upload_parts(upload_id,part_number,size,sha256) VALUES(?,?,?,?)',u.id,number,size,claimed)]);
  if(!u.multipart_id){
   const created=await env.ORIGINALS.createMultipartUpload(u.object_key,{httpMetadata:{contentType:'application/octet-stream'}});
   u.multipart_id=created.uploadId;
   await stmt(env.DB,'UPDATE s_document_uploads SET multipart_id=? WHERE id=? AND lease=?',u.multipart_id,u.id,lease).run();
  }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const part=await env.ORIGINALS.resumeMultipartUpload(u.object_key,u.multipart_id).uploadPart(number,bytes);
  await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u,lease),stmt(env.DB,'UPDATE s_document_upload_parts SET etag=? WHERE upload_id=? AND part_number=? AND sha256=?',part.etag,u.id,number,claimed)]);
  return describe(env,u);
 }finally{await release(env,u,lease);}
}
export async function completeUpload(env:Store,actor:Actor,uploadId:string){
 const u=await access(env,actor,uploadId);if(u.state==='complete')return describe(env,u);
 const lease=await claim(env,actor,u);
 try{
  const parts=await rows(env.DB,'SELECT * FROM s_document_upload_parts WHERE upload_id=? ORDER BY part_number',u.id);
  insist(u.multipart_id&&parts.length===Math.ceil(u.size/uploadLimits.partBytes)&&parts.every((p,i)=>p.part_number===i+1&&p.etag),'Upload every part before completing',409);
  await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u,lease),stmt(env.DB,"UPDATE s_document_uploads SET state='completing' WHERE id=?",u.id)]);
  // A completion acknowledgment may have been lost. Read its random key first;
  // never start a second original or a second quota charge on retry.
  if(!await env.ORIGINALS.head(u.object_key))await env.ORIGINALS.resumeMultipartUpload(u.object_key,u.multipart_id).complete(parts.map(p=>({partNumber:p.part_number,etag:p.etag})));
  const object=await env.ORIGINALS.get(u.object_key);insist(object,'Completed original is unavailable',503);
  const reader=object.body.getReader(),hash=createHash('sha256');let size=0,prefix=new Uint8Array();
  while(true){const next=await reader.read();if(next.done)break;if(!prefix.length)prefix=next.value.slice(0,1024);size+=next.value.length;hash.update(next.value);}
  if(size!==u.size||hash.digest('hex')!==u.sha256){
   await stmt(env.DB,"UPDATE s_document_uploads SET state='invalid' WHERE id=? AND lease=?",u.id,lease).run();
   await env.ORIGINALS.delete(u.object_key);insist(false,'The assembled original failed its size or SHA-256 check. Start a new manifest.',409);
  }
  const at=now();
  await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u,lease),
   stmt(env.DB,'INSERT INTO s_documents(id,matter_id,title,visibility,created_by,created_at,current_version,revision,updated_by,updated_channel,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?,?)',u.document_id,u.matter_id,u.name,u.visibility,u.created_by,at,id(),actor.email,actor.channel,at),
   stmt(env.DB,"INSERT INTO s_document_r2_versions(document_id,version,name,relative_path,mime,declared_mime,size,sha256,object_key,created_by,created_channel,created_at) VALUES(?,1,?,?,?,?,?,?,?,?,?,?)",u.document_id,u.name,u.relative_path,mediaType(prefix),u.declared_mime,u.size,u.sha256,u.object_key,u.created_by,actor.channel,at),
   stmt(env.DB,"UPDATE s_document_uploads SET state='complete' WHERE id=?",u.id),audit(env.DB,actor,'document.upload_quarantined',u.document_id,JSON.stringify({uploadId:u.id,sha256:u.sha256,size:u.size,scanStatus:'quarantined'}))]);
  return describe(env,{...u,state:'complete'});
 }finally{await release(env,u,lease);}
}
async function removeTransfer(env:Store,u:Data){
 if(u.multipart_id){try{await env.ORIGINALS.resumeMultipartUpload(u.object_key,u.multipart_id).abort();}catch{/* Completed multipart handles no longer exist; their object is removed next. */}}
 await env.ORIGINALS.delete(u.object_key);
 await env.DB.batch([stmt(env.DB,'DELETE FROM s_document_upload_parts WHERE upload_id=?',u.id),stmt(env.DB,'UPDATE s_document_uploads SET cleaned_at=? WHERE id=?',now(),u.id)]);
}
export async function cancelUpload(env:Store,actor:Actor,uploadId:string){
 const u=await access(env,actor,uploadId);insist(u.state!=='complete','Retained originals require the document erasure or retention door',409);
 const lease=await claim(env,actor,u);
 try{
  await atomic(env.DB,actor,[...matterGuard(env.DB,actor,u.matter_id),sessionGuard(env.DB,u,lease),stmt(env.DB,"UPDATE s_document_uploads SET state='cancelled' WHERE id=?",u.id),audit(env.DB,actor,'document.upload_cancelled',u.id)]);
  await removeTransfer(env,u);return {id:u.id,state:'cancelled'};
 }finally{await release(env,u,lease);}
}
export async function recoverDocumentUploads(env:Store,at=now()){
 for(const key of await rows(env.DB,'SELECT object_key FROM s_document_upload_gc')){await env.ORIGINALS.delete(key.object_key);await stmt(env.DB,'DELETE FROM s_document_upload_gc WHERE object_key=?',key.object_key).run();}
 // Fence publication before touching storage. Active leases are never swept.
 const stale=await rows(env.DB,`SELECT * FROM s_document_uploads WHERE (${live} AND expires_at<=? AND (lease_until IS NULL OR lease_until<=?)) OR (state IN ('expired','cancelled','invalid') AND cleaned_at IS NULL) LIMIT 100`,at,at);
 for(const u of stale){
  const result=await stmt(env.DB,`UPDATE s_document_uploads SET state='expired' WHERE id=? AND ${live} AND expires_at<=? AND (lease_until IS NULL OR lease_until<=?)`,u.id,at,at).run();
  if(!result.meta.changes&&!['expired','cancelled','invalid'].includes(u.state))continue;
  await removeTransfer(env,u);
 }
}
// Erasure removes the storage reference transactionally; a later cleanup can
// retry physical deletion without giving a reader or old upload a new door.
export function eraseR2Versions(db:D1Database,documentId:string){return [stmt(db,'INSERT OR IGNORE INTO s_document_upload_gc SELECT object_key FROM s_document_r2_versions WHERE document_id=? AND object_key IS NOT NULL',documentId),stmt(db,'UPDATE s_document_r2_versions SET object_key=NULL WHERE document_id=?',documentId)];}
