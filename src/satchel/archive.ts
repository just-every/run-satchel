import {eraseProductions} from './document-productions';
import {eraseDocumentReview} from './document-review';
import { createPortability } from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import {atomic,audit,human,id,insist,need,now,stmt,text,type Actor,type Data} from './model';
import {documentGuard,visibleDocument} from './documents';
import {refuseHeld} from './retention';
export {backup,restore,restoreStream} from './archive-transport';
export async function eraseDocument(db:D1Database,actor:Actor,documentId:string,body:Data,originals:R2Bucket) {
 human(actor);need(actor,'owner');const d=await visibleDocument(db,actor,documentId);
 insist(body.confirm===d.title,'Type the document name to confirm erasing its original bytes');
 insist(!d.erased_at,'This document was already erased',409);
 const reason=text(body.reason,'Erasure reason',1000),service=await createPortability({db,buckets:{originals},policy}),at=now(),held=await refuseHeld(db,d);
 await atomic(db,actor,[...documentGuard(db,actor,d,true),...held,stmt(db,'UPDATE s_document_versions SET content_base64=NULL WHERE document_id=?',d.id),...eraseDocumentReview(db,d.id),...eraseProductions(db,d.id),stmt(db,'UPDATE s_documents SET erased_at=?,revision=?,updated_by=?,updated_channel=?,updated_at=? WHERE id=?',at,id(),actor.email,actor.channel,at,d.id),...await service.redactionStatements(),...await service.invalidateTransfersStatements(),audit(db,actor,'document.erased',d.id,reason)]);
 return {id:d.id,erasedAt:at};
}
