import {wallAllows} from './matter-scope';
import type {Bindings} from '../auth.server';
import {audit,human,id,insist,need,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {integrationMatter,capability,page,type Integration} from './integrations';
import {visibleDocument} from './documents';
import {visibleDeadline} from './deadlines';
import {sign,unseal} from './integration-secrets';
import {agentRoles} from './role-doors';
import {allows} from './role-areas';
import {parseGrants} from './custom-roles';
async function sponsor(db:D1Database,record:Data):Promise<Integration|null> {
 const o=await stmt(db,`SELECT o.*,m.role member_role,cr.permissions grants FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email AND m.active=1 LEFT JOIN s_custom_roles cr ON cr.id=m.custom_role_id WHERE o.id=? AND o.status='active'`,record.owner_id).first<Data>();
 const role=o?.role==='owner'?'owner':o?.member_role;if(!o||!role||record.revoked||!agentRoles.includes(role))return null;
 return {record,actor:{id:o.id,email:o.email,name:o.display_name,role,channel:'agent',...(o.role!=='owner'&&o.grants?{grants:parseGrants(o.grants)}:{})},scopes:JSON.parse(record.scopes),matters:JSON.parse(record.matter_ids)};
}
async function visible(db:D1Database,i:Integration,e:Data) {
 try {
  capability(i,e.kind.startsWith('proposal.')?'proposals:prepare':e.kind.startsWith('matter.')?'matters:read':e.kind.split('.')[0]+(e.kind.startsWith('finance.')?'':'s')+':read');
  const area=e.kind.startsWith('document.')?'documents':e.kind.startsWith('finance.')?'billing':null;if(area&&!allows(i.actor,area,'read'))return false;
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
export async function dispatchWebhooks(env:Bindings,only?:string,replayEvent?:string) {
 // Only the principal can enter a destination. The current ct-approved boundary
 // is literal/name public-host validation plus HTTPS and no redirects. Resolved-
 // address pinning remains CONNECT-001's explicit Base egress-door gap.
 const db=env.DB,at=now(),integrations=await rows(db,'SELECT * FROM s_integrations WHERE revoked=0 AND paused=0 AND endpoint IS NOT NULL'+(only?' AND id=?':''),...(only?[only]:[]));let attempted=0;
 for(const record of integrations) {
  const i=await sponsor(db,record);if(!i)continue;const types=JSON.parse(record.event_types) as string[];
  const events=await rows(db,`SELECT e.* FROM s_integration_events e WHERE at>=? AND kind IN(SELECT value FROM json_each(?))`+(replayEvent?' AND id=?':' AND NOT EXISTS(SELECT 1 FROM s_webhook_deliveries d WHERE d.integration_id=? AND d.event_id=e.id)')+' ORDER BY sequence LIMIT 100',record.enabled_at,JSON.stringify(types),replayEvent??record.id);
  for(const e of events)await stmt(db,'INSERT OR IGNORE INTO s_webhook_deliveries(integration_id,event_id,status) VALUES(?,?,?)',record.id,e.id,await visible(db,i,e)?'queued':'refused').run();
  await db.batch([
   stmt(db,"INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome) SELECT integration_id,event_id,?,'uncertain' FROM s_webhook_deliveries WHERE integration_id=? AND status='sending' AND lease_until<?",at,record.id,at),
   stmt(db,"UPDATE s_webhook_deliveries SET status='uncertain',claim=NULL,lease_until=NULL WHERE integration_id=? AND status='sending' AND lease_until<?",record.id,at)
  ]);
  if(replayEvent){const prior=await stmt(db,'SELECT status FROM s_webhook_deliveries WHERE integration_id=? AND event_id=?',record.id,replayEvent).first<Data>();insist(prior?.status!=='uncertain','Reconcile the uncertain receiver outcome before another attempt',409);}
  if(replayEvent)await stmt(db,"UPDATE s_webhook_deliveries SET status='queued',claim=NULL,lease_until=NULL WHERE integration_id=? AND event_id=? AND status<>'sending'",record.id,replayEvent).run();
  const deliveries=await rows(db,`SELECT e.* FROM s_webhook_deliveries d JOIN s_integration_events e ON e.id=d.event_id WHERE d.integration_id=? AND d.status IN('queued','failed') ORDER BY e.sequence LIMIT 25`,record.id);
  for(const e of deliveries) {
   // Recheck the local credential, sponsor and private-source boundary immediately before egress.
   const fresh=await stmt(db,'SELECT * FROM s_integrations WHERE id=? AND revoked=0',record.id).first<Data>(),current=fresh?await sponsor(db,fresh):null;
   if(fresh?.paused||fresh?.generation!==record.generation)break;
   if(!current||!await visible(db,current,e)) {await stmt(db,"UPDATE s_webhook_deliveries SET status='refused' WHERE integration_id=? AND event_id=?",record.id,e.id).run();continue;}
   const claim=id(),lease=new Date(Date.now()+60000).toISOString();
   const claimed=await stmt(db,`UPDATE s_webhook_deliveries SET status='sending',claim=?,lease_until=? WHERE integration_id=? AND event_id=? AND status IN('queued','failed') AND EXISTS(SELECT 1 FROM s_integrations i JOIN oa_operators o ON o.id=i.owner_id WHERE i.id=? AND i.revoked=0 AND i.paused=0 AND i.generation=? AND o.status='active' AND EXISTS(SELECT 1 FROM s_integration_events claim_event WHERE claim_event.id=? AND ${wallAllows('claim_event.matter_id','o.email',"'agent'")}) AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=1)))`,claim,lease,record.id,e.id,record.id,record.generation,e.id).run();if(!claimed.meta.changes)continue;
   await stmt(db,"INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome) VALUES(?,?,?,'sending')",record.id,e.id,now()).run();
   let outcome='uncertain',status:number|null=null;
   try {
    const body=JSON.stringify(payload(e)),timestamp=String(Math.floor(Date.now()/1000)),signature=await sign(await unseal(record.secret_sealed,env.SESSION_SECRET),timestamp+'.'+e.id+'.'+body);
    const response=await fetch(record.endpoint,{method:'POST',redirect:'manual',headers:{'content-type':'application/json','satchel-event-id':e.id,'satchel-timestamp':timestamp,'satchel-signature':'sha256='+signature},body,signal:AbortSignal.timeout(10000)});
    status=response.status;outcome=response.ok?'delivered':response.status>=500?'uncertain':'failed';await response.body?.cancel();
   }catch{/* A dropped connection is uncertain, with the stable event id retained for deduplication. */}
   await db.batch([stmt(db,'INSERT INTO s_webhook_attempts(integration_id,event_id,at,outcome,http_status) VALUES(?,?,?,?,?)',record.id,e.id,now(),outcome,status),stmt(db,'UPDATE s_webhook_deliveries SET status=?,claim=NULL,lease_until=NULL WHERE integration_id=? AND event_id=? AND claim=?',outcome,record.id,e.id,claim),stmt(db,'UPDATE s_integrations SET failure_count=CASE WHEN ? THEN 0 ELSE failure_count+1 END,paused=CASE WHEN NOT ? AND failure_count>=4 THEN 1 ELSE paused END WHERE id=?',outcome==='delivered'?1:0,outcome==='delivered'?1:0,record.id),audit(db,{id:'integration-webhooks',email:'scheduler',role:'system',channel:'automation'},'integration.webhook_result',record.id,JSON.stringify({eventId:e.id,outcome,httpStatus:status}))]);attempted++;
  }
 }return {attempted};
}
export async function dispatchIntegration(env:Bindings,actor:Actor,integrationId:string,body:Data) {
 human(actor);need(actor,'owner');
 const record=await stmt(env.DB,'SELECT matter_ids FROM s_integrations WHERE id=?',integrationId).first<Data>();insist(record,'Integration not found',404);
 const delegated={...actor,channel:'agent' as const};for(const matterId of JSON.parse(record.matter_ids))await matter(env.DB,delegated,matterId);
 const eventId=body.eventId===undefined?undefined:text(body.eventId,'Event ID',100);
 if(eventId){const event=await stmt(env.DB,'SELECT matter_id FROM s_integration_events WHERE id=?',eventId).first<Data>();insist(event,'Event not found',404);await matter(env.DB,delegated,event.matter_id);}
 return dispatchWebhooks(env,integrationId,eventId);
}
