import {digest,human,id,insist,need,stmt,type Actor,type Data} from './model';

export type MicrosoftBindings={DB:D1Database;SESSION_SECRET:string;ENTRA_TENANT_ID?:string;ENTRA_CLIENT_ID?:string;ENTRA_CLIENT_SECRET?:string};
export function microsoftPrincipal(actor:Actor){human(actor);need(actor,'owner');}

// Match the native session's operator version, provider generation and provider
// pins as well as its expiry. An installation owner with a firm membership must
// still have active membership; a designated accounting role does not demote an owner.
const sessionSql=(session:string,operator:string,email:string,version:string)=>`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
 WHERE s.id=${session} AND o.id=${operator} AND o.email=${email} AND o.role='owner' AND o.status='active'
 AND o.version=${version} AND s.operator_version=o.version AND s.revoked_at IS NULL
 AND s.expires_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 AND NOT EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=0)
 AND (s.kind!='oidc' OR EXISTS(SELECT 1 FROM oa_provider_sessions ps JOIN oa_auth_settings a
 ON a.singleton=1 AND a.idp_sign_in=1 AND a.generation=ps.generation WHERE ps.session_id=s.id))
 AND NOT EXISTS(SELECT 1 FROM oa_provider_session_pins pin WHERE pin.session_id=s.id
 AND NOT EXISTS(SELECT 1 FROM oa_identity_providers p WHERE p.provider_id=pin.provider_id AND p.status='linked'
 AND p.issuer=pin.issuer AND p.client_id=pin.client_id AND p.linked_at=pin.linked_at)))`;
export const microsoftSessionSql=sessionSql('?','?','?','?');
export const microsoftStoredSessionSql=(alias:'j')=>sessionSql(`${alias}.session_id`,`${alias}.sponsor_id`,'o.email',`${alias}.sponsor_version`);
export const sessionArgs=(actor:Actor,sessionId:string,version:number)=>[sessionId,actor.id,actor.email,version];
export async function microsoftOwner(db:D1Database,actor:Actor,sessionId:string){
 microsoftPrincipal(actor);
 const owner=await stmt(db,"SELECT version FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active'",actor.id,actor.email).first<Data>();
 insist(owner&&await stmt(db,`SELECT 1 WHERE ${microsoftSessionSql}`,...sessionArgs(actor,sessionId,owner.version)).first(),'Current principal session required',403);
 return Number(owner.version);
}
export function microsoftGuard(db:D1Database,sql:string,...values:any[]){
 const key=id();return [stmt(db,`INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN (${sql}) THEN 1 ELSE 0 END)`,key,...values),stmt(db,'DELETE FROM s_guard WHERE id=?',key)];
}
export const microsoftSessionGuard=(db:D1Database,actor:Actor,sessionId:string,version:number)=>microsoftGuard(db,microsoftSessionSql,...sessionArgs(actor,sessionId,version));
export async function microsoftConfiguration(env:MicrosoftBindings){
 insist(typeof env.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=32,'A session secret of at least 32 characters is required',503);
 const guid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
 insist(typeof env.ENTRA_TENANT_ID==='string'&&guid.test(env.ENTRA_TENANT_ID)&&typeof env.ENTRA_CLIENT_ID==='string'&&guid.test(env.ENTRA_CLIENT_ID)&&typeof env.ENTRA_CLIENT_SECRET==='string'&&env.ENTRA_CLIENT_SECRET.length>0,'Microsoft application credentials are not configured',503);
 return {tenant:env.ENTRA_TENANT_ID,client:env.ENTRA_CLIENT_ID,secret:env.ENTRA_CLIENT_SECRET,fingerprint:await digest(JSON.stringify([env.ENTRA_TENANT_ID.toLowerCase(),env.ENTRA_CLIENT_ID.toLowerCase()]))};
}
export const microsoftSealKey=(env:MicrosoftBindings)=>'satchel-microsoft:'+env.SESSION_SECRET;
export const microsoftJobView=(j:Data)=>({id:j.id,status:j.status,outcome:j.outcome,generation:j.generation,capability:j.capability,createdAt:j.created_at,startedAt:j.started_at,finishedAt:j.finished_at,userCount:j.user_count,hasMore:j.has_more===null?null:!!j.has_more,providerStatus:j.provider_status,attempts:j.started_at?1:0,nextAction:j.status==='queued'?'Run under the originating authorized device':j.status==='sending'?'Await the bounded provider response':j.status==='uncertain'?'Inspect uncertainty; explicitly queue a new read if still needed':j.status==='succeeded'?'Read complete; directory data is not retained':'Reconnect or restore current authority before queuing a new read'});
