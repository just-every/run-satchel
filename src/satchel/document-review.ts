// DOC-002: review notes never rewrite originals; conflicts never replace the head.
import {atomic,audit,digest,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {decode,documentGuard,saveDocument,visibleDocument} from './documents';
export async function documentReview(db:D1Database,actor:Actor,documentId:string){
 const d=await visibleDocument(db,actor,documentId);insist(!d.erased_at,'Document not found',404);
 return {annotations:await rows(db,'SELECT * FROM s_document_annotations WHERE document_id=? ORDER BY created_at,id',d.id),conflicts:await rows(db,'SELECT id,document_id,base_revision,name,mime,declared_mime,size,sha256,created_by,created_at,resolved_version,resolved_by,resolved_at FROM s_document_conflicts WHERE document_id=? ORDER BY created_at,id',d.id)};
}
export async function annotateDocument(db:D1Database,actor:Actor,documentId:string,body:Data){
 const d=await visibleDocument(db,actor,documentId);insist(!d.erased_at,'Document not found',404);
 const version=integer(body.version,'Original version',1),page=integer(body.page,'Page or section',1,100000),note=text(body.note,'Annotation',4000),annotationId=id(),at=now();
 insist(await stmt(db,'SELECT 1 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.id,version).first(),'Original version not found',404);
 await atomic(db,actor,[...documentGuard(db,actor,d),stmt(db,'INSERT INTO s_document_annotations VALUES(?,?,?,?,?,?,?)',annotationId,d.id,version,page,note,actor.email,at),audit(db,actor,'document.annotated',annotationId,JSON.stringify({documentId:d.id,version,page}),{matterId:d.matter_id,revision:String(version)})]);
 return documentReview(db,actor,d.id);
}
async function conflict(db:D1Database,actor:Actor,documentId:string,conflictId:string){
 const d=await visibleDocument(db,actor,documentId);insist(!d.erased_at,'Document not found',404);
 const c=await stmt(db,'SELECT * FROM s_document_conflicts WHERE id=? AND document_id=? AND content_base64 IS NOT NULL',conflictId,d.id).first<Data>();insist(c,'Conflict not found',404);return {d,c};
}
export async function conflictFile(db:D1Database,actor:Actor,documentId:string,conflictId:string){
 const {d,c}=await conflict(db,actor,documentId,conflictId),bytes=decode(c.content_base64);
 insist(bytes.length===c.size&&await digest(bytes)===c.sha256,'Conflict original failed its integrity check',503);
 await atomic(db,actor,[...documentGuard(db,actor,d),audit(db,actor,'document.conflict_downloaded',c.id,JSON.stringify({documentId:d.id,sha256:c.sha256}),{matterId:d.matter_id})]);
 return new Response(bytes,{headers:{'content-type':c.mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(c.name).replace(/['()*]/g,x=>'%'+x.charCodeAt(0).toString(16))}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
}
export async function resolveConflict(db:D1Database,actor:Actor,documentId:string,conflictId:string,body:Data){
 const {d,c}=await conflict(db,actor,documentId,conflictId);
 insist(actor.role==='owner'||d.created_by===actor.email,'Only the document author or owner can append versions',403);
 insist(!c.resolved_at,'This conflict was already resolved',409);insist(body.revision===d.revision,'The document changed. Compare again before resolving.',409);
 const same=await stmt(db,'SELECT version FROM s_document_versions WHERE document_id=? AND sha256=?',d.id,c.sha256).first<Data>();
 if(same){
  const fence=id();await atomic(db,actor,[...documentGuard(db,actor,d,true),stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END FROM s_document_conflicts WHERE id=?',fence,c.id),stmt(db,'DELETE FROM s_guard WHERE id=?',fence),stmt(db,'UPDATE s_document_conflicts SET resolved_version=?,resolved_by=?,resolved_at=? WHERE id=?',same.version,actor.email,now(),c.id),audit(db,actor,'document.conflict_resolved',c.id,JSON.stringify({documentId:d.id,version:same.version}),{matterId:d.matter_id})]);
  return {saveOutcome:'already-retained',version:same.version};
 }
 return saveDocument(db,actor,d.matter_id,{documentId:d.id,revision:d.revision,name:c.name,mime:c.declared_mime,visibility:d.visibility,contentBase64:c.content_base64},c.id);
}
// All retained review content follows the document's erasure and restore fence.
export function eraseDocumentReview(db:D1Database,documentId:string){return [stmt(db,'UPDATE s_document_annotations SET note=NULL WHERE document_id=?',documentId),stmt(db,'UPDATE s_document_conflicts SET content_base64=NULL WHERE document_id=?',documentId)];}
