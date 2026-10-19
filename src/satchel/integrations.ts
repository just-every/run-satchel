import type {Bindings} from '../auth.server';
import {validateDestination} from '@runeditrun/rer/internal/modules/integrations/core/destination.ts';
import {atomic,audit,digest,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {listDocuments} from './documents';
import {listDeadlines} from './deadlines';
import {listTasks} from './tasks';
import {listBilling} from './billing';
import {propose} from './proposals';
import {randomSecret,seal} from './integration-secrets';
export const integrationScopes=['matters:read','tasks:read','documents:read','deadlines:read','finance:read','proposals:prepare'];
export const integrationEvents=['matter.created','matter.updated','task.changed','document.changed','deadline.changed','finance.changed','proposal.decided'];
export type Integration={record:Data;actor:Actor;scopes:string[];matters:string[]};
export function endpoint(value:unknown) {
 try{return validateDestination(text(value,'HTTPS webhook URL',2000)).href;}catch{insist(false,'Use a public HTTPS destination without credentials, fragments or a nonstandard port');}
}
export async function integrationState(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner');
 const integrations=await rows(db,'SELECT id,label,owner_id,scopes,matter_ids,endpoint,event_types,revoked,created_at,paused,failure_count,generation FROM s_integrations ORDER BY created_at,id');
 return {integrations:integrations.map(r=>({...r,scopes:JSON.parse(r.scopes),matterIds:JSON.parse(r.matter_ids),eventTypes:JSON.parse(r.event_types)})),scopes:integrationScopes,eventTypes:integrationEvents};
}
export async function createIntegration(env:Bindings,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 insist(Array.isArray(body.matterIds)&&body.matterIds.length>0&&body.matterIds.length<=100,'Select 1–100 permitted matters');
 const matters=[...new Set(body.matterIds.map((m:unknown)=>text(m,'Matter id',100)))];for(const m of matters)await matter(env.DB,actor,m);
 insist(Array.isArray(body.scopes)&&body.scopes.length>0&&body.scopes.every((s:unknown)=>integrationScopes.includes(String(s))),'Choose supported capabilities');
 const scopes=[...new Set<string>(body.scopes)],events=body.eventTypes??[];
 insist(Array.isArray(events)&&events.every((e:unknown)=>integrationEvents.includes(String(e))),'Choose supported events');
 for(const e of events)insist(scopes.includes(e.startsWith('proposal.')?'proposals:prepare':e.startsWith('matter.')?'matters:read':e.split('.')[0]+(e.startsWith('finance.')?'':'s')+':read'),'Each event needs its resource capability');
 const destination=body.endpoint?endpoint(body.endpoint):null;insist(destination||events.length===0,'Events need a webhook destination');
 const integrationId=id(),token='satchel_integration_'+randomSecret(),secret=destination?randomSecret():null,at=now(),label=text(body.label,'Integration name',80);
 await atomic(env.DB,actor,[stmt(env.DB,'INSERT INTO s_integrations(id,label,owner_id,digest,scopes,matter_ids,endpoint,event_types,secret_sealed,enabled_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',integrationId,label,actor.id,await digest(token),JSON.stringify(scopes),JSON.stringify(matters),destination,JSON.stringify([...new Set(events)]),secret?await seal(secret,env.SESSION_SECRET):null,at,at),audit(env.DB,actor,'integration.created',integrationId,JSON.stringify({label,scopes,matters,destination,events}))]);
 return {id:integrationId,label,key:token,signingSecret:secret};
}
export async function revokeIntegration(db:D1Database,actor:Actor,integrationId:string) {
 human(actor);need(actor,'owner');await atomic(db,actor,[stmt(db,'UPDATE s_integrations SET revoked=1 WHERE id=?',integrationId),audit(db,actor,'integration.revoked',integrationId)]);return {ok:true};
}
export async function rotateIntegration(env:Bindings,actor:Actor,integrationId:string) {
 human(actor);need(actor,'owner');const record=await stmt(env.DB,'SELECT * FROM s_integrations WHERE id=? AND revoked=0',integrationId).first<Data>();insist(record,'Active integration not found',404);
 const token='satchel_integration_'+randomSecret(),secret=record.endpoint?randomSecret():null;
 await atomic(env.DB,actor,[stmt(env.DB,'UPDATE s_integrations SET digest=?,secret_sealed=?,generation=generation+1,paused=1,failure_count=0 WHERE id=? AND revoked=0',await digest(token),secret?await seal(secret,env.SESSION_SECRET):null,integrationId),audit(env.DB,actor,'integration.rotated',integrationId,'Old API key invalidated; deliveries paused until the receiver has the new signing secret')]);return {id:integrationId,key:token,signingSecret:secret};
}
export async function resumeIntegration(db:D1Database,actor:Actor,integrationId:string) {
 human(actor);need(actor,'owner');await atomic(db,actor,[stmt(db,'UPDATE s_integrations SET paused=0,failure_count=0 WHERE id=? AND revoked=0',integrationId),audit(db,actor,'integration.resumed',integrationId,'Principal explicitly resumed delivery')]);return {ok:true};
}
export async function integrationAuth(db:D1Database,request:Request):Promise<Integration> {
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];insist(token,'An integration key is required',401);
 const r=await stmt(db,`SELECT i.*,o.email,o.display_name,o.role,m.role member_role FROM s_integrations i JOIN oa_operators o ON o.id=i.owner_id LEFT JOIN s_members m ON m.email=o.email AND m.active=1 WHERE i.digest=? AND i.revoked=0 AND o.status='active'`,await digest(token)).first<Data>();
 insist(r,'Invalid or revoked integration key',401);const role=r.role==='owner'?'owner':r.member_role;insist(role,'Integration sponsor no longer has access',403);
 return {record:r,actor:{id:r.owner_id,email:r.email,name:r.display_name,role,channel:'agent'},scopes:JSON.parse(r.scopes),matters:JSON.parse(r.matter_ids)};
}
export function capability(i:Integration,scope:string) {insist(i.scopes.includes(scope),'Integration capability refused',403);}
export async function integrationMatter(db:D1Database,i:Integration,matterId:string) {insist(i.matters.includes(matterId),'Matter not found',404);return matter(db,i.actor,matterId);}
export function page(items:Data[],query:Data) {
 const limit=integer(query.limit===undefined?25:Number(query.limit),'Page limit',1,100),after=typeof query.after==='string'?query.after:'';
 const result=items.filter(x=>String(x.id)>after).sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(0,limit+1);
 return {items:result.slice(0,limit),next:result.length>limit?String(result[limit-1].id):null};
}
export async function integrationMatters(db:D1Database,i:Integration,query:Data) {
 capability(i,'matters:read');const visible=await rows(db,`SELECT m.* FROM s_matters m WHERE (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?))`,i.actor.role,i.actor.email);
 return page(visible.filter(m=>i.matters.includes(m.id)),query);
}
export async function integrationRecords(db:D1Database,i:Integration,matterId:string,kind:string,query:Data) {
 insist(['tasks','documents','deadlines','finance'].includes(kind),'Unknown resource',404);capability(i,kind+':read');await integrationMatter(db,i,matterId);
 const data=kind==='tasks'?await listTasks(db,i.actor,matterId):kind==='documents'?await listDocuments(db,i.actor,matterId):kind==='deadlines'?await listDeadlines(db,i.actor,matterId):await listBilling(db,i.actor,matterId);
 if(kind!=='finance')return page(data as Data[],query);
 const billing=data as Data,entries=await rows(db,'SELECT e.* FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',matterId);
 return page([...billing.bills.map((b:Data)=>({...b,resource:'bill'})),...billing.entries.map((e:Data)=>({...e,resource:'entry'})),...entries.map(e=>({...e,resource:'trust-entry'}))],query);
}
export async function integrationPrepare(db:D1Database,i:Integration,kind:string,body:Data,requestKey:string) {
 capability(i,'proposals:prepare');insist(['bill','deadline'].includes(kind),'Only matter-bound bill and deadline preparation is permitted',403);
 await integrationMatter(db,i,text(body.matterId,'Matter'));const key=text(requestKey,'Idempotency-Key',100),fingerprint=await digest(JSON.stringify({kind,body}));
 const old=await stmt(db,'SELECT * FROM s_integration_requests WHERE integration_id=? AND request_key=?',i.record.id,key).first<Data>();
 if(old){insist(old.fingerprint===fingerprint,'Idempotency key belongs to different content',409);return JSON.parse(old.response);}
 return propose(db,{...i.actor,label:i.record.label} as Actor,kind,body,{id:i.record.id,requestKey:key,fingerprint});
}
