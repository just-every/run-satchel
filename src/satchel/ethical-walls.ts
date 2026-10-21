import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterScope} from './matter-scope';
import {routeAuthority} from './conflict-routes';
async function custodian(db:D1Database,actor:Actor,wallId:string){
 human(actor);const wall=await routeAuthority(db,wallId,0);insist(wall.custodian_email===actor.email,'Custodian route not found',404);return wall;
}
export async function wallState(db:D1Database,actor:Actor){
 human(actor);const permitted=new Set((await rows(db,`SELECT id FROM s_matters WHERE ${matterScope('s_matters.id')}`,actor.role,actor.email)).map(m=>m.id));
 const own=await rows(db,'SELECT id,wall_id,requester_email,reason,status,expires_at,decision_note,revoked_at FROM s_wall_requests WHERE requester_email=? ORDER BY requested_at DESC',actor.email);
 const walls=await rows(db,'SELECT w.*,m.title FROM s_ethical_walls w JOIN s_matters m ON m.id=w.matter_id WHERE w.dissolved_at IS NULL');
 return {walls:await Promise.all(walls.filter(w=>permitted.has(w.matter_id)||own.some(r=>r.wall_id===w.id)).map(async w=>{
  const active=(await routeAuthority(db,w.id,0)).custodian_email,isCustodian=active===actor.email;
  const member=!!await stmt(db,'SELECT 1 FROM s_wall_members WHERE matter_id=? AND email=?',w.matter_id,actor.email).first();
  return {id:w.id,custodian_email:active,custodian:isCustodian,canRead:permitted.has(w.matter_id),canTakeCustody:!active&&member&&['owner','lawyer'].includes(actor.role),...(permitted.has(w.matter_id)?{matter_id:w.matter_id,title:w.title}:{}),...(isCustodian||!active&&member?{revision:w.revision,members:await rows(db,'SELECT email FROM s_wall_members WHERE matter_id=? ORDER BY email',w.matter_id)}:{}),...(isCustodian?{requests:await rows(db,'SELECT * FROM s_wall_requests WHERE wall_id=? ORDER BY requested_at DESC',w.id)}:{})};
 })),requests:own};
}
export async function saveWall(db:D1Database,actor:Actor,matterId:string,b:Data){
 human(actor);const old=await stmt(db,'SELECT * FROM s_ethical_walls WHERE matter_id=?',matterId).first<Data>();
 if(old&&!old.dissolved_at)insist((await routeAuthority(db,old.id,0)).custodian_email===actor.email,'Only the designated custodian may change this wall',403);else{need(actor,'owner');await matter(db,actor,matterId);}
 const email=text(b.custodianEmail,'Custodian email',254).toLowerCase(),reason=text(b.reason,'Wall reason',2000),revision=id(),wallId=old?.id??id();
 const eligible=async(e:string)=>insist(await stmt(db,"SELECT 1 FROM oa_operators WHERE email=? AND status='active' AND role='owner' UNION SELECT 1 FROM s_members WHERE email=? AND active=1 AND role='lawyer'",e,e).first(),'Designate an active principal or lawyer as custodian');
 await eligible(email);if(old&&!old.dissolved_at&&email!==old.custodian_email)insist(await stmt(db,'SELECT 1 FROM s_wall_members WHERE matter_id=? AND email=?',matterId,email).first(),'Hand custodianship only to active counsel already inside the wall',403);insist(Array.isArray(b.members)&&b.members.length<=200,'Choose at most 200 wall members');
 const members=[...new Set([email,...b.members.map((v:unknown)=>text(v,'Wall member',254).toLowerCase())])];
 for(const e of members)insist(await stmt(db,"SELECT 1 FROM oa_operators WHERE email=? AND status='active' AND role='owner' UNION SELECT 1 FROM s_members WHERE email=? AND active=1",e,e).first(),'Every wall member must be active firm staff');
 insist((b.revision??null)===(old&&!old.dissolved_at?old.revision:null),'The wall changed. Refresh before saving.',409);const fence=id(),at=now();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT revision FROM s_ethical_walls WHERE matter_id=?) IS ? THEN 1 ELSE 0 END)',fence,matterId,old?.revision??null),stmt(db,'INSERT INTO s_ethical_walls(id,matter_id,custodian_email,revision,reason,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET custodian_email=excluded.custodian_email,revision=excluded.revision,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at,dissolved_at=NULL',wallId,matterId,email,revision,reason,actor.email,at),stmt(db,'DELETE FROM s_wall_members WHERE matter_id=?',matterId),...members.flatMap(e=>[stmt(db,'INSERT INTO s_wall_members VALUES(?,?)',matterId,e),stmt(db,'INSERT OR IGNORE INTO s_matter_access VALUES(?,?)',matterId,e)]),stmt(db,"UPDATE s_wall_requests SET revoked_at=?,revoke_reason='Wall membership changed' WHERE wall_id=? AND status='approved' AND revoked_at IS NULL",at,wallId),audit(db,actor,old?'wall.updated':'wall.created',wallId,JSON.stringify({custodian:email,members,reason}),{matterId,revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:wallId,revision};
}
export async function requestWallAccess(db:D1Database,actor:Actor,wallId:string,b:Data){
 human(actor);need(actor,'owner','lawyer','assistant','trust_officer');const w=await stmt(db,'SELECT * FROM s_ethical_walls WHERE id=?',wallId).first<Data>();insist(w&&!w.dissolved_at,'Custodian route not found',404);
 insist((await routeAuthority(db,wallId,0)).custodian_email,"custodian unassigned: ask the wall's counsel",409);
 const requestId=id(),reason=text(b.reason,'Emergency access reason',2000);
 await atomic(db,actor,[stmt(db,"INSERT INTO s_wall_requests(id,wall_id,matter_id,requester_email,reason,status,requested_at) VALUES(?,?,?,?,?,'pending',?)",requestId,w.id,w.matter_id,actor.email,reason,now()),audit(db,actor,'wall.access_requested',requestId,reason,{matterId:w.matter_id,revision:w.revision})]);return {id:requestId,status:'pending',custodian_email:w.custodian_email};
}
export async function decideWallAccess(db:D1Database,actor:Actor,requestId:string,b:Data){
 human(actor);const r=await stmt(db,'SELECT * FROM s_wall_requests WHERE id=?',requestId).first<Data>();insist(r,'Request not found',404);const w=await custodian(db,actor,r.wall_id);
 insist(r.status==='pending','This request was already decided',409);insist(r.requester_email!==actor.email,'Another custodian must approve exceptional access',403);insist(typeof b.approve==='boolean','Choose approve or decline');
 const note=text(b.note,'Custodian decision reason',2000),at=now(),expires=b.approve?new Date(Date.now()+integer(b.minutes??30,'Access minutes',1,60)*60000).toISOString():null,fence=id();
 await atomic(db,actor,[stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_wall_requests r JOIN s_ethical_walls w ON w.id=r.wall_id WHERE r.id=? AND r.status='pending' AND w.custodian_email=? AND w.revision=? AND w.dissolved_at IS NULL) THEN 1 ELSE 0 END)",fence,r.id,actor.email,w.revision),stmt(db,'UPDATE s_wall_requests SET status=?,decided_by=?,decision_note=?,decided_at=?,expires_at=? WHERE id=?',b.approve?'approved':'declined',actor.email,note,at,expires,r.id),audit(db,actor,b.approve?'wall.access_approved':'wall.access_declined',r.id,JSON.stringify({requester:r.requester_email,reason:r.reason,note,expiresAt:expires}),{matterId:r.matter_id,revision:w.revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);return {id:r.id,status:b.approve?'approved':'declined',expires_at:expires};
}
export async function revokeWallAccess(db:D1Database,actor:Actor,requestId:string,b:Data){
 const r=await stmt(db,'SELECT * FROM s_wall_requests WHERE id=?',requestId).first<Data>();insist(r,'Request not found',404);await custodian(db,actor,r.wall_id);const reason=text(b.reason,'Revocation reason',2000);
 await atomic(db,actor,[stmt(db,'UPDATE s_wall_requests SET revoked_at=?,revoke_reason=? WHERE id=?',now(),reason,r.id),audit(db,actor,'wall.access_revoked',r.id,reason,{matterId:r.matter_id})]);return {id:r.id,revoked:true};
}

