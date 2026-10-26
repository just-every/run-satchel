import {updateContactCapGuard} from './matter-update-delivery';
import type {Bindings} from '../auth.server';
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {eligible,fences,sendCorrespondence} from './correspondence';
import {parseGrants} from './custom-roles';
import {gateGrants} from './role-areas';

// Exact approved versions deliberately carry no client, matter or appointment facts.
export const reminderContent={
 invoice:{subject:'An invoice is available',body:'An invoice is available. Sign in to the secure portal to review it.'},
 appointment:{subject:'An appointment reminder is available',body:'You have an appointment reminder. Sign in to the secure portal to contact counsel.'}
};
function counsel(actor:Actor){human(actor);need(actor,'owner','lawyer');}
const responsible=(db:D1Database,actor:Actor,matterId:string)=>guard(db,'EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?)',matterId,actor.email);
async function responsibleCounsel(db:D1Database,actor:Actor,matterId:string){
 counsel(actor);await matter(db,actor,matterId);
 insist(await stmt(db,'SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?',matterId,actor.email).first(),'Only the currently responsible counsel may authorize client reminders',403);
}
export async function clientReminderState(db:D1Database,actor:Actor,matterId:string){
 counsel(actor);await matter(db,actor,matterId);
 return {availableTemplates:reminderContent,templates:await rows(db,'SELECT * FROM s_client_reminder_templates ORDER BY approved_at,id'),authorizations:await rows(db,'SELECT * FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence',matterId),jobs:await rows(db,'SELECT j.*,a.status outcome,a.detail outcome_detail FROM s_client_reminder_jobs j LEFT JOIN s_correspondence_attempts a ON a.id=j.attempt_id WHERE j.matter_id=? ORDER BY j.due_at,j.id',matterId)};
}
export async function approveClientReminderTemplate(db:D1Database,actor:Actor,b:Data){
 counsel(actor);insist(b.kind==='invoice'||b.kind==='appointment','Choose invoice or appointment');
 const kind=b.kind as keyof typeof reminderContent,content=reminderContent[kind],version=id(),at=now(),reason=text(b.reason,'Template approval reason',2000);
 insist(b.confirmed===true,'Confirm approval of the exact plain-text template');
 await atomic(db,actor,[stmt(db,'INSERT INTO s_client_reminder_templates VALUES(?,?,?,?,?,?,?)',version,kind,content.subject,content.body,actor.email,at,reason),audit(db,actor,'client_reminder.template_approved',version,JSON.stringify({kind,version,...content,reason}))]);
 return {id:version,kind,...content};
}
export async function authorizeClientReminders(db:D1Database,actor:Actor,matterId:string,b:Data){
 await responsibleCounsel(db,actor,matterId);insist(typeof b.enabled==='boolean','Explicitly enable or withdraw reminder authority');
 const reason=text(b.reason,'Reminder authority decision',2000),max=integer(b.maxContacts,'Trailing seven-day recipient contact limit',1,7),version=id();
 const invoice=b.enabled?text(b.invoiceTemplate,'Invoice template version',100):null,appointment=b.enabled?text(b.appointmentTemplate,'Appointment template version',100):null;
 const templates=b.enabled?[guard(db,"EXISTS(SELECT 1 FROM s_client_reminder_templates WHERE id=? AND kind='invoice')",invoice),guard(db,"EXISTS(SELECT 1 FROM s_client_reminder_templates WHERE id=? AND kind='appointment')",appointment)]:[];
 await atomic(db,actor,[accessGuard(db,actor,matterId),responsible(db,actor,matterId),...templates,stmt(db,'INSERT INTO s_client_reminder_authorizations(id,matter_id,enabled,counsel_id,counsel_email,invoice_template,appointment_template,max_contacts,decided_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)',version,matterId,b.enabled?1:0,actor.id,actor.email,invoice,appointment,max,now(),reason),audit(db,actor,'client_reminder.authorized',version,JSON.stringify({enabled:b.enabled,invoiceTemplate:invoice,appointmentTemplate:appointment,maxContacts:max,reason}),{matterId})]);
 return {id:version};
}
async function source(db:D1Database,j:Data){
 if(j.bill_id){const issue=await stmt(db,"SELECT i.pdf_digest FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE b.id=? AND b.matter_id=? AND b.status<>'void'",j.bill_id,j.matter_id).first<Data>();insist(issue,'An active issued invoice is required',409);return issue.pdf_digest as string;}
 const appointment=await stmt(db,'SELECT * FROM s_appointments WHERE id=? AND matter_id=?',j.appointment_id,j.matter_id).first<Data>();insist(appointment,'Choose an appointment on this matter',409);
 const changes=await rows(db,'SELECT * FROM s_appointment_changes WHERE appointment_id=? ORDER BY id',appointment.id);
 insist(!changes.some(c=>c.kind==='cancelled'),'Cancelled appointments cannot remind',409);
 return JSON.stringify({appointment,changes});
}
export async function scheduleClientReminder(db:D1Database,actor:Actor,matterId:string,b:Data){
 await responsibleCounsel(db,actor,matterId);
 const authorization=await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1',matterId).first<Data>();
 insist(authorization?.enabled&&authorization.counsel_id===actor.id,'Responsible counsel must opt in for this matter',409);
 insist(Boolean(b.billId)!==Boolean(b.appointmentId),'Choose exactly one issued invoice or appointment');
 const recipient=text(b.recipient,'Recipient',254).toLowerCase(),billId=b.billId?text(b.billId,'Invoice',100):null,appointmentId=b.appointmentId?text(b.appointmentId,'Appointment',100):null;
 const dueAt=text(b.dueAt,'Scheduled instant',30);insist(Number.isFinite(Date.parse(dueAt))&&new Date(dueAt).toISOString()===dueAt,'Use an ISO UTC instant');
 const j:Data={id:id(),matter_id:matterId,recipient,bill_id:billId,appointment_id:appointmentId,authorization_id:authorization.id,template_id:billId?authorization.invoice_template:authorization.appointment_template};
 const revision=await source(db,j);j.bill_digest=billId?revision:null;const consentRevision=await eligible(db,actor,j);
 await atomic(db,actor,[...fences(db,actor,j,consentRevision),responsible(db,actor,matterId),guard(db,'(SELECT id FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1)=?',matterId,authorization.id),stmt(db,'INSERT INTO s_client_reminder_jobs(id,matter_id,authorization_id,template_id,recipient,bill_id,appointment_id,source_revision,due_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',j.id,matterId,authorization.id,j.template_id,recipient,billId,appointmentId,revision,dueAt,actor.email,now()),audit(db,actor,'client_reminder.scheduled',j.id,JSON.stringify({templateVersion:j.template_id,authorization:authorization.id,dueAt}),{matterId})]);
 return {id:j.id};
}
// Called by every attempt door, including an explicit human decision after uncertainty.
export async function reminderSendGuards(db:D1Database,actor:Actor,attempt:Data,atMs:number){
 const job=await stmt(db,'SELECT j.*,u.max_contacts,u.counsel_id FROM s_client_reminder_jobs j JOIN s_client_reminder_authorizations u ON u.id=j.authorization_id WHERE j.correspondence_id=?',attempt.correspondence_id).first<Data>();
 if(!job)return [];
 await responsibleCounsel(db,actor,job.matter_id);gateGrants(actor,'POST','/api/satchel/matters/'+job.matter_id+'/client-reminders');
 insist(job.counsel_id===actor.id&&await source(db,job)===job.source_revision,'Scheduled source or counsel changed; make a fresh reminder decision',409);
 return [...(job.appointment_id?[guard(db,'(SELECT COUNT(*) FROM s_appointment_changes WHERE appointment_id=?)=?',job.appointment_id,JSON.parse(job.source_revision).changes.length)]:[]),responsible(db,actor,job.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_client_reminder_authorizations WHERE id=? AND enabled=1 AND sequence=(SELECT MAX(sequence) FROM s_client_reminder_authorizations WHERE matter_id=?))',job.authorization_id,job.matter_id),updateContactCapGuard(db,job.recipient,job.max_contacts,atMs)];
}
export async function runClientReminders(env:Bindings,atMs:number){
 const db=env.DB,due=await rows(db,"SELECT * FROM s_client_reminder_jobs WHERE status IN ('queued','prepared') AND due_at<=? ORDER BY due_at,id LIMIT 100",new Date(atMs).toISOString());
 for(const j of due){
  try{
   const u=await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE id=?',j.authorization_id).first<Data>();
   const o=await stmt(db,'SELECT o.*,m.role member_role,m.active,r.permissions FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE o.id=?',u!.counsel_id).first<Data>();
   insist(o?.status==='active'&&(o.role==='owner'||o.active===1),'Counsel no longer active',409);
   const actor:Actor={id:o.id,email:o.email,name:o.display_name,role:o.role==='owner'?'owner':o.member_role,channel:'person',...(o.role!=='owner'&&o.permissions?{grants:parseGrants(o.permissions)}:{})};
   counsel(actor);gateGrants(actor,'POST','/api/satchel/matters/'+j.matter_id+'/client-reminders');
   if(j.status==='queued'){
    insist(await source(db,j)===j.source_revision,'Scheduled source changed; nothing sent',409);
    const template=await stmt(db,'SELECT * FROM s_client_reminder_templates WHERE id=?',j.template_id).first<Data>();
    const m:Data={...j,id:id(),bill_digest:j.bill_id?j.source_revision:null},revision=await eligible(db,actor,m),attempt=id();
    // Validate the same authority and cap used at the final send claim before preparation.
    const checks=[responsible(db,actor,j.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_client_reminder_authorizations WHERE id=? AND enabled=1 AND sequence=(SELECT MAX(sequence) FROM s_client_reminder_authorizations WHERE matter_id=?))',u!.id,j.matter_id)];
    await atomic(db,actor,[...fences(db,actor,m,revision),...checks,guard(db,"EXISTS(SELECT 1 FROM s_client_reminder_jobs WHERE id=? AND status='queued')",j.id),stmt(db,'INSERT INTO s_correspondence VALUES(?,?,?,?,?,?,?,?,?,?,?)',m.id,j.matter_id,j.recipient,template!.subject,template!.body,j.bill_id,m.bill_digest,revision,actor.email,now(),'Scheduled authority '+u!.id+'; approved template version '+template!.id),stmt(db,'INSERT INTO s_correspondence_attempts(id,correspondence_id,decision_by,decision_at,decision_note,contact_revision) VALUES(?,?,?,?,?,?)',attempt,m.id,actor.email,now(),'Approved template version '+template!.id,revision),stmt(db,"UPDATE s_client_reminder_jobs SET status='prepared',correspondence_id=?,attempt_id=? WHERE id=?",m.id,attempt,j.id),audit(db,actor,'client_reminder.prepared',j.id,JSON.stringify({templateVersion:template!.id,authorization:u!.id,attempt}),{matterId:j.matter_id})]);j.attempt_id=attempt;
   }
   await sendCorrespondence(env,actor,j.attempt_id,atMs);
  }catch(error){
   // Denials and rate caps never lead to an alternative outbound attempt.
   await stmt(db,"UPDATE s_client_reminder_jobs SET status='stopped',detail=? WHERE id=?",String(error instanceof Error?error.message:'Reminder stopped').slice(0,1000),j.id).run();
  }
 }
 return {processed:due.length};
}
