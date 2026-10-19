import type {Bindings} from '../auth.server';
import {audit,human,id,insist,need,now,rows,stmt,type Actor,type Data} from './model';
import {integrationMatter,capability,page,type Integration} from './integrations';
import {visibleDocument} from './documents';
import {visibleDeadline} from './deadlines';
import {sign,unseal} from './integration-secrets';
async function sponsor(db:D1Database,record:Data):Promise<Integration|null> {
 const o=await stmt(db,`SELECT o.*,m.role member_role FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email AND m.active=1 WHERE o.id=? AND o.status='active'`,record.owner_id).first<Data>();
 const role=o?.role==='owner'?'owner':o?.member_role;if(!o||!role||record.revoked)return null;
 return {record,actor:{id:o.id,email:o.email,name:o.display_name,role,channel:'agent'},scopes:JSON.parse(record.scopes),matters:JSON.parse(record.matter_ids)};
}
async function visible(db:D1Database,i:Integration,e:Data) {
 try {
  capability(i,e.kind.startsWith('proposal.')?'proposals:prepare':e.kind.startsWith('matter.')?'matters:read':e.kind.split('.')[0]+(e.kind.startsWith('finance.')?'':'s')+':read');
  await integrationMatter(db,i,e.matter_id);
  if(e.kind==='document.changed')await visibleDocument(db,i.actor,e.object_id);
  if(e.kind==='deadline.changed')await visibleDeadline(db,i.actor,e.object_id);
  if(e.kind==='proposal.decided')insist(await stmt(db,'SELECT 1 FROM s_proposals WHERE id=? AND for_email=?',e.object_id,i.actor.email).first(),'Proposal not found',404);
  return true;
 } catch(e) {if(e instanceof Error&&'status'in e&&[403,404].includes(Number(e.status)))return false;throw e;}
}
const payload=(e:Data)=>({id:e.id,version:1,type:e.kind,createdAt:e.at,matterId:e.matter_id,objectId:e.object_id});
export async function integrationEventPage(db:D1Database,i:Integration,query:Data) {
 const all=await rows(db,'SELECT * FROM s_integration_events WHERE at>=? ORDER BY sequence',i.record.enabled_at),events=[];
 for(const e of all)if(await visible(db,i,e))events.push({...payload(e),id:e.id});return page(events,query);
}
export async function webhookJournal(db:D1Database,actor:Actor,integrationId:string) {
 human(actor);need(actor,'owner');
 return {attempts:await rows(db,'SELECT * FROM s_webhook_attempts WHERE integration_id=? ORDER BY sequence',integrationId),deliveries:await rows(db,'SELECT d.*,e.kind,e.matter_id,e.object_id FROM s_webhook_deliveries d JOIN s_integration_events e ON e.id=d.event_id WHERE d.integration_id=? ORDER BY e.sequence',integrationId)};
}
export async function dispatchWebhooks(env:Bindings,only?:string,replayEvent?:string) {
 // The Worker fetch API cannot pin a validated address while verifying the original
 // TLS hostname. Refuse without the installation's enforcing transport capability.
 if(!env.SATCHEL_EGRESS)return {attempted:0,blocked:'Enforcing egress service is not configured'};
 const db=env.DB,at=now(),integrations=await rows(db,'SELECT * FROM s_integrations WHERE revoked=0 AND paused=0 AND endpoint IS NOT NULL'+(only?' AND id=?':''),...(only?[only]:[]));let attempted=0;
 for(const record of integrations) {
  const i=await sponsor(db,record);if(!i)continue;const types=JSON.parse(record.event_types) as string[];
  const events=await rows(db,`SELECT e.* FROM s_integration_events e WHERE at>=? AND kind IN(SELECT value FROM json_each(?))`+(replayEvent?' AND id=?':' AND NOT EXISTS(SELECT 1 FROM s_webhook_deliveries d WHERE d.integration_id=? AND d.event_id=e.id)')+' ORDER BY sequence LIMIT 100',record.enabled_at,JSON.stringify(types),replayEvent??record.id);
  for(const e of events)await stmt(db,'INSERT OR IGNORE INTO s_webhook_deliveries(integration_id,event_id,status) VALUES(?,?,?)',record.id,e.id,await visible(db,i,e)?'queued':'refused').run();
  if(replayEvent)await stmt(db,"UPDATE s_webhook_deliveries SET status='queued',claim=NULL,lease_until=NULL WHERE integration_id=? AND event_id=? AND status<>'sending'",record.id,replayEvent).run();
  const deliveries=await rows(db,`SELECT e.* FROM s_webhook_deliveries d JOIN s_integration_events e ON e.id=d.event_id WHERE d.integration_id=? AND (d.status IN('queued','uncertain','failed') OR (d.status='sending' AND d.lease_until<?)) ORDER BY e.sequence LIMIT 25`,record.id,at);
  for(const e of deliveries) {
   // Recheck the local credential, sponsor and private-source boundary immediately before egress.
   const fresh=await stmt(db,'SELECT * FROM s_integrations WHERE id=? AND revoked=0',record.id).first<Data>(),current=fresh?await sponsor(db,fresh):null;
   if(fresh?.paused||fresh?.generation!==record.generation)break;
   if(!current||!await visible(db,current,e)) {await stmt(db,"UPDATE s_webhook_deliveries SET status='refused' WHERE integration_id=? AND event_id=?",record.id,e.id).run();continue;}
   const claim=id(),lease=new Date(Date.now()+60000).toISOString();
   const claimed=await stmt(db,`UPDATE s_webhook_deliveries SET status='sending',claim=?,lease_until=? WHERE integration_id=? AND event_id=? AND (status IN('queued','uncertain','failed') OR (status='sending' AND lease_until<?)) AND EXISTS(SELECT 1 FROM s_integrations i JOIN oa_operators o ON o.id=i.owner_id WHERE i.id=? AND i.revoked=0 AND o.status='active' AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=1)))`,claim,lease,record.id,e.id,at,record.id).run();if(!claimed.meta.changes)continue;
   await stmt(db,"INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome) VALUES(?,?,?,'sending')",record.id,e.id,now()).run();
   let outcome='uncertain',status:number|null=null;
   try {
    const body=JSON.stringify(payload(e)),timestamp=String(Math.floor(Date.now()/1000)),signature=await sign(await unseal(record.secret_sealed,env.SESSION_SECRET),timestamp+'.'+e.id+'.'+body);
    const response=await env.SATCHEL_EGRESS.send({url:record.endpoint,headers:{'content-type':'application/json','satchel-event-id':e.id,'satchel-timestamp':timestamp,'satchel-signature':'sha256='+signature},body});
    status=response.status;outcome=status>=200&&status<300?'delivered':'failed';
   }catch{/* A dropped connection is uncertain, with the stable event id retained for deduplication. */}
   await db.batch([stmt(db,'INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome,http_status) VALUES(?,?,?,?,?)',record.id,e.id,now(),outcome,status),stmt(db,'UPDATE s_webhook_deliveries SET status=?,claim=NULL,lease_until=NULL WHERE integration_id=? AND event_id=? AND claim=?',outcome,record.id,e.id,claim),stmt(db,'UPDATE s_integrations SET failure_count=CASE WHEN ? THEN 0 ELSE failure_count+1 END,paused=CASE WHEN NOT ? AND failure_count>=4 THEN 1 ELSE paused END WHERE id=?',outcome==='delivered'?1:0,outcome==='delivered'?1:0,record.id),audit(db,{id:'integration-webhooks',email:'scheduler',role:'system',channel:'automation'},'integration.webhook_result',record.id,JSON.stringify({eventId:e.id,outcome,httpStatus:status}))]);attempted++;
  }
 }return {attempted};
}
export async function dispatchIntegration(env:Bindings,actor:Actor,integrationId:string,body:Data) {
 human(actor);need(actor,'owner');return dispatchWebhooks(env,integrationId,body.eventId);
}