export async function takeWallCustody(db:D1Database,actor:Actor,wallId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');const w=await routeAuthority(db,wallId,0);
 insist(!w.dissolved_at&&!w.custodian_email,'The wall already has an active custodian',409);
 insist(await stmt(db,'SELECT 1 FROM s_wall_members WHERE matter_id=? AND email=?',w.matter_id,actor.email).first(),'Only counsel inside the wall may take custodianship',403);
 return saveWallAfterUnassigned(db,actor,w,b);
}
async function saveWallAfterUnassigned(db:D1Database,actor:Actor,w:Data,b:Data){
 const reason=text(b.reason,'Custody reason',2000),revision=id(),at=now(),fence=id();
 insist(b.revision===w.revision,'The wall changed. Refresh before saving.',409);
 await atomic(db,actor,[stmt(db,`INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.id=? AND w.revision=? AND w.dissolved_at IS NULL AND NOT (EXISTS(SELECT 1 FROM s_wall_members m WHERE m.matter_id=w.matter_id AND m.email=w.custodian_email) AND (EXISTS(SELECT 1 FROM oa_operators o WHERE o.email=w.custodian_email AND o.role='owner' AND o.status='active') OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=w.custodian_email AND m.role='lawyer' AND m.active=1)))) THEN 1 ELSE 0 END)`,fence,w.id,w.revision),
  stmt(db,'UPDATE s_ethical_walls SET custodian_email=?,revision=?,reason=?,updated_by=?,updated_at=? WHERE id=?',actor.email,revision,reason,actor.email,at,w.id),
  stmt(db,"UPDATE s_wall_requests SET revoked_at=?,revoke_reason='Custodian changed' WHERE wall_id=? AND status='approved' AND revoked_at IS NULL",at,w.id),
  audit(db,actor,'wall.custody_taken',w.id,reason,{matterId:w.matter_id,revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:w.id,revision};
}
export async function dissolveWall(db:D1Database,actor:Actor,wallId:string,b:Data){
 const w=await custodian(db,actor,wallId),reason=text(b.reason,'Dissolution reason',2000),at=now(),revision=id(),fence=id();
 insist(b.revision===w.revision,'The wall changed. Refresh before saving.',409);
 await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT revision FROM s_ethical_walls WHERE id=?)=? THEN 1 ELSE 0 END)',fence,w.id,w.revision),
  stmt(db,'UPDATE s_ethical_walls SET dissolved_at=?,revision=?,reason=?,updated_by=?,updated_at=? WHERE id=?',at,revision,reason,actor.email,at,w.id),
  stmt(db,"UPDATE s_wall_requests SET revoked_at=?,revoke_reason='Wall dissolved' WHERE wall_id=? AND status='approved' AND revoked_at IS NULL",at,w.id),
  audit(db,actor,'wall.dissolved',w.id,reason,{matterId:w.matter_id,revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:w.id,dissolved:true};
}

// Expiry is enforced in read predicates at the instant of access. Record its
// single audit event on the next native request, even when no scheduler ran.
export async function recordWallExpiries(db:D1Database,actor:Actor){
 for(const r of await rows(db,"SELECT r.* FROM s_wall_requests r WHERE r.status='approved' AND r.revoked_at IS NULL AND r.expires_at<=? AND NOT EXISTS(SELECT 1 FROM s_wall_expiries e WHERE e.request_id=r.id) AND (r.requester_email=? OR EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.id=r.wall_id AND w.custodian_email=?))",now(),actor.email,actor.email)){
  await atomic(db,actor,[stmt(db,'INSERT OR IGNORE INTO s_wall_expiries VALUES(?,?)',r.id,now()),
   stmt(db,"INSERT INTO s_audit(id,actor,action,object_id,detail,at,actor_id,role,channel,matter_id,revision,evidence) SELECT ?,?,'wall.access_expired',?,?,?, ?,?,'person',?,NULL,? WHERE changes()=1",id(),actor.email,r.id,JSON.stringify({expiresAt:r.expires_at}),now(),actor.id,actor.role,r.matter_id,JSON.stringify({grantId:r.id,expiresAt:r.expires_at}))]);
 }
}
export async function auditWallReads(db:D1Database,actor:Actor,path:string){
 const grants=await rows(db,`SELECT r.* FROM s_wall_requests r WHERE r.requester_email=? AND r.status='approved' AND r.revoked_at IS NULL AND r.expires_at>? AND NOT EXISTS(SELECT 1 FROM s_wall_members m WHERE m.matter_id=r.matter_id AND m.email=?) AND ${matterScope('r.matter_id')}`,actor.email,now(),actor.email,actor.role,actor.email);
 if(grants.length)await atomic(db,actor,grants.map(r=>audit(db,actor,'wall.access_read',r.id,JSON.stringify({path,grantId:r.id,expiresAt:r.expires_at}),{matterId:r.matter_id})));
}
