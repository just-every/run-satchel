import {serializeSendGridMessage} from '../modules/mail/src/sendgrid-email/index.mjs';
import {collectionSendGuards} from './collection-state';
import {matterUpdateSendGuards} from './matter-update-delivery';
import {reminderSendGuards} from './client-reminders';
import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {contactData,contactRevisionGuard} from './contact-data';
import {contactGraph} from './contact-graph';
import {portalAccess,readerKinds,portalKinds} from './portal';
import {requireProviderReview} from './providers';

function counsel(actor:Actor){human(actor);need(actor,'owner','lawyer');}
const nextAction=(status:string)=>status==='ready'?'Send this exact reviewed message':status==='delivered'?'Delivery reported by the provider; no resend needed':status==='accepted'?'Await provider delivery outcome; acceptance is not delivery':status==='development'?'Development output only; configure the firm provider':status==='bounced'||status==='complained'?'Contact the recipient through an authorized channel; review consent before any new decision':'Check the provider before deciding whether to resend. No automatic resend.';
export async function eligible(db:D1Database,actor:Actor,m:Data){
 counsel(actor);await matter(db,actor,m.matter_id);await requireProviderReview(db,'mail');
 const data=await contactData(db),graph=contactGraph(data),contacts=graph.contacts.filter(c=>c.emails.some(e=>e.toLowerCase()===m.recipient));
 insist(contacts.length===1&&contacts[0].effectiveConsent.email==='allowed','Record explicit email consent for every merged identity; a merge supplies no consent',409);
 const contact=contacts[0];
 insist(contact.matterRoles.some(r=>r.matter_id===m.matter_id&&r.role==='client'),'Choose a client contact on this matter',409);
 insist((await stmt(db,`SELECT ${portalAccess('?',m.bill_id?portalKinds:readerKinds)} ok`,m.recipient,m.matter_id).first<Data>())?.ok,'Recipient access was withdrawn or is not authorized for this message',409);
 if(m.bill_id)insist(await stmt(db,"SELECT 1 FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE i.bill_id=? AND b.matter_id=? AND b.status<>'void' AND i.pdf_digest=?",m.bill_id,m.matter_id,m.bill_digest).first(),'Select an existing issued invoice that has not been voided',409);
 return data.revision;
}
export function fences(db:D1Database,actor:Actor,m:Data,revision:number){return [accessGuard(db,actor,m.matter_id),...contactRevisionGuard(db,revision),guard(db,portalAccess('?',m.bill_id?portalKinds:readerKinds),m.recipient,m.matter_id),...(m.bill_id?[guard(db,"EXISTS(SELECT 1 FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.id=? AND b.status<>'void' AND i.pdf_digest=?)",m.bill_id,m.bill_digest)]:[])];}
export async function correspondenceState(db:D1Database,actor:Actor,matterId:string){
 counsel(actor);await matter(db,actor,matterId);
 const messages=await rows(db,'SELECT * FROM s_correspondence WHERE matter_id=? ORDER BY reviewed_at,id',matterId);
 for(const m of messages){m.attempts=await rows(db,'SELECT * FROM s_correspondence_attempts WHERE correspondence_id=? ORDER BY decision_at,id',m.id);for(const a of m.attempts){a.events=await rows(db,'SELECT * FROM s_correspondence_events WHERE attempt_id=? ORDER BY observed_at,id',a.id);const outcomes=a.events.map((e:Data)=>e.status);a.outcome=outcomes.includes('complained')?'complained':outcomes.includes('bounced')?'bounced':outcomes.includes('delivered')?'delivered':a.events.at(-1)?.status??(a.status==='sending'?'uncertain':a.status);a.nextAction=nextAction(a.outcome);}}
 const invoices=await rows(db,"SELECT i.bill_id id,i.number FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE b.matter_id=? AND b.status<>'void' ORDER BY i.issued_at",matterId);
 return {messages,invoices};
}
export async function reviewCorrespondence(db:D1Database,actor:Actor,matterId:string,b:Data){
 counsel(actor);await matter(db,actor,matterId);
 const billId=b.billId?text(b.billId,'Issued invoice',100):null;
 const issue=billId?await stmt(db,'SELECT * FROM s_invoice_issues WHERE bill_id=?',billId).first<Data>():null;
 insist(!billId||issue,'Select an issued invoice',409);
 const m:Data={id:id(),matter_id:matterId,recipient:text(b.recipient,'Recipient',254).toLowerCase(),bill_id:billId,bill_digest:issue?.pdf_digest??null};
 insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.recipient),'Use a valid recipient');
 // Invoice notifications never carry an invoice, amount, client name or matter facts outside the portal.
 m.subject=billId?'An invoice is available':text(b.subject,'Subject',200);
 m.body=billId?'An invoice is available. Sign in to the secure portal to review it.':text(b.body,'Reviewed letter',20000);
 insist(!/[\r\n]/.test(m.subject),'Use a single-line subject');
 const revision=await eligible(db,actor,m),at=now(),note=text(b.reviewNote,'Review and sending authority',2000),attempt=id();
 await atomic(db,actor,[...fences(db,actor,m,revision),stmt(db,'INSERT INTO s_correspondence VALUES(?,?,?,?,?,?,?,?,?,?,?)',m.id,matterId,m.recipient,m.subject,m.body,billId,m.bill_digest,revision,actor.email,at,note),stmt(db,'INSERT INTO s_correspondence_attempts(id,correspondence_id,decision_by,decision_at,decision_note,contact_revision) VALUES(?,?,?,?,?,?)',attempt,m.id,actor.email,at,note,revision),audit(db,actor,'correspondence.reviewed',m.id,JSON.stringify({recipient:m.recipient,billId,attempt}),{matterId})]);
 return {id:m.id,attemptId:attempt};
}
async function load(db:D1Database,actor:Actor,attemptId:string){counsel(actor);const a=await stmt(db,'SELECT a.*,m.matter_id,m.recipient,m.subject,m.body,m.bill_id,m.bill_digest,COALESCE((SELECT template_id FROM s_client_reminder_jobs WHERE correspondence_id=m.id),(SELECT collection_id FROM s_collection_attempts WHERE correspondence_id=m.id)) template_version FROM s_correspondence_attempts a JOIN s_correspondence m ON m.id=a.correspondence_id WHERE a.id=?',attemptId).first<Data>();insist(a,'Mail attempt not found',404);await matter(db,actor,a.matter_id);return a;}
export async function sendCorrespondence(env:Bindings,actor:Actor,attemptId:string,atMs=Date.now()){
 const db=env.DB,a=await load(db,actor,attemptId);
 if(a.status!=='ready')return correspondenceState(db,actor,a.matter_id);
 const revision=await eligible(db,actor,a);insist(revision===a.contact_revision,'Contact authority changed; make a fresh review decision',409);
 const mail=operatorMail(env);insist(mail&&env.MAIL_FROM,'Configure the firm mail provider and sender; nothing was sent',409);
 const at=new Date(atMs).toISOString(),reminderGuards=await reminderSendGuards(db,actor,a,atMs),updateGuards=await matterUpdateSendGuards(db,actor,a,atMs);
 await atomic(db,actor,[...fences(db,actor,a,revision),...reminderGuards,...updateGuards,...await collectionSendGuards(db,actor,a,atMs),guard(db,"EXISTS(SELECT 1 FROM s_correspondence_attempts WHERE id=? AND status='ready')",a.id),stmt(db,"UPDATE s_correspondence_attempts SET status='sending',provider=?,attempted_at=? WHERE id=?",env.MAIL_PROVIDER??'unconfigured',at,a.id),audit(db,actor,'correspondence.send_started',a.id,JSON.stringify({decision:'One durable attempt claimed before contacting the provider',templateVersion:a.template_version??null}),{matterId:a.matter_id})]);
 let status='uncertain',provider=env.MAIL_PROVIDER??'unconfigured',providerId:string|null=null,detail='Provider acknowledgment was lost. No automatic resend.';
 try{const message={deliveryId:a.id,from:env.MAIL_FROM,to:[a.recipient],subject:a.subject,text:a.body+(a.bill_id||a.template_version?' '+env.AUTH_ORIGIN+'/app':''),html:'',headers:{}};
 if(env.MAIL_PROVIDER==='sendgrid'&&(env as Bindings&{SENDGRID_SANDBOX?:string}).SENDGRID_SANDBOX==='1'){
 const wire=JSON.parse(serializeSendGridMessage(message));wire.mail_settings={sandbox_mode:{enable:true}};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(wire),redirect:'manual',signal:AbortSignal.timeout(15000)});
 status=response.status===200?'development':response.status>=400&&response.status<500?'failed':'uncertain';detail=response.status===200?'SendGrid sandbox validated; no email was sent.':'Sandbox validation refused or uncertain; no mailbox delivery.';
 if(response.status===200)await stmt(db,'INSERT INTO s_correspondence_events VALUES(?,?,?,?,?)',id(),a.id,'sandbox_validated',actor.email,now()).run();
 }else{const r=await mail.send(message);provider=r.provider;providerId=r.providerMessageId??null;status=r.status==='accepted'?'accepted':r.status==='development'?'development':r.status==='uncertain'?'uncertain':'failed';detail=status==='accepted'?'Provider accepted; mailbox delivery is unconfirmed.':status==='uncertain'?'Provider acknowledgment is uncertain. No automatic resend.':status==='development'?'Development output only; no provider delivery.':'Provider refused this attempt. Review before any new decision.';}}catch{}
 await db.batch([stmt(db,"UPDATE s_correspondence_attempts SET status=?,provider=?,provider_id=?,detail=? WHERE id=? AND status='sending'",status,provider,providerId,detail,a.id),audit(db,actor,'correspondence.send_result',a.id,JSON.stringify({status,provider,providerId,templateVersion:a.template_version??null}),{matterId:a.matter_id})]);
 return correspondenceState(db,actor,a.matter_id);
}
export async function resendCorrespondence(db:D1Database,actor:Actor,attemptId:string,b:Data){
 const a=await load(db,actor,attemptId);insist(!await stmt(db,'SELECT 1 FROM s_collection_attempts WHERE correspondence_id=?',a.correspondence_id).first(),'Use the collection sequence decision; a sent step cannot repeat',409);insist(a.status!=='ready','Use the existing reviewed attempt',409);
 const updateGuards=await matterUpdateSendGuards(db,actor,a,Date.now());
 const revision=await eligible(db,actor,a),note=text(b.reason,'New decision after checking the provider',2000),attempt=id();
 await atomic(db,actor,[...fences(db,actor,a,revision),...updateGuards,guard(db,"NOT EXISTS(SELECT 1 FROM s_correspondence_attempts WHERE correspondence_id=? AND status='ready')",a.correspondence_id),stmt(db,'INSERT INTO s_correspondence_attempts(id,correspondence_id,decision_by,decision_at,decision_note,contact_revision) VALUES(?,?,?,?,?,?)',attempt,a.correspondence_id,actor.email,now(),note,revision),audit(db,actor,'correspondence.resend_reviewed',attempt,JSON.stringify({priorAttempt:a.id,reason:note}),{matterId:a.matter_id})]);
 return {id:a.correspondence_id,attemptId:attempt};
}
export async function reconcileCorrespondence(env:Bindings,actor:Actor,attemptId:string){
 const a=await load(env.DB,actor,attemptId);await requireProviderReview(env.DB,'mail');
 insist(a.provider==='resend'&&env.MAIL_PROVIDER==='resend'&&env.MAIL_API_KEY&&a.provider_id,'A retained Resend reference and matching configured provider are required; inspect other provider outcomes directly',409);
 let data:Data;try{const response=await fetch('https://api.resend.com/emails/'+encodeURIComponent(a.provider_id),{headers:{Authorization:'Bearer '+env.MAIL_API_KEY},redirect:'manual',signal:AbortSignal.timeout(15000)});insist(response.ok,'Provider outcome unavailable; no resend was attempted',502);const raw=await response.text();insist(raw.length<=100000,'Provider outcome too large',502);data=JSON.parse(raw);}catch{insist(false,'Provider outcome unavailable; no resend was attempted',502);}
 insist(data.id===a.provider_id&&Array.isArray(data.to)&&data.to.length===1&&data.to[0]===a.recipient,'Provider receipt does not match this attempt',409);
 const status=String(data.last_event);insist(['sent','delivered','delivery_delayed','bounced','complained','failed','suppressed'].includes(status),'Provider outcome is not recognized',409);
 const outcome=({sent:'accepted',delivery_delayed:'deferred',suppressed:'rejected'} as Data)[status]??status;
 await atomic(env.DB,actor,[accessGuard(env.DB,actor,a.matter_id),stmt(env.DB,'INSERT INTO s_correspondence_events VALUES(?,?,?,?,?)',id(),a.id,outcome,actor.email,now()),audit(env.DB,actor,'correspondence.provider_outcome',a.id,JSON.stringify({providerId:a.provider_id,status:outcome}),{matterId:a.matter_id})]);
 return correspondenceState(env.DB,actor,a.matter_id);
}
