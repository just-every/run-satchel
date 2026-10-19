import {contactRevisionGuard} from './contact-data';
import {contactAuthority,contactState} from './contacts';
import {atomic,audit,id,insist,now,stmt,text,type Actor,type Data} from './model';
export async function previewContactMerge(db:D1Database,actor:Actor,body:Data){
 contactAuthority(actor);const graph=await contactState(db,actor);
 const survivor=graph.contacts.find(c=>c.id===body.survivorId),duplicate=graph.contacts.find(c=>c.id===body.duplicateId);
 insist(survivor&&duplicate,'Choose two surviving contacts',404);insist(survivor.id!==duplicate.id,'Choose a different duplicate');
 insist(survivor.kind!=='unclassified'&&survivor.kind===duplicate.kind,'Classify both contacts as the same person/organization kind before merging');
 const preview={id:id(),revision:graph.revision,survivor,duplicate,reason:text(body.reason,'Merge reason',2000),createdAt:now()};
 await atomic(db,actor,[...contactRevisionGuard(db,graph.revision),stmt(db,'INSERT INTO s_contact_merge_previews VALUES(?,?,?,?,?,?,NULL)',preview.id,actor.email,actor.role,graph.revision,JSON.stringify(preview),preview.createdAt),audit(db,actor,'contact.merge_previewed',preview.id,JSON.stringify({survivorId:survivor.id,duplicateId:duplicate.id,reason:preview.reason,revision:graph.revision}))]);
 return preview;
}
export async function applyContactMerge(db:D1Database,actor:Actor,body:Data){
 contactAuthority(actor);const p=await stmt(db,'SELECT * FROM s_contact_merge_previews WHERE id=? AND for_email=? AND role=?',text(body.previewId,'Merge preview',150),actor.email,actor.role).first<Data>();
 insist(p,'Merge preview not found',404);insist(!p.applied_at,'This merge preview has already been applied',409);
 const snapshot=JSON.parse(p.snapshot),at=now(),fence=id(),writes=contactRevisionGuard(db,p.graph_revision);
 writes.push(stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_contact_merge_previews WHERE id=? AND applied_at IS NULL) THEN 1 ELSE 0 END)',fence,p.id));
 // Retain every physical party, import identity, link and historic search.
 for(const partyId of [...snapshot.survivor.identityIds,...snapshot.duplicate.identityIds])writes.push(stmt(db,'UPDATE s_parties SET revision=? WHERE id=?',id(),partyId));
 writes.push(stmt(db,'INSERT INTO s_contact_merges VALUES(?,?,?,?,?,?,?)',snapshot.duplicate.id,snapshot.survivor.id,snapshot.reason,p.graph_revision,p.snapshot,actor.email,at),stmt(db,'UPDATE s_contact_merge_previews SET applied_at=? WHERE id=?',at,p.id),audit(db,actor,'contact.merged',snapshot.duplicate.id,JSON.stringify({survivorId:snapshot.survivor.id,duplicateId:snapshot.duplicate.id,previewId:p.id,reason:snapshot.reason})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 await atomic(db,actor,writes);return contactState(db,actor);
}
