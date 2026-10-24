// INTAKE-003: the prospect's side. A booking claims its padded interval, creates one lead (assigned to the
// responsible lawyer) and, when the offer has an intake form, the same immutable intake record a form submission
// makes. The claim and every row commit in one batch, so a race for the last slot has exactly one winner.
import type {Bindings} from '../auth.server';
import {audit,digest,id,insist,now,rows,stmt,text,Fault,type Data} from './model';
import {guard} from './trust-guards';
import {timezone} from './deadlines';
import {activeIntakeAssigneeSql} from './intake-forms';
import {answerValues,ipDigest} from './intake-submissions';
import {busyOf,offerSlots,type Busy} from './consult-slots';
import {staffBusy} from './appointments';
import {leadCalendar} from './leads';
import {manageToken} from './followup-links';
import {sequenceStatements} from './followups';
import {cancelStatements} from './consultations';
import {reviewOf} from './providers';
const prospect={id:'prospect',email:'prospect',role:'system',channel:'system'};
const publicActor={id:'system:public-intake',email:'system:public-intake',role:'system',channel:'system'};
// Appointment series, attendees and changes are append-only. Fence their exact snapshot inside the booking batch.
const calendarVersion=`(SELECT COUNT(*) FROM s_appointments)||':'||(SELECT COUNT(*) FROM s_appointment_attendees)||':'||(SELECT COUNT(*) FROM s_appointment_changes)`;
const feeVersion='consultation-fee-v1',reminderVersion='consultation-email-v1';
const reminderWords='Email me reminders about this consultation. I can stop them at any time.';
const feeWords=(c:number)=>`I understand the consultation fee of ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)} is due at the consultation; nothing is collected here.`;
const overlap=`NOT EXISTS(SELECT 1 FROM s_consultations c WHERE c.lawyer_email=? AND c.status='booked' AND c.id<>? AND c.busy_start<? AND c.busy_end>?)`;
async function loadOffer(db:D1Database,offerId:string){
 const o=await stmt(db,'SELECT * FROM s_consult_offers WHERE id=? AND published=1',text(offerId,'Offer',100)).first<Data>();insist(o,'This booking page is not available',404);return o;
}
async function busyFor(db:D1Database,offer:Data,exclude:string,atMs:number){
 const horizon=atMs+(offer.horizon_days+1)*86400000,booked=await rows(db,"SELECT busy_start,busy_end FROM s_consultations WHERE lawyer_email=? AND status='booked' AND id<>? AND busy_end>?",offer.lawyer_email,exclude,new Date(atMs).toISOString());
 return [...booked.map(b=>({start:Date.parse(b.busy_start),end:Date.parse(b.busy_end)})),...await staffBusy(db,offer.lawyer_email,atMs,horizon)] as Busy[];
}
const local=(ms:number,zone:string)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(ms));
const day=(ms:number,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const view=(starts:number[],offer:Data,zone:string)=>starts.slice(0,300).map(s=>({start:new Date(s).toISOString(),end:new Date(s+offer.duration_minutes*60000).toISOString(),local:local(s,zone),date:day(s,zone)}));
export async function publicOffer(env:Bindings,offerId:string,zoneValue:unknown){
 const offer=await loadOffer(env.DB,offerId),zone=timezone(zoneValue??offer.timezone),at=Date.now();
 const form=offer.form_id?await stmt(env.DB,'SELECT snapshot FROM s_intake_forms WHERE id=? AND published=1',offer.form_id).first<Data>():null,snapshot=form?JSON.parse(form.snapshot):null;
 const firm=(await stmt(env.DB,'SELECT name FROM s_firm WHERE id=1').first<Data>())?.name??'';
 return {id:offer.id,title:offer.title,firmName:firm,durationMinutes:offer.duration_minutes,feeCents:offer.fee_cents,consentText:offer.consent_text,timezone:zone,offerTimezone:offer.timezone,questions:snapshot?.questions??[],slots:view(offerSlots(offer,at,await busyFor(env.DB,offer,'',at)),offer,zone)};
}
async function claim(env:Bindings,offer:Data,slot:unknown,exclude:string){
 insist(typeof slot==='string','Choose a time');const start=Date.parse(slot),at=Date.now();insist(Number.isFinite(start),'Choose a time');
 const calendar=(await stmt(env.DB,`SELECT ${calendarVersion} version`).first<Data>())!.version;
 insist(offerSlots(offer,at,await busyFor(env.DB,offer,exclude,at)).includes(start),'That time is no longer available. Choose another.',409);
 const busy=busyOf(offer,start,offer.duration_minutes);return {calendar,start,end:start+offer.duration_minutes*60000,busyStart:new Date(busy.start).toISOString(),busyEnd:new Date(busy.end).toISOString()};
}
export async function bookConsultation(env:Bindings,offerId:string,request:Request){
 insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Book from this site',403);
 let body:Data;try{body=await request.json();}catch{throw new Fault('Booking data must be valid JSON');}
 const offer=await loadOffer(env.DB,offerId),zone=timezone(body.timezone??offer.timezone);
 insist(body.website===''||body.website===undefined,'The booking did not pass spam checks');
 insist(body.consent===true,'Consent to review this inquiry is required');
 if(offer.fee_cents>0)insist(body.feeAcknowledged===true,'Acknowledge the consultation fee to book');
 const email=text(body.email,'Email',254).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Use a valid email address');
 const profile={name:text(body.name,'Name',200),email,phone:typeof body.phone==='string'?body.phone.trim().slice(0,40):'',summary:text(body.summary,'Inquiry summary',2000)};
 const form=offer.form_id?await stmt(env.DB,'SELECT * FROM s_intake_forms WHERE id=? AND published=1',offer.form_id).first<Data>():null;
 insist(!offer.form_id||form,'The linked intake form is not published',409);
 const answers=form?answerValues(JSON.parse(form.snapshot).questions,body.answers):[],slot=await claim(env,offer,body.slot,'');
 const at=now(),hour=at.slice(0,13),network=await ipDigest(env,offer.id,hour,request),rateExpires=new Date(new Date(hour+':00:00.000Z').getTime()+2*60*60*1000).toISOString();
 const leadId=id(),consultationId=id(),submissionId=id(),receipt=id(),token=await manageToken(env,consultationId),fee=offer.fee_cents,reminderConsent=body.reminderConsent===true;
 const lead={id:leadId,email,status:'open',assigned_email:offer.lawyer_email};
 const original={profile,answers,consent:{text:offer.consent_text,accepted:true,at},consultation:{offerId:offer.id,start:new Date(slot.start).toISOString(),timezone:zone},feeAcknowledgment:{accepted:fee>0,amountCents:fee,text:feeWords(fee),version:feeVersion,at},reminderConsent:{accepted:reminderConsent,channel:'email',text:reminderWords,version:reminderVersion,at}};
 let reminders:{followupId:string;statements:D1PreparedStatement[]}|null=null;
 if(reminderConsent&&await reviewOf(env.DB,'mail')&&await stmt(env.DB,"SELECT 1 FROM s_followup_settings WHERE kind='consultation_reminder' AND enabled=1").first()){
  try{reminders=await sequenceStatements(env,'consultation_reminder',lead,slot.start,{consultationId},'prospect',Date.now());}catch{reminders=null;}
 }
 try{
  await env.DB.batch([
   guard(env.DB,'EXISTS(SELECT 1 FROM s_consult_offers WHERE id=? AND revision=? AND published=1)',offer.id,offer.revision),
   guard(env.DB,activeIntakeAssigneeSql,offer.lawyer_email,offer.lawyer_email),
   guard(env.DB,`${calendarVersion}=?`,slot.calendar),
   guard(env.DB,overlap,offer.lawyer_email,'',slot.busyEnd,slot.busyStart),
   guard(env.DB,'COALESCE((SELECT accepted FROM s_consult_rate_limits WHERE hour=? AND ip_digest=?),0)<10',hour,network),
   stmt(env.DB,'INSERT INTO s_consult_rate_limits(ip_digest,hour,accepted,expires_at) VALUES(?,?,1,?) ON CONFLICT(ip_digest,hour) DO UPDATE SET accepted=accepted+1',network,hour,rateExpires),
   stmt(env.DB,"INSERT INTO s_leads(id,name,email,phone,summary,referral_source,assigned_email,next_action,next_action_date,status,revision,created_by,created_at,last_activity_at) VALUES(?,?,?,?,?,?,?,?,?,'open',?,?,?,?)",leadId,profile.name,email,profile.phone,profile.summary,`Consultation booking ${offer.id}`,offer.lawyer_email,'Prepare for the booked consultation',day(slot.start,offer.timezone),id(),publicActor.email,at,at),
   ...(form?[stmt(env.DB,'INSERT INTO s_intake_submissions(id,lead_id,form_id,form_version,receipt,submitted_at,original_data) VALUES(?,?,?,?,?,?,?)',submissionId,leadId,form.id,form.version,receipt,at,JSON.stringify(original))]:[]),
   stmt(env.DB,"INSERT INTO s_consultations(id,offer_id,lead_id,lawyer_email,start_at,end_at,busy_start,busy_end,status,prospect_timezone,manage_hash,fee_cents,fee_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'booked',?,?,?,?,?,?)",consultationId,offer.id,leadId,offer.lawyer_email,new Date(slot.start).toISOString(),new Date(slot.end).toISOString(),slot.busyStart,slot.busyEnd,zone,await digest(token),fee,fee>0?'due_at_consultation':'none',at,at),
   ...(reminderConsent?[stmt(env.DB,'INSERT INTO s_lead_consents(id,lead_id,channel,source,text,recorded_by,granted_at) VALUES(?,?,?,?,?,?,?)',id(),leadId,'email','Consultation booking form',reminderWords,prospect.email,at)]:[]),
   ...(reminders?.statements??[]),
   stmt(env.DB,'INSERT INTO s_consult_events(id,consultation_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),consultationId,'booked',JSON.stringify({start:new Date(slot.start).toISOString(),timezone:zone,feeCents:fee,feeAcknowledgment:original.feeAcknowledgment,reminderConsent,reminderConsentRecord:original.reminderConsent,reminders:Boolean(reminders)}),prospect.email,at),
   stmt(env.DB,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),leadId,'consultation_booked',JSON.stringify({consultationId,offerId:offer.id,start:new Date(slot.start).toISOString(),lawyer:offer.lawyer_email,feeCents:fee,intakeSubmissionId:form?submissionId:null}),publicActor.email,at),
   audit(env.DB,publicActor as any,'consultation.booked',consultationId,JSON.stringify({leadId,offerId:offer.id,start:new Date(slot.start).toISOString(),original}))]);
 }catch(error){
  if(/constraint|s_guard|UNIQUE/i.test(String(error)))throw new Fault('That time was just taken, or this booking page changed. Choose another time.',409);
  throw error;
 }
 return {consultationId,manageToken:token,start:new Date(slot.start).toISOString(),local:local(slot.start,zone),feeCents:fee,feeStatus:fee>0?'due_at_consultation':'none',reminders:Boolean(reminders),receipt:form?receipt:null};
}
async function byToken(env:Bindings,token:string){
 const db=env.DB;
 const c=await stmt(db,'SELECT c.*,o.title,o.duration_minutes,o.timezone offer_timezone FROM s_consultations c JOIN s_consult_offers o ON o.id=c.offer_id WHERE c.manage_hash=?',await digest(token)).first<Data>();insist(c&&token===await manageToken(env,c.id)&&Date.parse(c.start_at)>Date.now()&&Date.parse(c.created_at)+91*86400000>Date.now(),'This link is not valid or has expired',404);return c;
}
export async function manageView(env:Bindings,token:string,zoneValue:unknown){
 const c=await byToken(env,token),zone=timezone(zoneValue??c.prospect_timezone),offer=(await stmt(env.DB,'SELECT * FROM s_consult_offers WHERE id=?',c.offer_id).first<Data>())!,at=Date.now();
 const open=c.status==='booked'&&Date.parse(c.start_at)>at&&offer.published;
 return {expiresAt:new Date(Math.min(Date.parse(c.start_at),Date.parse(c.created_at)+91*86400000)).toISOString(),id:c.id,title:c.title,status:c.status,start:c.start_at,end:c.end_at,local:local(Date.parse(c.start_at),zone),timezone:zone,feeCents:c.fee_cents,feeStatus:c.fee_status,slots:open?view(offerSlots(offer,at,await busyFor(env.DB,offer,c.id,at)),offer,zone):[]};
}
export async function rescheduleConsultation(env:Bindings,token:string,request:Request){
 insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Use the link from your message',403);
 let body:Data;try{body=await request.json();}catch{throw new Fault('Data must be valid JSON');}
 const c=await byToken(env,token);insist(c.status==='booked'&&Date.parse(c.start_at)>Date.now(),'This consultation can no longer be changed',409);
 const offer=await loadOffer(env.DB,c.offer_id),zone=timezone(body.timezone??c.prospect_timezone),slot=await claim(env,offer,body.slot,c.id),at=now();
 const lead=(await stmt(env.DB,'SELECT * FROM s_leads WHERE id=?',c.lead_id).first<Data>())!,consented=await stmt(env.DB,"SELECT 1 FROM s_lead_consents WHERE lead_id=? AND channel='email' AND revoked_at IS NULL",c.lead_id).first();
 let reminders:{statements:D1PreparedStatement[]}|null=null;
 if(consented&&lead.status==='open'&&await stmt(env.DB,"SELECT 1 FROM s_followup_settings WHERE kind='consultation_reminder' AND enabled=1").first()){try{reminders=await sequenceStatements(env,'consultation_reminder',lead,slot.start,{consultationId:c.id},'prospect',Date.now());}catch{reminders=null;}}
 try{
  await env.DB.batch([
   guard(env.DB,"EXISTS(SELECT 1 FROM s_consultations WHERE id=? AND status='booked' AND start_at=?)",c.id,c.start_at),
   guard(env.DB,`${calendarVersion}=?`,slot.calendar),
   guard(env.DB,overlap,c.lawyer_email,c.id,slot.busyEnd,slot.busyStart),
   stmt(env.DB,"UPDATE s_followup_sends SET status='cancelled',detail='Consultation rescheduled' WHERE status='queued' AND followup_id IN(SELECT id FROM s_followups WHERE status='active' AND kind='consultation_reminder' AND json_extract(context,'$.consultationId')=?)",c.id),
   stmt(env.DB,"UPDATE s_followups SET status='stopped',stop_reason='rescheduled',stopped_at=? WHERE status='active' AND kind='consultation_reminder' AND json_extract(context,'$.consultationId')=?",at,c.id),
   stmt(env.DB,'UPDATE s_consultations SET start_at=?,end_at=?,busy_start=?,busy_end=?,prospect_timezone=?,updated_at=? WHERE id=?',new Date(slot.start).toISOString(),new Date(slot.end).toISOString(),slot.busyStart,slot.busyEnd,zone,at,c.id),
   ...(reminders?.statements??[]),
   stmt(env.DB,'INSERT INTO s_consult_events(id,consultation_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),c.id,'rescheduled',JSON.stringify({from:c.start_at,to:new Date(slot.start).toISOString(),timezone:zone}),prospect.email,at),
   stmt(env.DB,"UPDATE s_leads SET next_action='Prepare for the rescheduled consultation',next_action_date=?,revision=?,last_activity_at=? WHERE id=? AND status='open'",day(slot.start,offer.timezone),id(),at,c.lead_id),
   stmt(env.DB,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),c.lead_id,'consultation_rescheduled',JSON.stringify({consultationId:c.id,from:c.start_at,to:new Date(slot.start).toISOString()}),prospect.email,at),
   audit(env.DB,prospect as any,'consultation.rescheduled',c.id,JSON.stringify({leadId:c.lead_id,from:c.start_at,to:new Date(slot.start).toISOString()}))]);
 }catch(error){if(/constraint|s_guard|UNIQUE/i.test(String(error)))throw new Fault('That time was just taken. Choose another time.',409);throw error;}
 return manageView(env,token,zone);
}
export async function cancelByProspect(env:Bindings,token:string,request:Request){
 insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Use the link from your message',403);
 const c=await byToken(env,token);insist(c.status==='booked','This consultation is already cancelled',409);
 await env.DB.batch(cancelStatements(env.DB,c,'Cancelled by the prospect',prospect,now(),(await leadCalendar(env.DB)).today));
 return manageView(env,token,c.prospect_timezone);
}
