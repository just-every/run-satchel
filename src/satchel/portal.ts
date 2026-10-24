import {atomic,audit,human,id,insist,need,matter,now,rows,stmt,text,type Actor,type Data} from './model';
// FIRM-002 client role: a client member reaches only the matters the principal explicitly shares with them.
// CLIENT-001: each grant has a kind. Clients and co-clients read what is shared; a payer reads only issued invoices; a
// delegate acts for one named client and has access only while that client's grant and their own are both active.
export const portalKinds=['client','co_client','payer','delegate'] as const;
export const readerKinds=['client','co_client','delegate'];
export function portalAccess(matterSql:string,kinds:readonly string[]){
 return `EXISTS(SELECT 1 FROM s_portal_grants g JOIN s_matters m ON m.id=g.matter_id JOIN s_members reader ON reader.email=g.email AND reader.active=1 AND reader.role='client' WHERE g.email=? AND g.matter_id=${matterSql} AND g.revoked_at IS NULL AND g.kind IN (${kinds.map(k=>`'${k}'`).join(',')}) AND (g.kind<>'delegate' OR EXISTS(SELECT 1 FROM s_portal_grants p JOIN s_members represented ON represented.email=p.email AND represented.active=1 AND represented.role='client' WHERE p.email=g.delegate_of AND p.matter_id=g.matter_id AND p.revoked_at IS NULL AND p.kind IN('client','co_client'))) AND NOT EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.matter_id=m.id AND w.dissolved_at IS NULL))`;
}
export async function portalState(db:D1Database,actor:Actor){
 human(actor);need(actor,'client');
 return {grants:await rows(db,"SELECT g.id,g.matter_id matterId,g.kind,g.granted_at grantedAt,m.matter_number matterNumber,m.title,m.lifecycle_status status FROM s_portal_grants g JOIN s_matters m ON m.id=g.matter_id JOIN s_members reader ON reader.email=g.email AND reader.active=1 AND reader.role='client' WHERE g.email=? AND g.revoked_at IS NULL AND (g.kind<>'delegate' OR EXISTS(SELECT 1 FROM s_portal_grants p JOIN s_members represented ON represented.email=p.email AND represented.active=1 AND represented.role='client' WHERE p.email=g.delegate_of AND p.matter_id=g.matter_id AND p.revoked_at IS NULL AND p.kind IN('client','co_client'))) AND NOT EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.matter_id=m.id AND w.dissolved_at IS NULL) ORDER BY g.granted_at,g.id",actor.email)};
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
 const grantId=id();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_portal_grants(id,email,matter_id,granted_by,granted_at,reason,kind,delegate_of) VALUES(?,?,?,?,?,?,?,?)',grantId,email,m.id,actor.email,now(),reason,kind,delegateOf),audit(db,actor,'portal.granted',grantId,JSON.stringify({email,matterId:m.id,kind,delegateOf}),{matterId:m.id})]);
 return matterPortal(db,actor,m.id);
}
export async function revokePortal(db:D1Database,actor:Actor,grantId:string,body:Data){
 human(actor);need(actor,'owner');const g=await stmt(db,'SELECT * FROM s_portal_grants WHERE id=? AND revoked_at IS NULL',grantId).first<Data>();insist(g,'Active portal grant not found',404);
 await matter(db,actor,g.matter_id);const reason=text(body.reason,'Reason for withdrawing',1000);
 await atomic(db,actor,[stmt(db,'UPDATE s_portal_grants SET revoked_by=?,revoked_at=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL',actor.email,now(),reason,g.id),audit(db,actor,'portal.revoked',g.id,JSON.stringify({email:g.email,matterId:g.matter_id}),{matterId:g.matter_id})]);
 return matterPortal(db,actor,g.matter_id);
}
