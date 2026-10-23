// INTAKE-008: consented, bounded follow-up sequences. Settings are the principal's; a sequence starts only on a lead
// with its own recorded consent and the firm's recorded mail sending authority (OSS-001 provider review).
// A contact merge supplies neither: consent is looked up by the exact lead id, never through merged_into.
import type {Bindings} from '../auth.server';
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {clock} from './reminder-time';
import {timezone} from './deadlines';
import {reviewOf,requireProviderReview} from './providers';
import {leadCalendar,staff,counselRole,visibleLead} from './leads';
import {optOutSignature} from './followup-links';
import {consultationJson} from './consultations';
export const kinds=['consultation_reminder','unanswered_inquiry','engagement_chase'] as const;
export type Kind=typeof kinds[number];
const defaults:Record<Kind,{steps:Data[]}>={consultation_reminder:{steps:[{beforeMinutes:1440},{beforeMinutes:60}]},unanswered_inquiry:{steps:[{afterMinutes:1440},{afterMinutes:4320}]},engagement_chase:{steps:[{afterMinutes:2880},{afterMinutes:10080}]}};
const stepKey=(kind:Kind)=>kind==='consultation_reminder'?'beforeMinutes':'afterMinutes';
function steps(kind:Kind,value:unknown){
 insist(Array.isArray(value)&&value.length>=1&&value.length<=5,'Use one to five steps');
 const key=stepKey(kind),minutes=value.map(s=>{insist(s&&typeof s==='object'&&Object.keys(s).length===1&&Object.hasOwn(s,key),`Each step sets ${key}`);return integer(s[key],'Step minutes',15,43200);});
 insist(minutes.every((m,i)=>i===0||(key==='beforeMinutes'?m<minutes[i-1]:m>minutes[i-1])),key==='beforeMinutes'?'Order reminders from the earliest to the latest':'Order follow-ups from the first to the last');
 return minutes.map(m=>({[key]:m}));
}
export async function followupSettings(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner','lawyer');
 const saved=await rows(db,'SELECT * FROM s_followup_settings');
 const authority=await reviewOf(db,'mail');
 return {authority,settings:kinds.map(kind=>{const s=saved.find(x=>x.kind===kind);return {kind,enabled:Boolean(s?.enabled),channel:'email',steps:s?JSON.parse(s.steps):defaults[kind].steps,quietStart:s?.quiet_start??'20:00',quietEnd:s?.quiet_end??'08:00',timezone:s?.timezone??'America/New_York',maxContacts:s?.max_contacts??3,revision:s?.revision??null};})};
}
export async function saveFollowupSettings(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 const kind=body.kind as Kind;insist(kinds.includes(kind),'Choose a follow-up kind');
 insist(body.channel===undefined||body.channel==='email','Only email has a recorded sending authority; SMS and other channels are not available');
 insist(typeof body.enabled==='boolean','Choose whether the sequence is enabled');
 const previous=await stmt(db,'SELECT * FROM s_followup_settings WHERE kind=?',kind).first<Data>();
 if(previous)insist(body.revision===previous.revision,'The settings changed. Refresh before saving.',409);
 if(body.enabled)await requireProviderReview(db,'mail');
 const quietStart=clock(body.quietStart,'Quiet hours start'),quietEnd=clock(body.quietEnd,'Quiet hours end');insist(quietStart!==quietEnd,'Quiet hours need different start and end times');
 const value={steps:steps(kind,body.steps),zone:timezone(body.timezone),max:integer(body.maxContacts,'Contact limit',1,20)},revision=id(),at=now();
 await atomic(db,actor,[...(previous?[guard(db,'EXISTS(SELECT 1 FROM s_followup_settings WHERE kind=? AND revision=?)',kind,previous.revision)]:[]),
  stmt(db,'INSERT INTO s_followup_settings(kind,enabled,channel,steps,quiet_start,quiet_end,timezone,max_contacts,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET enabled=excluded.enabled,steps=excluded.steps,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone,max_contacts=excluded.max_contacts,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at',kind,body.enabled?1:0,'email',JSON.stringify(value.steps),quietStart,quietEnd,value.zone,value.max,revision,actor.email,at),
  audit(db,actor,'followup.configured',kind,JSON.stringify({enabled:body.enabled,steps:value.steps,quietStart,quietEnd,timezone:value.zone,maxContacts:value.max,authority:body.enabled?'Firm mail provider terms and direct billing reviewed':null}))]);
 return followupSettings(db,actor);
}
export async function recordConsent(db:D1Database,actor:Actor,leadId:string,body:Data) {
 const lead=await visibleLead(db,actor,leadId);
 insist(body.channel==='email','Only email consent can be recorded');insist(lead.email,'The lead has no email address');insist(lead.status==='open','Only an open lead can be contacted',409);
 const source=text(body.source,'How the prospect agreed',200),words=text(body.text,'What the prospect agreed to',1000),at=now();
 await atomic(db,actor,[guard(db,'NOT EXISTS(SELECT 1 FROM s_lead_consents WHERE lead_id=? AND channel=? AND revoked_at IS NULL)',lead.id,'email'),
  stmt(db,'INSERT INTO s_lead_consents(id,lead_id,channel,source,text,recorded_by,granted_at) VALUES(?,?,?,?,?,?,?)',id(),lead.id,'email',source,words,actor.email,at),
  stmt(db,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),lead.id,'consent_recorded',JSON.stringify({channel:'email',source,text:words}),actor.email,at),audit(db,actor,'lead.consent_recorded',lead.id,JSON.stringify({channel:'email',source}))]);
 return leadFollowups(db,actor,lead.id);
}
export async function sequenceStatements(env:Bindings,kind:Kind,lead:Data,anchorMs:number,context:Data,actorEmail:string,nowMs:number) {
 const setting=await stmt(env.DB,'SELECT * FROM s_followup_settings WHERE kind=? AND enabled=1',kind).first<Data>();
 insist(setting,'This follow-up sequence is not enabled. The principal enables it in follow-up settings.',409);
 await requireProviderReview(env.DB,'mail');
 insist(lead.email&&lead.status==='open','Only an open lead with an email address can be contacted',409);
 const followupId=id(),at=new Date(nowMs).toISOString(),plan=(JSON.parse(setting.steps) as Data[]).map((s,step)=>({step,due:kind==='consultation_reminder'?anchorMs-s.beforeMinutes*60000:anchorMs+s.afterMinutes*60000})).filter(s=>s.due>nowMs);
 insist(plan.length>0,'Every reminder time has already passed',409);
 return {followupId,statements:[
  guard(env.DB,"EXISTS(SELECT 1 FROM s_lead_consents WHERE lead_id=? AND channel='email' AND revoked_at IS NULL) AND EXISTS(SELECT 1 FROM s_leads WHERE id=? AND status='open') AND NOT EXISTS(SELECT 1 FROM s_followups WHERE lead_id=? AND kind=? AND status='active' AND (?<>'consultation_reminder'))",lead.id,lead.id,lead.id,kind,kind),
  stmt(env.DB,"INSERT INTO s_followups(id,lead_id,kind,status,anchor_at,context,created_by,created_at,human_owner) VALUES(?,?,?,'active',?,?,?,?,?)",followupId,lead.id,kind,new Date(anchorMs).toISOString(),JSON.stringify(context),actorEmail,at,lead.assigned_email),
  ...plan.map(s=>stmt(env.DB,"INSERT INTO s_followup_sends(id,followup_id,step,due_at,status) VALUES(?,?,?,?,'queued')",id(),followupId,s.step,new Date(s.due).toISOString())),
  stmt(env.DB,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),lead.id,'followup_scheduled',JSON.stringify({followupId,kind,sends:plan.length}),actorEmail,at)]};
}
export async function startFollowup(env:Bindings,actor:Actor,leadId:string,body:Data) {
 const lead=await visibleLead(env.DB,actor,leadId),kind=body.kind as Kind;
 insist(kind==='unanswered_inquiry'||kind==='engagement_chase','Start an unanswered-inquiry follow-up or an engagement chase');
 const plan=await sequenceStatements(env,kind,lead,Date.now(),{},actor.email,Date.now());
 await atomic(env.DB,actor,[...plan.statements,audit(env.DB,actor,'followup.started',plan.followupId,JSON.stringify({leadId:lead.id,kind}))]);
 return leadFollowups(env.DB,actor,lead.id);
}
// A reply, conflict stop or decline halts every active sequence for the lead and names the next human action.
export function stopStatements(db:D1Database,lead:Data,reason:string,nextAction:string,owner:string|null,actorEmail:string,at:string) {
 return [stmt(db,"UPDATE s_followup_sends SET status='cancelled',detail=? WHERE status='queued' AND followup_id IN(SELECT id FROM s_followups WHERE lead_id=? AND status='active')",'Sequence stopped: '+reason,lead.id),
  stmt(db,"UPDATE s_followups SET status='stopped',stop_reason=?,stopped_at=?,next_action=?,human_owner=? WHERE lead_id=? AND status='active'",reason,at,nextAction,owner,lead.id),
  stmt(db,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM s_followups WHERE lead_id=? AND stopped_at=?)',id(),lead.id,'followup_stopped',JSON.stringify({reason,nextAction,owner}),actorEmail,at,lead.id,at)];
}
const outcomes:Record<string,{reason:string;action:string;counsel:boolean}>={
 reply:{reason:'reply',action:'Respond to the prospect’s reply',counsel:false},
 conflict:{reason:'conflict',action:'Conflict stop: counsel reviews the lead before any further contact',counsel:true},
 declined:{reason:'declined',action:'Prospect declined: record the outcome and close the lead',counsel:false}};
async function owner(db:D1Database,lead:Data){return lead.assigned_email??(await stmt(db,"SELECT email FROM oa_operators WHERE role='owner' AND status='active' ORDER BY email LIMIT 1").first<Data>())?.email??null;}
export async function recordFollowupEvent(db:D1Database,actor:Actor,leadId:string,body:Data) {
 const lead=await visibleLead(db,actor,leadId),o=outcomes[String(body.kind)];insist(o,'Choose reply, conflict or declined');
 if(o.counsel)insist(counselRole(actor),'Only the principal or a lawyer records a conflict stop',403);
 const note=text(body.note,'What was received or decided',1000),at=now(),calendar=await leadCalendar(db),who=await owner(db,lead);
 await atomic(db,actor,[...stopStatements(db,lead,o.reason,o.action,who,actor.email,at),
  stmt(db,"UPDATE s_leads SET next_action=?,next_action_date=?,revision=?,last_activity_at=? WHERE id=? AND status='open'",o.action,calendar.today,id(),at,lead.id),
  stmt(db,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),lead.id,'followup_'+o.reason,JSON.stringify({note}),actor.email,at),audit(db,actor,'lead.followup_'+o.reason,lead.id,JSON.stringify({note}))]);
 return leadFollowups(db,actor,lead.id);
}
export async function optOut(env:Bindings,request:Request,followupId:string,signature:string) {
 insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Use the link from your message',403);
 insist(signature===await optOutSignature(env,followupId),'This link is not valid',404);
 const f=await stmt(env.DB,'SELECT * FROM s_followups WHERE id=?',followupId).first<Data>();insist(f,'This link is not valid',404);
 const lead=(await stmt(env.DB,'SELECT * FROM s_leads WHERE id=?',f.lead_id).first<Data>())!,at=now(),calendar=await leadCalendar(env.DB),who=await owner(env.DB,lead),action='Prospect opted out: no further automated contact; call or write only if they ask';
 await env.DB.batch([stmt(env.DB,"UPDATE s_lead_consents SET revoked_at=?,revoked_reason='Prospect opted out through a message link' WHERE lead_id=? AND revoked_at IS NULL",at,lead.id),...stopStatements(env.DB,lead,'opt_out',action,who,'prospect',at),
  stmt(env.DB,"UPDATE s_leads SET next_action=?,next_action_date=?,revision=?,last_activity_at=? WHERE id=? AND status='open'",action,calendar.today,id(),at,lead.id),
  stmt(env.DB,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),lead.id,'consent_revoked',JSON.stringify({channel:'email',reason:'Prospect opted out through a message link'}),'prospect',at),
  audit(env.DB,{id:'system:prospect',email:'prospect',role:'system',channel:'system'} as any,'lead.opt_out',lead.id,JSON.stringify({followupId}))]);
 return {optedOut:true};
}
export async function leadFollowups(db:D1Database,actor:Actor,leadId:string) {
 const lead=await visibleLead(db,actor,leadId);staff(actor);
 const [consents,followups,sends,consultations]=await Promise.all([rows(db,'SELECT * FROM s_lead_consents WHERE lead_id=? ORDER BY granted_at,id',lead.id),rows(db,'SELECT * FROM s_followups WHERE lead_id=? ORDER BY created_at,id',lead.id),rows(db,'SELECT s.* FROM s_followup_sends s JOIN s_followups f ON f.id=s.followup_id WHERE f.lead_id=? ORDER BY s.due_at,s.step',lead.id),rows(db,'SELECT c.*,l.name lead_name,o.title FROM s_consultations c JOIN s_leads l ON l.id=c.lead_id JOIN s_consult_offers o ON o.id=c.offer_id WHERE c.lead_id=? ORDER BY c.start_at',lead.id)]);
 return {consultations:consultations.map(consultationJson),consents:consents.map(c=>({id:c.id,channel:c.channel,source:c.source,text:c.text,recordedBy:c.recorded_by,grantedAt:c.granted_at,revokedAt:c.revoked_at,revokedReason:c.revoked_reason})),
  followups:followups.map(f=>({id:f.id,kind:f.kind,status:f.status,stopReason:f.stop_reason,stoppedAt:f.stopped_at,nextAction:f.next_action,humanOwner:f.human_owner,createdAt:f.created_at,sends:sends.filter(s=>s.followup_id===f.id).map(s=>({step:s.step,dueAt:s.due_at,status:s.status,detail:s.detail,provider:s.provider,attemptedAt:s.attempted_at}))}))};
}
