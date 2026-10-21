import type {Bindings} from '../auth.server';
import {atomic,audit,digest,id,insist,stmt,text,type Actor,type Data} from './model';
import {staff,visibleLeadSql} from './leads';
import {guard} from './trust-guards';

export const intakeFileLimit=10*1024*1024;
export type StagedIntakeFile={id:string;name:string;mime:string;size:number;sha256:string;objectKey:string};
const visibleParams=(actor:Actor)=>[actor.role,actor.role,actor.email,actor.role,actor.email];
// Every original lead and every surviving lead on the current merge path must be visible.
export async function visibleIntakeLeadPath(db:D1Database,actor:Actor,sourceId:string){
 staff(actor);
 const path:Data[]=[],seen=new Set<string>();let next:string|null=sourceId;
 while(next){
  insist(!seen.has(next),'Invalid lead merge history',409);seen.add(next);
  const lead:Data|null=await stmt(db,`SELECT * FROM s_leads l WHERE l.id=? AND ${visibleLeadSql}`,next,...visibleParams(actor)).first<Data>();
  insist(lead,'Lead not found',404);path.push(lead);next=lead.status==='merged'?lead.merged_into:null;
 }
 return path;
}
export function intakePathGuards(db:D1Database,actor:Actor,path:Data[]){
 return path.map(lead=>guard(db,`EXISTS(SELECT 1 FROM s_leads l WHERE l.id=? AND l.revision=? AND ${visibleLeadSql})`,lead.id,lead.revision,...visibleParams(actor)));
}
export async function removeStagedIntakeFiles(env:Bindings,files:StagedIntakeFile[]){
 if(files.length){await env.ORIGINALS.delete(files.map(f=>f.objectKey));await env.DB.batch(files.map(f=>stmt(env.DB,'DELETE FROM s_intake_uploads WHERE object_key=?',f.objectKey)));}
}
function actualMime(bytes:Uint8Array){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=5&&[37,80,68,70,45].every((n,i)=>bytes[i]===n))return 'application/pdf';
 return null;
}
export async function stageIntakeFiles(env:Bindings,values:FormDataEntryValue[]){
 insist(values.length<=3,'Attach at most three files');
 const staged:StagedIntakeFile[]=[];
 try {
  for(const value of values){
   insist(typeof value!=='string','Attach files through the upload field');
   insist(value.size>0&&value.size<=intakeFileLimit,'Each attachment must be between 1 byte and 10 MiB',413);
   const bytes=new Uint8Array(await value.arrayBuffer()),mime=actualMime(bytes);
   insist(mime&&value.type===mime,'Attach a PDF, PNG or JPEG whose contents match its type');
   const name=text(value.name,'File name',200);insist(!/[\u0000-\u001f\u007f]/.test(name),'File name contains control characters');
   const file={id:id(),name,mime,size:bytes.byteLength,sha256:await digest(bytes),objectKey:`intake/${id()}`};
   // Register before put: even a failed/uncertain put is cleaned up by its own random key.
   staged.push(file);
   await stmt(env.DB,'INSERT INTO s_intake_uploads(object_key,expires_at) VALUES(?,?)',file.objectKey,new Date(Date.now()+20*60*1000).toISOString()).run();
   await env.ORIGINALS.put(file.objectKey,bytes,{httpMetadata:{contentType:mime},customMetadata:{sha256:file.sha256}});
  }
  return staged;
 }catch(error){await removeStagedIntakeFiles(env,staged);throw error;}
}
export async function intakeFile(env:Bindings,actor:Actor,fileId:string){
 staff(actor);
 const file=await stmt(env.DB,'SELECT f.*,s.lead_id FROM s_intake_files f JOIN s_intake_submissions s ON s.id=f.submission_id WHERE f.id=?',text(fileId,'File',100)).first<Data>();
 insist(file,'File not found',404);
 const path=await visibleIntakeLeadPath(env.DB,actor,file.lead_id),object=await env.ORIGINALS.get(file.object_key);
 insist(object&&object.size===file.size&&object.size<=intakeFileLimit,'Original file is unavailable or its integrity check failed',409);
 const bytes=new Uint8Array(await object.arrayBuffer());
 insist(bytes.byteLength===file.size&&await digest(bytes)===file.sha256,'Original file integrity check failed',409);
 await atomic(env.DB,actor,[...intakePathGuards(env.DB,actor,path),audit(env.DB,actor,'intake.file_downloaded',file.id,JSON.stringify({leadId:file.lead_id,submissionId:file.submission_id,sha256:file.sha256,size:file.size,scanStatus:file.scan_status}))]);
 return new Response(bytes,{headers:{'content-type':file.mime,'content-length':String(bytes.byteLength),'content-disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'x-satchel-scan-status':'not malware-scanned'}});
}

// Only expired, uncommitted keys are collected. Current uploads temporarily block an archive.
export async function recoverIntakeUploads(env:Pick<Bindings,'DB'|'ORIGINALS'>,at=new Date().toISOString()) {
 const expired=(await env.DB.prepare('SELECT object_key FROM s_intake_uploads WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM s_intake_files f WHERE f.object_key=s_intake_uploads.object_key)').bind(at).all<{object_key:string}>()).results;
 for(const entry of expired){await env.ORIGINALS.delete(entry.object_key);await stmt(env.DB,'DELETE FROM s_intake_uploads WHERE object_key=?',entry.object_key).run();}
}
