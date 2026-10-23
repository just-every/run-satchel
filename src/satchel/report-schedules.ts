// REPORT-003: the principal saves a report definition and schedules a weekly summary to named recipients. Each delivery is
// built with the recipient's own report permission at send time, carries counts only, and records its provider outcome;
// a failed delivery opens an exception owned by the principal with a due date.
import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {atomic,audit,Fault,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {timezone} from './deadlines';
import {clock,localInstant} from './reminder-time';
import {reportState} from './reports';
import {gateGrants} from './role-areas';
import {parseGrants} from './custom-roles';
import {reviewOf} from './providers';
const system={id:'scheduled-reports',email:'scheduler',role:'system',channel:'automation'} as any;
const filterKeys=['practice','owner','status'];
export const scheduleJson=(s:Data)=>({id:s.id,name:s.name,dashboard:s.dashboard,filters:JSON.parse(s.filters),weekday:s.weekday,time:s.time,timezone:s.timezone,channel:s.channel,recipients:JSON.parse(s.recipients) as string[],owner:s.owner_email,active:Boolean(s.active),revision:s.revision,updatedAt:s.updated_at});
// The recipient as the report doors will see them: their current role and custom-role grants, or nothing.
async function reportActor(db:D1Database,email:string):Promise<Actor|null> {
 const r=await stmt(db,"SELECT o.id,o.email,o.display_name,o.role,m.role member_role,cr.permissions grants FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email AND m.active=1 LEFT JOIN s_custom_roles cr ON cr.id=m.custom_role_id WHERE o.email=? AND o.status='active'",email).first<Data>();
 const role=r?.role==='owner'?'owner':r?.member_role;if(!r||!['owner','lawyer'].includes(role))return null;
 const actor={id:r.id,email:r.email,name:r.display_name,role,channel:'person',...(r.role!=='owner'&&r.grants?{grants:parseGrants(r.grants)}:{})} as Actor;
 try{gateGrants(actor,'GET','/api/satchel/reports');}catch(e){if(e instanceof Fault&&e.status===403)return null;throw e;}
 return actor;
}
export async function saveSchedule(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 const previous=body.id?await stmt(db,'SELECT * FROM s_report_schedules WHERE id=?',text(body.id,'Schedule',100)).first<Data>():null;insist(!body.id||previous,'Schedule not found',404);
 if(previous)insist(body.revision===previous.revision,'The schedule changed. Refresh before saving.',409);
 insist(['workload','deadlines'].includes(body.dashboard),'Choose the workload or deadlines report');insist(['email','portal'].includes(body.channel),'Choose email or portal delivery');
 const raw=body.filters&&typeof body.filters==='object'&&!Array.isArray(body.filters)?body.filters:{},filters:Data={};for(const k of filterKeys)if(raw[k])filters[k]=text(raw[k],'Report filter',254);
 const recipients=[...new Set((Array.isArray(body.recipients)?body.recipients:[]).map((e:unknown)=>text(e,'Recipient',254).toLowerCase()))];insist(recipients.length>=1&&recipients.length<=20,'Choose one to 20 recipients');
 for(const email of recipients)insist(await reportActor(db,email),`${email} cannot open reports`,400);
 const value={name:text(body.name,'Report name',160),weekday:integer(body.weekday,'Weekday',1,7),time:clock(body.time,'Send time'),zone:timezone(body.timezone)},scheduleId=previous?.id??id(),revision=id(),at=now();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_report_schedules(id,name,dashboard,filters,weekday,time,timezone,channel,recipients,owner_email,active,revision,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,dashboard=excluded.dashboard,filters=excluded.filters,weekday=excluded.weekday,time=excluded.time,timezone=excluded.timezone,channel=excluded.channel,recipients=excluded.recipients,active=excluded.active,revision=excluded.revision,updated_at=excluded.updated_at',scheduleId,value.name,body.dashboard,JSON.stringify(filters),value.weekday,value.time,value.zone,body.channel,JSON.stringify(recipients),previous?.owner_email??actor.email,body.active===false?0:1,revision,previous?.created_by??actor.email,previous?.created_at??at,at),
  audit(db,actor,'report.schedule_saved',scheduleId,JSON.stringify({...value,dashboard:body.dashboard,filters,channel:body.channel,recipients}))]);
 return scheduleState(db,actor);
}
export async function removeRecipient(db:D1Database,actor:Actor,scheduleId:string,body:Data) {
 human(actor);need(actor,'owner');const s=await stmt(db,'SELECT * FROM s_report_schedules WHERE id=?',scheduleId).first<Data>();insist(s,'Schedule not found',404);
 const email=text(body.email,'Recipient',254).toLowerCase(),list=JSON.parse(s.recipients) as string[];insist(list.includes(email),'That person is not a recipient',404);insist(list.length>1,'A schedule keeps at least one recipient; deactivate it instead',409);
 const reason=text(body.reason,'Reason',1000);
 await atomic(db,actor,[stmt(db,'UPDATE s_report_schedules SET recipients=?,revision=?,updated_at=? WHERE id=? AND revision=?',JSON.stringify(list.filter(e=>e!==email)),id(),now(),s.id,s.revision),audit(db,actor,'report.recipient_removed',s.id,JSON.stringify({email,reason}))]);
 return scheduleState(db,actor);
}
export async function scheduleState(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner');
 const [schedules,deliveries,exceptions]=await Promise.all([rows(db,'SELECT * FROM s_report_schedules ORDER BY created_at,id'),rows(db,'SELECT id,schedule_id,slot,recipient,status,provider,detail,at FROM s_report_deliveries ORDER BY slot DESC,recipient LIMIT 200'),rows(db,'SELECT * FROM s_report_exceptions ORDER BY created_at DESC,id')]);
 return {schedules:schedules.map(scheduleJson),deliveries:deliveries.map(d=>({id:d.id,scheduleId:d.schedule_id,slot:d.slot,recipient:d.recipient,status:d.status,provider:d.provider,detail:d.detail,at:d.at})),exceptions:exceptions.map(e=>({id:e.id,scheduleId:e.schedule_id,deliveryId:e.delivery_id,recipient:e.recipient,owner:e.owner_email,dueDate:e.due_date,status:e.status,note:e.note,createdAt:e.created_at,resolvedBy:e.resolved_by}))};
}
export async function resolveException(db:D1Database,actor:Actor,exceptionId:string,body:Data) {
 human(actor);need(actor,'owner');const e=await stmt(db,"SELECT * FROM s_report_exceptions WHERE id=? AND status='open'",exceptionId).first<Data>();insist(e,'Open exception not found',404);
 await atomic(db,actor,[stmt(db,"UPDATE s_report_exceptions SET status='resolved',note=?,resolved_by=?,resolved_at=? WHERE id=? AND status='open'",text(body.note,'What was done',1000),actor.email,now(),e.id),audit(db,actor,'report.exception_resolved',e.id,'{}')]);
 return scheduleState(db,actor);
}
// A recipient's own summaries: portal deliveries and the status of their emails, counts only.
export async function mySummaries(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner','lawyer');
 return {summaries:(await rows(db,'SELECT d.id,d.slot,d.status,d.summary,s.name FROM s_report_deliveries d JOIN s_report_schedules s ON s.id=d.schedule_id WHERE d.recipient=? ORDER BY d.slot DESC LIMIT 20',actor.email)).map(d=>({id:d.id,name:d.name,slot:d.slot,status:d.status,summary:d.summary?JSON.parse(d.summary):null}))};
}
function latestSlot(s:Data,atMs:number){
 let best:number|null=null;
 for(let back=0;back<=8;back++){
  const probe=new Date(atMs-back*86400000),day=new Intl.DateTimeFormat('en-CA',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(probe),weekday=new Date(day+'T00:00:00Z').getUTCDay()||7;
  if(weekday!==s.weekday)continue;let slot:number;try{slot=localInstant(day,s.time,s.timezone);}catch{continue;}
  if(slot<=atMs&&(best===null||slot>best))best=slot;
 }
 return best;
}
export async function runReportSchedules(env:Bindings,atMs:number) {
 const db=env.DB,at=new Date(atMs).toISOString(),mail=operatorMail(env),authority=await reviewOf(db,'mail');let made=0;
 for(const s of await rows(db,'SELECT * FROM s_report_schedules WHERE active=1')){
  const slotMs=latestSlot(s,atMs);if(slotMs===null||slotMs<Date.parse(s.created_at)||atMs-slotMs>36*3600000)continue;const slot=new Date(slotMs).toISOString();
  for(const email of JSON.parse(s.recipients) as string[]){
   const deliveryId=id(),claimed=await stmt(db,"INSERT OR IGNORE INTO s_report_deliveries(id,schedule_id,slot,recipient,status,at) VALUES(?,?,?,?,'queued',?)",deliveryId,s.id,slot,email,at).run();if(!claimed.meta.changes)continue;made++;
   const finish=async(status:string,detail:string,summary:Data|null=null,provider:string|null=null,providerId:string|null=null)=>{
    const writes=[stmt(db,'UPDATE s_report_deliveries SET status=?,detail=?,summary=?,provider=?,provider_id=? WHERE id=?',status,detail,summary?JSON.stringify(summary):null,provider,providerId,deliveryId),audit(db,system,'report.delivery_result',deliveryId,JSON.stringify({scheduleId:s.id,recipient:email,status,provider}))];
    if(['failed','uncertain','skipped'].includes(status)){const due=new Date(atMs+86400000).toISOString().slice(0,10);writes.push(stmt(db,"INSERT INTO s_report_exceptions(id,schedule_id,delivery_id,recipient,owner_email,due_date,status,created_at) VALUES(?,?,?,?,?,?,'open',?)",id(),s.id,deliveryId,email,s.owner_email,due,at));}
    await db.batch(writes);
   };
   const actor=await reportActor(db,email);if(!actor){await finish('skipped','The recipient no longer has report permission; nothing was sent');continue;}
   let summary:Data;try{const r=await reportState(db,actor,JSON.parse(s.filters)),d=r.dashboards.find(x=>x.id===s.dashboard)!;summary={dashboard:s.dashboard,title:d.title,count:d.count,overdue:d.overdueCount??0,asOf:r.asOf};}catch{await finish('failed','The report could not be built for this recipient');continue;}
   if(s.channel==='portal'){await finish('available','Summary is available in the recipient’s workspace',summary);continue;}
   if(!authority||!mail||!env.MAIL_FROM){await finish('failed',authority?'The firm mail provider or sender is not configured':'The firm has not recorded its mail provider review',summary);continue;}
   try{const r=await mail.send({deliveryId,from:env.MAIL_FROM,to:[email],subject:`Weekly summary: ${s.name}`,text:`${summary.overdue} overdue of ${summary.count} items in your ${summary.title.toLowerCase()} report. Sign in to read the details: ${env.AUTH_ORIGIN}/app\n\nThis email names no matters or clients.`,html:'',headers:{}});
    const status=r.status==='accepted'||r.status==='development'?'accepted':r.status==='uncertain'?'uncertain':'failed';await finish(status,status==='accepted'?'Provider accepted the summary; mailbox delivery is unconfirmed.':`Provider result: ${r.status}`,summary,r.provider,r.providerMessageId??null);}
   catch{await finish('uncertain','The provider outcome is uncertain; no automatic resend.',summary);}
  }
 }
 return {made};
}
