import {currentRepresentative,representativePortalAccess} from './contact-representatives';
import {matterGuard} from './documents';
import {guard} from './trust-guards';
import {atomic,audit,human,id,insist,need,matter,now,rows,stmt,text,type Actor,type Data} from './model';
// FIRM-002 client role: a client member reaches only the matters the principal explicitly shares with them.
// CLIENT-001: each grant has a kind. Clients and co-clients read what is shared; a payer reads only issued invoices; a
// delegate acts for one named client and has access only while that client's grant and their own are both active.
export const portalKinds=['client','co_client','payer','delegate'] as const;
export const readerKinds=['client','co_client','delegate'];
export function portalAccess(matterSql:string,kinds:readonly string[],grantSql?:string){
 return `EXISTS(SELECT 1 FROM s_portal_grants g JOIN s_matters m ON m.id=g.matter_id JOIN s_members reader ON reader.email=g.email AND reader.active=1 AND reader.role='client' WHERE g.email=? ${grantSql?'AND g.id='+grantSql:''} AND ${representativePortalAccess('g')} AND g.matter_id=${matterSql} AND g.revoked_at IS NULL AND g.kind IN (${kinds.map(k=>`'${k}'`).join(',')}) AND (g.kind<>'delegate' OR EXISTS(SELECT 1 FROM s_portal_grants p JOIN s_members represented ON represented.email=p.email AND represented.active=1 AND represented.role='client' WHERE p.email=g.delegate_of AND p.matter_id=g.matter_id AND p.revoked_at IS NULL AND p.kind IN('client','co_client'))) AND NOT EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.matter_id=m.id AND w.dissolved_at IS NULL))`;
}
export async function portalState(db:D1Database,actor:Actor){
 human(actor);need(actor,'client');
 return {grants:await rows(db,`SELECT candidate.id,candidate.matter_id matterId,candidate.kind,candidate.granted_at grantedAt,CASE WHEN candidate.kind<>'payer' THEN m.matter_number END matterNumber,CASE WHEN candidate.kind<>'payer' THEN m.title END title,CASE WHEN candidate.kind<>'payer' THEN m.lifecycle_status END status FROM s_portal_grants candidate JOIN s_matters m ON m.id=candidate.matter_id WHERE candidate.email=? AND candidate.revoked_at IS NULL AND ${representativePortalAccess('candidate')} AND ${portalAccess('candidate.matter_id',portalKinds,'candidate.id')} ORDER BY candidate.granted_at,candidate.id`,actor.email,actor.email)};
}
export async function matterPortal(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner');await matter(db,actor,matterId);
 return {grants:await rows(db,'SELECT id,email,kind,delegate_of delegateOf,granted_by grantedBy,granted_at grantedAt,reason,revoked_by revokedBy,revoked_at revokedAt,revoke_reason revokeReason FROM s_portal_grants WHERE matter_id=? ORDER BY granted_at,id',matterId)};
}
export async function grantPortal(db:D1Database,actor:Actor,matterId:string,body:Data){
 human(actor);need(actor,'owner');const m=await matter(db,actor,matterId),email=text(body.email,'Client email',254).toLowerCase(),reason=text(body.reason,'Reason for sharing',1000);
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND role='client' AND active=1",email).first(),'Choose an active client member of the firm',404);
 const kind=body.kind===undefined?'client':String(body.kind);insist((portalKinds as readonly string[]).includes(kind),'Choose client, co-client, payer or delegate');
 let delegateOf:string|null=null;
 if(kind==='delegate'){delegateOf=text(body.delegateOf,'Client the delegate acts for',254).toLowerCase();insist(delegateOf!==email,'A delegate acts for someone else');insist(await stmt(db,"SELECT 1 FROM s_portal_grants WHERE email=? AND matter_id=? AND revoked_at IS NULL AND kind IN('client','co_client')",delegateOf,m.id).first(),'A delegate acts for a client who holds an active grant on this matter',404);}
 else insist(body.delegateOf===undefined||body.delegateOf===null||body.delegateOf==='','Only a delegate acts for another client');
 const known=await stmt(db,'SELECT 1 FROM s_contact_representatives WHERE matter_id=? AND (recipient=? OR represented_email=?)',m.id,email,delegateOf??'').first();
 let evidence:Data|null=null,review:Data|null=null,original:Data|null=null;
 if(known||body.representativeEvidenceId){
  insist(kind==='delegate','A recorded representative needs an explicit delegate grant',409);
  evidence=await stmt(db,`SELECT * FROM s_contact_representatives r WHERE r.id=? AND r.matter_id=? AND r.recipient=? AND r.represented_email=? AND ${currentRepresentative('r')}`,text(body.representativeEvidenceId,'Reviewed representative evidence revision',150),m.id,email,delegateOf).first<Data>();
  insist(evidence,'Choose current authority and recipient evidence for this exact matter and recipient',409);
  review=await stmt(db,'SELECT r.* FROM s_representative_reviews r JOIN s_representative_local_reviews l ON l.review_id=r.id WHERE r.evidence_id=? ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1',evidence.id).first<Data>();insist(review,'The principal must review this exact evidence revision on this installation',409);
  original=await stmt(db,"SELECT * FROM s_portal_grants WHERE matter_id=? AND email=? AND kind IN('client','co_client') AND revoked_at IS NULL ORDER BY granted_at DESC,id DESC LIMIT 1",m.id,delegateOf).first<Data>();insist(original,'The represented client needs a current explicit grant',409);
 }
 const grantId=id();
 await atomic(db,actor,[...matterGuard(db,actor,m.id),guard(db,"EXISTS(SELECT 1 FROM s_members WHERE email=? AND role='client' AND active=1)",email),...(delegateOf?[guard(db,portalAccess('?', ['client','co_client']),delegateOf,m.id)]:[]),stmt(db,'INSERT INTO s_portal_grants(id,email,matter_id,granted_by,granted_at,reason,kind,delegate_of) VALUES(?,?,?,?,?,?,?,?)',grantId,email,m.id,actor.email,now(),reason,kind,delegateOf),...(evidence&&review&&original?[guard(db,`EXISTS(SELECT 1 FROM s_contact_representatives r WHERE r.id=? AND ${currentRepresentative('r')})`,evidence.id),guard(db,'EXISTS(SELECT 1 FROM s_representative_local_reviews WHERE review_id=?)',review.id),guard(db,'EXISTS(SELECT 1 FROM s_portal_grants WHERE id=? AND revoked_at IS NULL)',original.id),stmt(db,'INSERT INTO s_representative_grants VALUES(?,?,?,?)',grantId,evidence.id,review.id,original.id)]:[]),audit(db,actor,'portal.granted',grantId,JSON.stringify({email,matterId:m.id,kind,delegateOf}),{matterId:m.id})]);
 return matterPortal(db,actor,m.id);
}
export async function revokePortal(db:D1Database,actor:Actor,grantId:string,body:Data){
 human(actor);need(actor,'owner');const g=await stmt(db,'SELECT * FROM s_portal_grants WHERE id=? AND revoked_at IS NULL',grantId).first<Data>();insist(g,'Active portal grant not found',404);
 await matter(db,actor,g.matter_id);const reason=text(body.reason,'Reason for withdrawing',1000);
 await atomic(db,actor,[...matterGuard(db,actor,g.matter_id),stmt(db,'UPDATE s_portal_grants SET revoked_by=?,revoked_at=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL',actor.email,now(),reason,g.id),audit(db,actor,'portal.revoked',g.id,JSON.stringify({email:g.email,matterId:g.matter_id}),{matterId:g.matter_id})]);
 return matterPortal(db,actor,g.matter_id);
}
