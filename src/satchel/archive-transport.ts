import {requireWholeFirmWallAccess} from './wall-doors';
// Stream native archives, including R2 intake originals, without a total-byte ceiling.
import {recoverIntakeUploads} from './intake-files';
import {stmt} from './model';
import {createHash} from 'node:crypto';
import {createPortability,readArchive,type LaterJournal} from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {atomic,audit,human,insist,need,text,type Actor,type Data} from './model';
const serviceFor=(db:D1Database,originals:R2Bucket)=>createPortability({db,buckets:{originals},policy});
export async function backup(db:D1Database,actor:Actor,originals:R2Bucket) {
 human(actor);need(actor,'owner');await requireWholeFirmWallAccess(db,actor);
 await recoverIntakeUploads({DB:db,ORIGINALS:originals});
 insist(!(await stmt(db,'SELECT 1 FROM s_intake_uploads LIMIT 1').first()),'An intake upload is in progress. Retry the archive after it finishes.',409);
 const service=await serviceFor(db,originals),job=await service.exports.create(actor.id);
 try{
  let status=await service.exports.advance(job);while(status.phase!=='complete')status=await service.exports.advance(job);
  const reader=(await service.exports.download(job)).getReader(),hash=createHash('sha256');let bytes=0;
  const stream=new ReadableStream<Uint8Array>({async pull(controller){
   try{await requireWholeFirmWallAccess(db,actor);const next=await reader.read();if(next.done){await atomic(db,actor,[audit(db,actor,'firm.archive_exported','firm',JSON.stringify({exportId:job,sha256:hash.digest('hex'),bytes}))]);await service.exports.abort(job);controller.close();}
    else{bytes+=next.value.byteLength;hash.update(next.value);controller.enqueue(next.value);}}
   catch(error){await service.exports.abort(job);controller.error(error);}
  },async cancel(reason){await reader.cancel(reason);await service.exports.abort(job);}});
  return new Response(stream,{headers:{'content-type':'application/x-ndjson','content-disposition':'attachment; filename="satchel.rer"','cache-control':'no-store'}});
 }catch(error){await service.exports.abort(job);throw error;}
}
export async function restoreStream(db:D1Database,actor:Actor,source:ReadableStream<Uint8Array>,confirm:string,originals:R2Bucket,laterJournal?:LaterJournal) {
 human(actor);need(actor,'owner');insist(confirm==='RESTORE','Type RESTORE to confirm an empty-destination restore');
 const service=await serviceFor(db,originals),hash=createHash('sha256');let job:string|undefined,closing:{archiveHash:string;contentHash:string}|undefined;
 const measured=source.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){hash.update(chunk);controller.enqueue(chunk);}}));
 try{for await(const item of readArchive(measured)){
  if(item.kind==='manifest')job=await service.imports.create(item,actor.id);
  else if(item.kind==='part'){insist(job,'Missing archive manifest');await service.imports.uploadPart(job,item.index,item);}
  else closing=item;
 }
 insist(job&&closing,'Incomplete archive');
 const result=await service.imports.finalize(job,{archiveHash:closing.archiveHash,contentHash:closing.contentHash,laterJournal});
 if(result.phase==='complete')await atomic(db,actor,[stmt(db,"UPDATE s_proposals SET sponsor_id=(SELECT o.id FROM oa_operators o WHERE o.email=s_proposals.for_email AND o.status='active')"),audit(db,actor,'firm.archive_restored','firm',JSON.stringify({importId:job,sha256:hash.digest('hex'),archiveHash:closing.archiveHash,contentHash:closing.contentHash,decision:'RESTORE into empty product data'}))]);
 return result;
 }catch(error){if(job)await service.imports.abort(job);throw error;}
}

export async function restore(db:D1Database,actor:Actor,body:Data,originals:R2Bucket) {
 human(actor);need(actor,'owner');text(body.archive,'Archive',24_000_000);let laterJournal:LaterJournal|undefined;
 if(body.journal)for await(const part of readArchive(new Response(text(body.journal,'Later archive',24_000_000)).body!))if(part.kind==='manifest')laterJournal={sourceIdentity:part.sourceIdentity,epoch:part.epoch,journal:part.journal};
 return restoreStream(db,actor,new Response(body.archive as string).body!,body.confirm,originals,laterJournal);
}
