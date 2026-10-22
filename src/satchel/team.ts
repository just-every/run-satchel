import { type Bindings, operatorAuth, runtimeBindings } from '../auth.server';
import { atomic,audit,digest,human,id,insist,need,now,rows,stmt,text,type Actor,type Data } from './model';
export async function saveMember(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 const email=text(body.email,'Email',254).toLowerCase(),name=text(body.name,'Name',100);
 insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email');
 insist(['lawyer','assistant','trust_officer','billing','accountant','client'].includes(body.role),'Choose lawyer, assistant, trust officer, billing, accountant or client');
 // FIRM-008: a custom role is a ceiling the principal places on a member; omitted keeps the current one, null removes it.
 const assign='customRoleId' in body,customRoleId=assign&&body.customRoleId!==null?text(body.customRoleId,'Custom role',100):null,before=await stmt(db,'SELECT custom_role_id FROM s_members WHERE email=?',email).first<Data>();
 if(customRoleId){
  insist(await stmt(db,'SELECT 1 FROM s_custom_roles WHERE id=?',customRoleId).first(),'Custom role not found',404);
  insist(body.role!=='client','A client has no staff doors for a custom role to narrow');
  insist(!await stmt(db,"SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner'",email).first(),'The principal’s authority cannot be narrowed by a custom role',403);
 }
 await atomic(db,actor,[stmt(db,'INSERT INTO s_members(email,name,role,active,custom_role_id) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active'+(assign?',custom_role_id=excluded.custom_role_id':''),email,name,body.role,body.active===false?0:1,customRoleId),audit(db,actor,'member.saved',email,body.role,{previousCustomRoleId:before?.custom_role_id??null,customRoleId:assign?customRoleId:before?.custom_role_id??null})]);
 return {email,name,role:body.role,active:body.active!==false,customRoleId:assign?customRoleId:before?.custom_role_id??null};
}
export async function inviteMember(request:Request,env:Bindings,actor:Actor,body:Data) {
 human(actor);need(actor,'owner'); const member=await stmt(env.DB,'SELECT * FROM s_members WHERE email=? AND active=1',text(body.email,'Email').toLowerCase()).first<Data>();
 insist(member,'Save an active firm member first',404);
 await atomic(env.DB,actor,[audit(env.DB,actor,'member.invitation_requested',member.email,'Native invitation requested; provider outcome not yet known')]);
 try{const result=await operatorAuth(runtimeBindings(env)).invite(request,{email:member.email,displayName:member.name,role:'member',returnTo:'/app'});await atomic(env.DB,actor,[audit(env.DB,actor,'member.invitation_result',member.email,JSON.stringify({nativeRequestStatus:result.status,delivery:'unconfirmed',providerMessageId:null}))]);return result;}
 catch(error){await atomic(env.DB,actor,[audit(env.DB,actor,'member.invitation_uncertain',member.email,'No confirmed result returned; reconcile the native invitation and mail state before another send')]);throw error;}
}
export async function createAgentKey(db:D1Database,actor:Actor,body:Data) {
 human(actor); need(actor,'owner','lawyer');
 const key='satchel_'+[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join(''),keyId=id(),label=text(body.label,'Agent name',80);
 await atomic(db,actor,[stmt(db,'INSERT INTO s_agent_keys VALUES(?,?,?,?,0,?)',keyId,label,await digest(key),actor.id,now()),audit(db,actor,'agent.key_created',keyId,label)]);
 return {id:keyId,label,key};
}
export async function revokeAgentKey(db:D1Database,actor:Actor,keyId:string) {
 human(actor);await atomic(db,actor,[stmt(db,'UPDATE s_agent_keys SET revoked=1 WHERE id=? AND owner_id=?',keyId,actor.id),audit(db,actor,'agent.key_revoked',keyId)]);return {ok:true};
}
export async function teamState(db:D1Database,actor:Actor) {
 return {keys:await rows(db,'SELECT id,label,revoked,created_at FROM s_agent_keys WHERE owner_id=? ORDER BY created_at DESC',actor.id)};
}
