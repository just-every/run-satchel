import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterScope} from './matter-scope';
async function custodian(db:D1Database,actor:Actor,wallId:string){
 human(actor);const wall=await stmt(db,'SELECT * FROM s_ethical_walls WHERE id=? AND custodian_email=?',wallId,actor.email).first<Data>();insist(wall,'Custodian route not found',404);return wall;
}
export async function wallState(db:D1Database,actor:Actor){
 human(actor);const permitted=new Set((await rows(db,`SELECT id FROM s_matters WHERE ${matterScope('s_matters.id')}`,actor.role,actor.email)).map(m=>m.id));
 const own=await rows(db,'SELECT id,wall_id,requester_email,reason,status,expires_at,decision_note,revoked_at FROM s_wall_requests WHERE requester_email=? ORDER BY requested_at DESC',actor.email);
 const walls=await rows(db,'SELECT w.*,m.title FROM s_ethical_walls w JOIN s_matters m ON m.id=w.matter_id');
 return {walls:await Promise.all(walls.filter(w=>permitted.has(w.matter_id)||own.some(r=>r.wall_id===w.id)).map(async w=>({id:w.id,custodian_email:w.custodian_email,custodian:w.custodian_email===actor.email,canRead:permitted.has(w.matter_id),...(permitted.has(w.matter_id)?{matter_id:w.matter_id,title:w.title}:{}),...(w.custodian_email===actor.email?{revision:w.revision,members:await rows(db,'SELECT email FROM s_wall_members WHERE matter_id=? ORDER BY email',w.matter_id),requests:await rows(db,'SELECT * FROM s_wall_requests WHERE wall_id=? ORDER BY requested_at DESC',w.id)}:{})}))),requests:own};
}
export async function saveWall(db:D1Database,actor:Actor,matterId:string,b:Data){
 human(actor);const old=await stmt(db,'SELECT * FROM s_ethical_walls WHERE matter_id=?',matterId).first<Data>();
 if(old)insist(old.custodian_email===actor.email,'Only the designated custodian may change this wall',403);else{need(actor,'owner');await matter(db,actor,matterId);}
 const email=text(b.custodianEmail,'Custodian email',254).toLowerCase(),reason=text(b.reason,'Wall reason',2000),revision=id(),wallId=old?.id??id();
 const eligible=async(e:string)=>insist(await stmt(db,"SELECT 1 FROM oa_operators WHERE email=? AND status='active' AND role='owner' UNION SELECT 1 FROM s_members WHERE email=? AND active=1 AND role='lawyer'",e,e).first(),'Designate an active principal or lawyer as custodian');
 await eligible(email);insist(Array.isArray(b.members)&&b.members.length<=200,'Choose at most 200 wall members');
 const members=[...new Set([email,...b.members.map((v:unknown)=>text(v,'Wall member',254).toLowerCase())])];
 for(const e of members)insist(await stmt(db,"SELECT 1 FROM oa_operators WHERE email=? AND status='active' AND role='owner' UNION SELECT 1 FROM s_members WHERE email=? AND active=1",e,e).first(),'Every wall member must be active firm staff');
 insist((b.revision??null)===(old?.revision??null),'The wall changed. Refresh before saving.',409);const fence=id(),at=now();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT revision FROM s_ethical_walls WHERE matter_id=?) IS ? THEN 1 ELSE 0 END)',fence,matterId,old?.revision??null),stmt(db,'INSERT INTO s_ethical_walls VALUES(?,?,?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET custodian_email=excluded.custodian_email,revision=excluded.revision,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at',wallId,matterId,email,revision,reason,actor.email,at),stmt(db,'DELETE FROM s_wall_members WHERE matter_id=?',matterId),...members.flatMap(e=>[stmt(db,'INSERT INTO s_wall_members VALUES(?,?)',matterId,e),stmt(db,'INSERT OR IGNORE INTO s_matter_access VALUES(?,?)',matterId,e)]),stmt(db,"UPDATE s_wall_requests SET revoked_at=?,revoke_reason='Wall membership changed' WHERE wall_id=? AND status='approved' AND revoked_at IS NULL",at,wallId),audit(db,actor,old?'wall.updated':'wall.created',wallId,JSON.stringify({custodian:email,members,reason}),{matterId,revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:wallId,revision};
}
export async function requestWallAccess(db:D1Database,actor:Actor,wallId:string,b:Data){
 human(actor);need(actor,'owner','lawyer','assistant','trust_officer');const w=await stmt(db,'SELECT * FROM s_ethical_walls WHERE id=?',wallId).first<Data>();insist(w,'Custodian route not found',404);
 const requestId=id(),reason=text(b.reason,'Emergency access reason',2000);
 await atomic(db,actor,[stmt(db,"INSERT INTO s_wall_requests(id,wall_id,matter_id,requester_email,reason,status,requested_at) VALUES(?,?,?,?,?,'pending',?)",requestId,w.id,w.matter_id,actor.email,reason,now()),audit(db,actor,'wall.access_requested',requestId,reason,{matterId:w.matter_id,revision:w.revision})]);return {id:requestId,status:'pending',custodian_email:w.custodian_email};
}
export async function decideWallAccess(db:D1Database,actor:Actor,requestId:string,b:Data){
 human(actor);const r=await stmt(db,'SELECT * FROM s_wall_requests WHERE id=?',requestId).first<Data>();insist(r,'Request not found',404);const w=await custodian(db,actor,r.wall_id);
 insist(r.status==='pending','This request was already decided',409);insist(r.requester_email!==actor.email,'Another custodian must approve exceptional access',403);insist(typeof b.approve==='boolean','Choose approve or decline');
 const note=text(b.note,'Custodian decision reason',2000),at=now(),expires=b.approve?new Date(Date.now()+integer(b.minutes??30,'Access minutes',1,60)*60000).toISOString():null,fence=id();
 await atomic(db,actor,[stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_wall_requests r JOIN s_ethical_walls w ON w.id=r.wall_id WHERE r.id=? AND r.status='pending' AND w.custodian_email=? AND w.revision=?) THEN 1 ELSE 0 END)",fence,r.id,actor.email,w.revision),stmt(db,'UPDATE s_wall_requests SET status=?,decided_by=?,decision_note=?,decided_at=?,expires_at=? WHERE id=?',b.approve?'approved':'declined',actor.email,note,at,expires,r.id),audit(db,actor,b.approve?'wall.access_approved':'wall.access_declined',r.id,JSON.stringify({requester:r.requester_email,reason:r.reason,note,expiresAt:expires}),{matterId:r.matter_id,revision:w.revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);return {id:r.id,status:b.approve?'approved':'declined',expires_at:expires};
}
export async function revokeWallAccess(db:D1Database,actor:Actor,requestId:string,b:Data){
 const r=await stmt(db,'SELECT * FROM s_wall_requests WHERE id=?',requestId).first<Data>();insist(r,'Request not found',404);await custodian(db,actor,r.wall_id);const reason=text(b.reason,'Revocation reason',2000);
 await atomic(db,actor,[stmt(db,'UPDATE s_wall_requests SET revoked_at=?,revoke_reason=? WHERE id=?',now(),reason,r.id),audit(db,actor,'wall.access_revoked',r.id,reason,{matterId:r.matter_id})]);return {id:r.id,revoked:true};
}
