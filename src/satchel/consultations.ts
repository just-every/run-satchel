// INTAKE-003: staff doors for approved availability and the consultation record. The principal or the lawyer who
// takes the consultations approves the windows; a published offer is the only availability a prospect can book.
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {timezone} from './deadlines';
import {activeIntakeAssigneeSql} from './intake-forms';
import {windows} from './consult-slots';
import {leadCalendar} from './leads';
export const offerJson=(o:Data)=>({id:o.id,title:o.title,lawyerEmail:o.lawyer_email,timezone:o.timezone,durationMinutes:o.duration_minutes,bufferBefore:o.buffer_before,bufferAfter:o.buffer_after,windows:JSON.parse(o.windows),noticeHours:o.notice_hours,horizonDays:o.horizon_days,feeCents:o.fee_cents,formId:o.form_id,consentText:o.consent_text,published:Boolean(o.published),revision:o.revision,updatedAt:o.updated_at});
export async function listOffers(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner','lawyer');
 return {offers:(await rows(db,"SELECT * FROM s_consult_offers WHERE ?='owner' OR lawyer_email=? ORDER BY updated_at DESC,id",actor.role,actor.email)).map(offerJson)};
}
export async function saveOffer(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner','lawyer');
 const previous=body.id?await stmt(db,'SELECT * FROM s_consult_offers WHERE id=?',text(body.id,'Offer',100)).first<Data>():null;
 insist(!body.id||previous,'Offer not found',404);
 if(previous){insist(body.revision===previous.revision,'The offer changed. Refresh before saving.',409);insist(actor.role==='owner'||previous.lawyer_email===actor.email,'Only the principal or its lawyer edits this offer',403);}
 const lawyer=(actor.role==='owner'?text(body.lawyerEmail,'Responsible lawyer',254):actor.email).toLowerCase();
 insist(await stmt(db,"SELECT 1 WHERE EXISTS(SELECT 1 FROM s_members WHERE email=? AND active=1 AND role='lawyer') OR EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active')",lawyer,lawyer).first(),'Choose an active lawyer or the principal');
 insist(typeof body.published==='boolean','Choose whether the availability is published');
 let formId:string|null=null;
 if(body.formId){formId=text(body.formId,'Intake form',100);insist(await stmt(db,'SELECT 1 FROM s_intake_forms WHERE id=?',formId).first(),'Intake form not found',404);}
 const value={title:text(body.title,'Offer title',160),zone:timezone(body.timezone),duration:integer(body.durationMinutes,'Duration',10,240),before:integer(body.bufferBefore??0,'Buffer before',0,120),after:integer(body.bufferAfter??0,'Buffer after',0,120),windows:windows(body.windows),notice:integer(body.noticeHours??24,'Minimum notice',0,720),horizon:integer(body.horizonDays??30,'Booking horizon',1,90),fee:integer(body.feeCents??0,'Consultation fee',0,10000000),consent:text(body.consentText,'Review consent',2000)};
 const offerId=previous?.id??id(),revision=id(),at=now();
 await atomic(db,actor,[...(previous?[guard(db,'EXISTS(SELECT 1 FROM s_consult_offers WHERE id=? AND revision=?)',offerId,previous.revision)]:[]),guard(db,`EXISTS(SELECT 1 FROM s_members WHERE email=? AND active=1 AND role='lawyer') OR EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active')`,lawyer,lawyer),
  stmt(db,'INSERT INTO s_consult_offers(id,title,lawyer_email,timezone,duration_minutes,buffer_before,buffer_after,windows,notice_hours,horizon_days,fee_cents,form_id,consent_text,published,revision,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,lawyer_email=excluded.lawyer_email,timezone=excluded.timezone,duration_minutes=excluded.duration_minutes,buffer_before=excluded.buffer_before,buffer_after=excluded.buffer_after,windows=excluded.windows,notice_hours=excluded.notice_hours,horizon_days=excluded.horizon_days,fee_cents=excluded.fee_cents,form_id=excluded.form_id,consent_text=excluded.consent_text,published=excluded.published,revision=excluded.revision,updated_at=excluded.updated_at',offerId,value.title,lawyer,value.zone,value.duration,value.before,value.after,JSON.stringify(value.windows),value.notice,value.horizon,value.fee,formId,value.consent,body.published?1:0,revision,previous?.created_by??actor.email,previous?.created_at??at,at),
  audit(db,actor,'consultation.offer_saved',offerId,JSON.stringify({...value,lawyer,published:body.published,previousRevision:previous?.revision??null}))]);
 return offerJson((await stmt(db,'SELECT * FROM s_consult_offers WHERE id=?',offerId).first<Data>())!);
}
export const consultationJson=(c:Data)=>({id:c.id,offerId:c.offer_id,leadId:c.lead_id,leadName:c.lead_name,lawyerEmail:c.lawyer_email,start:c.start_at,end:c.end_at,status:c.status,prospectTimezone:c.prospect_timezone,feeCents:c.fee_cents,feeStatus:c.fee_status,title:c.title});
// The responsible lawyer sees their consultations, the principal all, an assistant those on leads assigned to them.
export async function listConsultations(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner','lawyer','assistant');
 const list=await rows(db,"SELECT c.*,l.name lead_name,o.title,l.assigned_email FROM s_consultations c JOIN s_leads l ON l.id=c.lead_id JOIN s_consult_offers o ON o.id=c.offer_id WHERE c.end_at>? AND (?='owner' OR c.lawyer_email=? OR l.assigned_email=?) ORDER BY c.start_at,c.id",now(),actor.role,actor.email,actor.email);
 const events=list.length?await rows(db,`SELECT * FROM s_consult_events WHERE consultation_id IN (${list.map(()=>'?').join(',')}) ORDER BY at,id`,...list.map(c=>c.id)):[];
 return {consultations:list.map(c=>({...consultationJson(c),history:events.filter(e=>e.consultation_id===c.id).map(e=>({kind:e.kind,detail:JSON.parse(e.detail),actor:e.actor,at:e.at}))}))};
}
// Cancelling stops the consultation's reminders and leaves a human next action on the lead.
export function cancelStatements(db:D1Database,c:Data,reason:string,actor:Data,at:string,today:string) {
 const action='Consultation cancelled: follow up with the prospect';
 return [stmt(db,"UPDATE s_consultations SET status='cancelled',updated_at=? WHERE id=? AND status='booked'",at,c.id),
  stmt(db,'INSERT INTO s_consult_events(id,consultation_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),c.id,'cancelled',JSON.stringify({reason,start:c.start_at}),actor.email,at),
  stmt(db,"UPDATE s_followup_sends SET status='cancelled',detail='Consultation cancelled' WHERE status='queued' AND followup_id IN(SELECT id FROM s_followups WHERE status='active' AND kind='consultation_reminder' AND json_extract(context,'$.consultationId')=?)",c.id),
  stmt(db,"UPDATE s_followups SET status='stopped',stop_reason='consultation_cancelled',stopped_at=? WHERE status='active' AND kind='consultation_reminder' AND json_extract(context,'$.consultationId')=?",at,c.id),
  stmt(db,"UPDATE s_leads SET next_action=?,next_action_date=?,revision=?,last_activity_at=? WHERE id=? AND status='open'",action,today,id(),at,c.lead_id),
  stmt(db,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),c.lead_id,'consultation_cancelled',JSON.stringify({consultationId:c.id,reason}),actor.email,at),
  audit(db,actor as any,'consultation.cancelled',c.id,JSON.stringify({reason,leadId:c.lead_id}))];
}
export async function cancelConsultation(db:D1Database,actor:Actor,consultationId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');
 const c=await stmt(db,"SELECT * FROM s_consultations WHERE id=? AND status='booked' AND (?='owner' OR lawyer_email=?)",consultationId,actor.role,actor.email).first<Data>();insist(c,'Consultation not found',404);
 await atomic(db,actor,cancelStatements(db,c,text(body.reason,'Reason',1000),actor,now(),(await leadCalendar(db)).today));
 return {id:c.id,status:'cancelled'};
}
