import { createPortability, readArchive } from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {atomic,audit,human,id,insist,need,now,stmt,text,type Actor,type Data} from './model';
import {documentGuard,visibleDocument} from './documents';
import {refuseHeld} from './retention';
export async function backup(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner');
 const service=await createPortability({db,policy}),job=await service.exports.create(actor.id);
 try {let status=await service.exports.advance(job);while(status.phase!=='complete')status=await service.exports.advance(job);const bytes=await new Response(await service.exports.download(job)).arrayBuffer();return new Response(bytes,{headers:{'content-type':'application/x-ndjson','content-disposition':'attachment; filename="satchel.rer"','cache-control':'no-store'}});}finally{await service.exports.abort(job);}
}
export async function restore(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');insist(body.confirm==='RESTORE','Type RESTORE to confirm an empty-destination restore');
 const source=text(body.archive,'Archive',24_000_000),service=await createPortability({db,policy});
 const records=[];for await(const record of readArchive(new Response(source).body!))records.push(record);
 let job:string|undefined;
 let laterJournal;
 if(body.journal){for await(const part of readArchive(new Response(text(body.journal,'Later archive',24_000_000)).body!)){if(part.kind==='manifest')laterJournal={sourceIdentity:part.sourceIdentity,epoch:part.epoch,journal:part.journal};}}
 try {for(const item of records) {
  if(item.kind==='manifest')job=await service.imports.create(item,actor.id);
  else if(item.kind==='part'){insist(job,'Missing archive manifest');await service.imports.uploadPart(job,item.index,item);}
  else {insist(job,'Missing archive manifest');return await service.imports.finalize(job,{archiveHash:item.archiveHash,contentHash:item.contentHash,laterJournal});}
 }throw new Error('Incomplete archive');}catch(error){if(job)await service.imports.abort(job);throw error;}
}
export async function eraseDocument(db:D1Database,actor:Actor,documentId:string,body:Data) {
 human(actor);need(actor,'owner');const d=await visibleDocument(db,actor,documentId);
 insist(body.confirm===d.title,'Type the document name to confirm erasing its original bytes');
 insist(!d.erased_at,'This document was already erased',409);
 const reason=text(body.reason,'Erasure reason',1000),service=await createPortability({db,policy}),at=now(),held=await refuseHeld(db,d);
 await atomic(db,actor,[...documentGuard(db,actor,d,true),...held,stmt(db,'UPDATE s_document_versions SET content_base64=NULL WHERE document_id=?',d.id),stmt(db,'UPDATE s_documents SET erased_at=?,revision=?,updated_by=?,updated_channel=?,updated_at=? WHERE id=?',at,id(),actor.email,actor.channel,at,d.id),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'document.erased',d.id,reason)]);
 return {id:d.id,erasedAt:at};
}
