import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,type Actor,type Data} from './model';
import {matterGuard} from './documents';
import {portalAccess,readerKinds} from './portal';
import {guard} from './trust-guards';
import {isQuiet} from './reminder-time';
import {requireProviderReview} from './providers';
import {sequencePlan} from './followups';
const words='Email me reminders for this request until it is accepted, stopped or escalated. I can withdraw permission here at any time.';
const system={id:'request-reminders',email:'scheduler',role:'system',channel:'automation'} as any;
export async function requestReminderState(db:D1Database,requestId:string,email?:string){
 const where=email?' AND email=?':'',params=email?[requestId,email]:[requestId];
 return {consents:await rows(db,'SELECT email,wording,version,granted_at grantedAt,revoked_at revokedAt FROM s_request_consents WHERE request_id=?'+where,...params),sequences:await rows(db,'SELECT id,email,status,reason,approved_by approvedBy,approved_at approvedAt FROM s_request_reminders WHERE request_id=?'+where,...params)};
}
export function stopRequestReminders(db:D1Database,requestId:string,reason:string,at:string){
 return [stmt(db,"UPDATE s_request_reminder_sends SET status='cancelled',detail=? WHERE status='queued' AND reminder_id IN(SELECT id FROM s_request_reminders WHERE request_id=?)",reason,requestId),stmt(db,"UPDATE s_request_reminders SET status='stopped',reason=? WHERE request_id=? AND status='active'",reason,requestId)];
}
export async function consentRequest(db:D1Database,actor:Actor,requestId:string,body:Data){
 human(actor);need(actor,'client');insist(typeof body.consent==='boolean','Choose whether to allow email reminders');
 const q=await stmt(db,`SELECT q.* FROM s_document_requests q WHERE q.id=? AND q.status='open' AND q.client_visible=1 AND ${portalAccess('q.matter_id',readerKinds)}`,requestId,actor.email).first<Data>();insist(q,'Request not found',404);const at=now();
 await atomic(db,actor,[guard(db,portalAccess('?',readerKinds),actor.email,q.matter_id),stmt(db,'INSERT INTO s_request_consents(request_id,email,wording,version,granted_at,revoked_at) VALUES(?,?,?,?,?,?) ON CONFLICT(request_id,email) DO UPDATE SET wording=excluded.wording,version=excluded.version,granted_at=excluded.granted_at,revoked_at=excluded.revoked_at',q.id,actor.email,words,'request-email-v1',at,body.consent?null:at),...(!body.consent?stopRequestReminders(db,q.id,'consent withdrawn',at):[]),audit(db,actor,'document_request.reminder_consent',q.id,JSON.stringify({consent:body.consent,wording:words,version:'request-email-v1',at}),{matterId:q.matter_id})]);
 return requestReminderState(db,q.id,actor.email);
}
export async function approveRequestReminders(env:Bindings,actor:Actor,requestId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const db=env.DB,q=await stmt(db,'SELECT * FROM s_document_requests WHERE id=?',requestId).first<Data>();insist(q,'Request not found',404);await matter(db,actor,q.matter_id);
 if(body.stop===true){await atomic(db,actor,[...matterGuard(db,actor,q.matter_id),...stopRequestReminders(db,q.id,'counsel stopped',now()),audit(db,actor,'document_request.reminders_stopped',q.id,'{}',{matterId:q.matter_id})]);return requestReminderState(db,q.id);}
 insist(q.status==='open'&&q.client_visible,'Only an open shared request can be chased',409);insist(body.approved===true,'Counsel must approve this reminder sequence');
 const email=String(body.email??'').trim().toLowerCase();insist(await stmt(db,`SELECT 1 FROM s_request_consents WHERE request_id=? AND email=? AND revoked_at IS NULL AND ${portalAccess('?',readerKinds)}`,q.id,email,email,q.matter_id).first(),'The reader must opt in on this exact request',409);
 await requireProviderReview(db,'mail');const setting=await stmt(db,"SELECT * FROM s_followup_settings WHERE kind='engagement_chase' AND enabled=1").first<Data>();insist(setting,'The principal must enable the email chase settings',409);
 const at=now(),reminderId=id(),plan=sequencePlan('engagement_chase',JSON.parse(setting.steps),Date.now(),Date.now());
 await atomic(db,actor,[...matterGuard(db,actor,q.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_document_requests WHERE id=? AND status='open' AND client_visible=1) AND EXISTS(SELECT 1 FROM s_request_consents WHERE request_id=? AND email=? AND revoked_at IS NULL)",q.id,q.id,email),guard(db,portalAccess('?',readerKinds),email,q.matter_id),stmt(db,"INSERT INTO s_request_reminders(id,request_id,email,approved_by,approved_at,status) VALUES(?,?,?,?,?,'active')",reminderId,q.id,email,actor.email,at),...plan.map(s=>stmt(db,"INSERT INTO s_request_reminder_sends(id,reminder_id,step,due_at,status) VALUES(?,?,?,?,'queued')",id(),reminderId,s.step,new Date(s.due).toISOString())),audit(db,actor,'document_request.reminders_approved',q.id,JSON.stringify({email,settingRevision:setting.revision}),{matterId:q.matter_id})]);
 return requestReminderState(db,q.id);
}
const eligible=`EXISTS(SELECT 1 FROM s_request_reminders r JOIN s_document_requests q ON q.id=r.request_id JOIN s_request_consents c ON c.request_id=q.id AND c.email=r.email JOIN oa_operators o ON o.email=r.email WHERE r.id=s_request_reminder_sends.reminder_id AND r.status='active' AND q.status='open' AND q.client_visible=1 AND c.revoked_at IS NULL AND o.status='active' AND ${portalAccess('q.matter_id',readerKinds).replace('g.email=?','g.email=r.email')})`;
export async function runRequestReminders(env:Bindings,atMs:number){
 const db=env.DB,at=new Date(atMs).toISOString(),setting=await stmt(db,"SELECT * FROM s_followup_settings WHERE kind='engagement_chase'").first<Data>();
 // A crashed send is uncertain. It is never retried, and the sequence is escalated for its human owner.
 await db.batch([stmt(db,"UPDATE s_request_reminder_sends SET status='uncertain',detail='Worker outcome unknown; no automatic resend' WHERE status='sending' AND attempted_at<?",new Date(atMs-15*60000).toISOString()),stmt(db,"UPDATE s_request_reminders SET status='escalated',reason='Uncertain delivery; owner must review' WHERE status='active' AND id IN(SELECT reminder_id FROM s_request_reminder_sends WHERE status='uncertain')")]);
 const due=await rows(db,"SELECT s.*,r.request_id,r.email,r.approved_by,q.matter_id FROM s_request_reminder_sends s JOIN s_request_reminders r ON r.id=s.reminder_id JOIN s_document_requests q ON q.id=r.request_id WHERE s.status='queued' AND s.due_at<=? ORDER BY s.due_at,s.id LIMIT 100",at);
 for(const d of due){
  const stop=async(reason:string,escalate=false)=>{await db.batch([...stopRequestReminders(db,d.request_id,reason,at),...(escalate?[stmt(db,"UPDATE s_request_reminders SET status='escalated',reason=? WHERE id=?",reason,d.reminder_id)]:[]),audit(db,system,'document_request.reminders_halted',d.request_id,JSON.stringify({reason}),{matterId:d.matter_id})]);};
  if(!setting?.enabled){await stop('Email chase settings disabled');continue;}
  if(isQuiet(atMs,setting.timezone,setting.quiet_start,setting.quiet_end))continue;
  const approver=await stmt(db,"SELECT o.id,o.email,CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END role FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email AND m.active=1 WHERE o.email=? AND o.status='active'",d.approved_by).first<Data>();
  try{insist(approver&&['owner','lawyer'].includes(approver.role),'Counsel authority ended');await matter(db,{...approver,channel:'person'} as Actor,d.matter_id);await requireProviderReview(db,'mail');}catch{await stop('Current counsel or sending authority ended',true);continue;}
  const since=new Date(atMs-7*86400000).toISOString();
  const claimed=await stmt(db,`UPDATE s_request_reminder_sends SET status='sending',attempted_at=? WHERE id=? AND status='queued' AND ${eligible} AND ((SELECT COUNT(*) FROM s_request_reminder_sends x JOIN s_request_reminders r ON r.id=x.reminder_id WHERE r.email=? AND x.status IN('sending','sent','uncertain') AND x.attempted_at>?)+(SELECT COUNT(*) FROM s_followup_sends x JOIN s_followups f ON f.id=x.followup_id JOIN s_leads l ON l.id=f.lead_id WHERE l.email=? AND x.status IN('sending','sent','uncertain') AND x.attempted_at>?))<?`,at,d.id,d.email,since,d.email,since,setting.max_contacts).run();
  if(!claimed.meta.changes){await stop('Consent, request, reader access or contact limit changed',true);continue;}
  let status='uncertain',provider='unconfigured',providerId:string|null=null;
  try{const mail=operatorMail(env);insist(mail&&env.MAIL_FROM,'Mail unavailable');const result=await mail.send({deliveryId:d.id,from:env.MAIL_FROM,to:[d.email],subject:'A reminder from your firm',text:`Please sign in to review a request from your firm: ${env.AUTH_ORIGIN}/app\n\nYou can stop email reminders on the request in your portal.`,html:'',headers:{}});provider=result.provider;providerId=result.providerMessageId??null;status=result.status==='accepted'||result.status==='development'?'sent':result.status==='uncertain'?'uncertain':'failed';}catch{/* Retain uncertainty and escalate; never resend. */}
  await db.batch([stmt(db,'UPDATE s_request_reminder_sends SET status=?,provider=?,provider_id=?,detail=? WHERE id=?',status,provider,providerId,status==='sent'?'Provider accepted; delivery unconfirmed':'No automatic resend; owner review required',d.id),audit(db,system,'document_request.reminder_result',d.request_id,JSON.stringify({status,provider}),{matterId:d.matter_id})]);
  if(status!=='sent')await stop('Failed or uncertain delivery; owner must review',true);
  else if(!await stmt(db,"SELECT 1 FROM s_request_reminder_sends WHERE reminder_id=? AND status='queued'",d.reminder_id).first())await stop('Sequence exhausted; owner must review the outstanding request',true);
 }
}
