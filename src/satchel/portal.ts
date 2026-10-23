import {atomic,audit,human,id,insist,need,matter,now,rows,stmt,text,type Actor,type Data} from './model';
// FIRM-002 client role: a client member reaches only the matters the principal explicitly shares with them.
// A grant shows the matter number, title and status and nothing else; CLIENT-001 owns richer portal content.
export async function portalState(db:D1Database,actor:Actor){
 human(actor);need(actor,'client');
 return {grants:await rows(db,"SELECT g.id,g.matter_id matterId,g.granted_at grantedAt,m.matter_number matterNumber,m.title,m.lifecycle_status status FROM s_portal_grants g JOIN s_matters m ON m.id=g.matter_id WHERE g.email=? AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.matter_id=m.id AND w.dissolved_at IS NULL) ORDER BY g.granted_at,g.id",actor.email)};
}
export async function matterPortal(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner');await matter(db,actor,matterId);
 return {grants:await rows(db,'SELECT id,email,granted_by grantedBy,granted_at grantedAt,reason,revoked_by revokedBy,revoked_at revokedAt,revoke_reason revokeReason FROM s_portal_grants WHERE matter_id=? ORDER BY granted_at,id',matterId)};
}
export async function grantPortal(db:D1Database,actor:Actor,matterId:string,body:Data){
 human(actor);need(actor,'owner');const m=await matter(db,actor,matterId),email=text(body.email,'Client email',254).toLowerCase(),reason=text(body.reason,'Reason for sharing',1000);
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND role='client' AND active=1",email).first(),'Choose an active client member of the firm',404);
 const grantId=id();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_portal_grants(id,email,matter_id,granted_by,granted_at,reason) VALUES(?,?,?,?,?,?)',grantId,email,m.id,actor.email,now(),reason),audit(db,actor,'portal.granted',grantId,JSON.stringify({email,matterId:m.id}),{matterId:m.id})]);
 return matterPortal(db,actor,m.id);
}
export async function revokePortal(db:D1Database,actor:Actor,grantId:string,body:Data){
 human(actor);need(actor,'owner');const g=await stmt(db,'SELECT * FROM s_portal_grants WHERE id=? AND revoked_at IS NULL',grantId).first<Data>();insist(g,'Active portal grant not found',404);
 await matter(db,actor,g.matter_id);const reason=text(body.reason,'Reason for withdrawing',1000);
 await atomic(db,actor,[stmt(db,'UPDATE s_portal_grants SET revoked_by=?,revoked_at=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL',actor.email,now(),reason,g.id),audit(db,actor,'portal.revoked',g.id,JSON.stringify({email:g.email,matterId:g.matter_id}),{matterId:g.matter_id})]);
 return matterPortal(db,actor,g.matter_id);
}
