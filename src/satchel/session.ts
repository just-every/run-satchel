import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server';
import { digest, Fault, insist, need, stmt, type Actor } from './model';
import { agentSponsor } from './role-doors';
import { parseGrants } from './custom-roles';
import {mfaRequired} from './session-mfa';
export async function person(request: Request, original: Bindings): Promise<Actor> {
 const env = runtimeBindings(original), url = new URL(request.url);
 insist(url.origin === env.AUTH_ORIGIN, 'Invalid host', 403);
 if (!['GET','HEAD'].includes(request.method)) insist(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid request origin', 403);
 const session = await operatorAuth(env).getSession(request);
 insist(session, 'Sign in to continue', 401);
 if(!/^\/api\/satchel\/security\/mfa(?:\/|$)/.test(url.pathname))insist(!await mfaRequired(env,session),'Verify your authenticator to continue',403);
 const o = session.operator;
 const member = await stmt(env.DB, 'SELECT m.role,r.permissions FROM s_members m LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE m.email=? AND m.active=1', o.email).first<{role: Actor['role'];permissions:string|null}>();
 const role = o.role === 'owner' ? 'owner' : member?.role;
 insist(role, 'Ask the principal to add you to the firm', 403);
 return {id:o.id,email:o.email,name:o.displayName,role,channel:'person',...(o.role!=='owner'&&member?.permissions?{grants:parseGrants(member.permissions)}:{})};
}
export async function agent(request: Request, env: Bindings): Promise<Actor & {label:string}> {
 const raw = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 insist(raw, 'An agent key is required', 401);
 const key=await stmt(env.DB,'SELECT id FROM s_agent_keys WHERE digest=? AND revoked=0',await digest(raw)).first<{id:string}>();
 insist(key,'Invalid or revoked agent key',401);return agentForKey(env.DB,key.id);
}
export async function agentForKey(db:D1Database,keyId:string):Promise<Actor & {label:string}>{
 const record = await stmt(db, `SELECT k.id key_id,k.label,o.id,o.email,o.display_name,o.role,m.role member_role,r.permissions grants FROM s_agent_keys k JOIN oa_operators o ON o.id=k.owner_id LEFT JOIN s_members m ON m.email=o.email AND m.active=1 LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE k.id=? AND k.revoked=0 AND o.status='active'`, keyId).first<any>();
 insist(record, 'Invalid or revoked agent key', 401);
 const role = record.role === 'owner' ? 'owner' : record.member_role;
 insist(role, 'This agent no longer has firm access', 403);agentSponsor(role);
 return {id:record.id,email:record.email,name:record.display_name,role,channel:'agent',label:record.label,agentKeyId:record.key_id,...(record.role!=='owner'&&record.grants?{grants:parseGrants(record.grants)}:{})};
}
