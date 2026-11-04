import {contactData,contactRevisionGuard} from './contact-data';
import {contactGraph} from './contact-graph';
import {contactState} from './contact-read';
import {accessGuard,guard} from './trust-guards';
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';

// A merge cannot turn recorded evidence about one identity into authority for another.
export const currentRepresentative=(alias:string)=>`${alias}.withdrawn=0 AND ${alias}.sequence=(SELECT MAX(latest.sequence) FROM s_contact_representatives latest WHERE latest.party_id=${alias}.party_id AND latest.matter_id=${alias}.matter_id) AND NOT EXISTS(SELECT 1 FROM s_representative_invalidations invalid WHERE invalid.evidence_id=${alias}.id)`;
export async function representativeState(db:D1Database,actor:Actor,partyId:string){
 human(actor);need(actor,'owner','lawyer');const state=await contactState(db,actor),contact=state.contacts.find(c=>c.identityIds.includes(partyId));insist(contact,'Contact not found',404);
 const evidence=await rows(db,`SELECT r.*,(${currentRepresentative('r')}) current FROM s_contact_representatives r WHERE r.party_id IN(${contact.identityIds.map(()=>'?').join(',')}) ORDER BY r.sequence`,...contact.identityIds);
 const permitted=new Set(state.matters.map(m=>m.id)),visible=evidence.filter(r=>permitted.has(r.matter_id));
 for(const r of visible)r.reviews=await rows(db,'SELECT v.*,EXISTS(SELECT 1 FROM s_representative_local_reviews l WHERE l.review_id=v.id) local FROM s_representative_reviews v WHERE v.evidence_id=? ORDER BY v.reviewed_at,v.id',r.id);
 return {canReview:actor.role==='owner',evidence:visible};
}
function address(value:unknown,label:string){const email=text(value,label,254).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Use a valid recipient address');return email;}
export function stopRepresentative(db:D1Database,matterId:string,recipient:string,actor:Actor,at:string){
 const reason='Representative evidence replaced or withdrawn; fresh review and explicit grants required';
 return [stmt(db,'UPDATE s_portal_grants SET revoked_by=?,revoked_at=?,revoke_reason=? WHERE matter_id=? AND email=? AND revoked_at IS NULL',actor.email,at,reason,matterId,recipient),
 stmt(db,"UPDATE s_client_reminder_jobs SET status='stopped',detail=? WHERE matter_id=? AND recipient=? AND status IN('queued','prepared')",reason,matterId,recipient),
 stmt(db,"UPDATE s_correspondence_attempts SET status='failed',detail=? WHERE status='ready' AND correspondence_id IN(SELECT id FROM s_correspondence WHERE matter_id=? AND recipient=?)",reason,matterId,recipient),
 stmt(db,"UPDATE s_request_reminder_sends SET status='cancelled',detail=? WHERE status='queued' AND reminder_id IN(SELECT r.id FROM s_request_reminders r JOIN s_document_requests q ON q.id=r.request_id WHERE q.matter_id=? AND r.email=?)",reason,matterId,recipient),
 stmt(db,"UPDATE s_request_reminders SET status='stopped',reason=? WHERE status='active' AND email=? AND request_id IN(SELECT id FROM s_document_requests WHERE matter_id=?)",reason,recipient,matterId)];
}
export async function recordRepresentative(db:D1Database,actor:Actor,partyId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');const data=await contactData(db),contact=contactGraph(data).contacts.find(c=>c.identityIds.includes(partyId));
 insist(contact&&(await contactState(db,actor)).contacts.some(c=>c.id===contact.id),'Contact not found',404);
 const matterId=text(b.matterId,'Representative matter',150);await matter(db,actor,matterId);
 insist(contact.matterRoles.some(r=>r.matter_id===matterId&&r.role==='client'),'Record a client matter role for the represented identity first',409);
 const previous=await stmt(db,'SELECT * FROM s_contact_representatives WHERE party_id=? AND matter_id=? ORDER BY sequence DESC LIMIT 1',partyId,matterId).first<Data>();
 insist((b.previousId??null)===(previous?.id??null),'Representative evidence changed; review the latest revision',409);
 const recipient=address(b.recipient,'Verified representative recipient'),represented=address(b.representedEmail,'Represented client recipient');insist(recipient!==represented,'A representative acts for a different recipient');
 insist(contact.emails.some(e=>e.toLowerCase()===represented),'Choose an address on the represented contact',409);
 insist(typeof b.withdrawn==='boolean','Explicitly record active or withdrawn authority');
 const authority=text(b.authorityEvidence,'Practitioner-recorded authority evidence',4000),verification=text(b.verificationEvidence,'Recipient verification evidence',4000),evidenceId=id(),at=now();
 await atomic(db,actor,[accessGuard(db,actor,matterId),...contactRevisionGuard(db,b.revision),guard(db,'COALESCE((SELECT id FROM s_contact_representatives WHERE party_id=? AND matter_id=? ORDER BY sequence DESC LIMIT 1),\'\')=?',partyId,matterId,previous?.id??''),
 stmt(db,'INSERT INTO s_contact_representatives(id,party_id,matter_id,previous_id,recipient,represented_email,authority_evidence,verification_evidence,withdrawn,graph_revision,identity_ids,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',evidenceId,partyId,matterId,previous?.id??null,recipient,represented,authority,verification,b.withdrawn?1:0,data.revision,JSON.stringify(contact.identityIds),actor.email,at),
 ...stopRepresentative(db,matterId,recipient,actor,at),...(previous&&previous.recipient!==recipient?stopRepresentative(db,matterId,previous.recipient,actor,at):[]),
 audit(db,actor,'contact.representative_recorded',evidenceId,JSON.stringify({partyId,matterId,recipient,representedEmail:represented,previousId:previous?.id??null,withdrawn:b.withdrawn,authorityEvidence:authority,verificationEvidence:verification}),{matterId})]);
 return {id:evidenceId,...await representativeState(db,actor,partyId)};
}
export async function reviewRepresentative(db:D1Database,actor:Actor,partyId:string,b:Data){
 human(actor);need(actor,'owner');await representativeState(db,actor,partyId);
 const evidenceId=text(b.evidenceId,'Exact representative evidence revision',150),r=await stmt(db,`SELECT * FROM s_contact_representatives r WHERE r.id=? AND r.party_id=? AND ${currentRepresentative('r')}`,evidenceId,partyId).first<Data>();insist(r,'Review current active representative evidence',409);await matter(db,actor,r.matter_id);
 insist(b.confirmed===true,'Confirm review of the exact authority and recipient evidence');const reviewId=id(),at=now(),reason=text(b.reason,'Principal review reason',2000);
 await atomic(db,actor,[accessGuard(db,actor,r.matter_id),guard(db,`EXISTS(SELECT 1 FROM s_contact_representatives r WHERE r.id=? AND ${currentRepresentative('r')})`,r.id),stmt(db,'INSERT INTO s_representative_reviews VALUES(?,?,?,?,?)',reviewId,r.id,actor.email,at,reason),stmt(db,'INSERT INTO s_representative_local_reviews VALUES(?)',reviewId),audit(db,actor,'contact.representative_reviewed',r.id,JSON.stringify({reviewId,reason}),{matterId:r.matter_id})]);
 return representativeState(db,actor,partyId);
}
// Evaluated inside every existing portal reader predicate, including direct file and write doors.
export function representativePortalAccess(g:string){return `(${g}.email NOT IN(SELECT known.recipient FROM s_contact_representatives known WHERE known.matter_id=${g}.matter_id) OR ${g}.id IN(SELECT binding.grant_id FROM s_representative_grants binding JOIN s_representative_local_reviews local ON local.review_id=binding.review_id JOIN s_portal_grants original ON original.id=binding.represented_grant_id WHERE original.revoked_at IS NULL))`;}
