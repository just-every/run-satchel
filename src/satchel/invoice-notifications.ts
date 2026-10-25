import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {serializeSendGridMessage,sendSendGrid,SendGridSendError} from '../modules/mail/src/sendgrid-email/index.mjs';
import {atomic,audit,id,insist,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {deliveryAccess,deliveryFences,invoiceRecipient,invoiceStaff} from './invoice-delivery-access';
import {invoiceDeliveryState} from './invoice-delivery';
import {invoiceNotification} from './invoice-templates';
import {disclosureVersion} from './providers';

export type InvoiceDeliveryEnv=Bindings&{SENDGRID_EVENT_PUBLIC_KEY?:string;SENDGRID_SANDBOX?:string};
async function notificationEligibility(db:D1Database,actor:Actor,d:Data){
 const revision=await invoiceRecipient(db,actor,d,true);
 insist(!await stmt(db,"SELECT 1 FROM s_invoice_delivery_events e JOIN s_invoice_delivery_attempts a ON a.id=e.attempt_id JOIN s_invoice_deliveries d ON d.id=a.delivery_id WHERE d.recipient=? AND e.status IN('complained','unsubscribed')",d.recipient).first(),'The provider recorded an opt-out or complaint. Do not send another invoice notification.',409);
 return revision;
}
export async function authorizeInvoiceNotification(db:D1Database,actor:Actor,deliveryId:string,b:Data){
 invoiceStaff(actor,true);const d=await deliveryAccess(db,actor,deliveryId),revision=await notificationEligibility(db,actor,d);
 insist(b.confirmed===true,'Authorize one notification after checking the prior provider outcome');
 const prior=await stmt(db,'SELECT id,status FROM s_invoice_delivery_attempts WHERE delivery_id=? ORDER BY authorized_at DESC,id DESC LIMIT 1',deliveryId).first<Data>();
 if(prior)insist(b.priorAttemptId===prior.id,'Review the latest attempt before authorizing a new notification',409);
 const templateId=text(b.notificationTemplateId,'Counsel-approved notification version',100),reason=text(b.reason,'One-send authorization reason',2000),attemptId=id(),at=now();
 const template=await stmt(db,'SELECT * FROM s_invoice_notification_templates WHERE id=?',templateId).first<Data>();
 insist(template&&template.subject===invoiceNotification.subject&&template.body===invoiceNotification.body,'Choose counsel approval of the exact plain-text sign-in notification',409);
 await atomic(db,actor,[...deliveryFences(db,actor,d,revision),guard(db,'COALESCE((SELECT id FROM s_invoice_delivery_attempts WHERE delivery_id=? ORDER BY authorized_at DESC,id DESC LIMIT 1),\'\')=?',d.id,prior?.id??''),...(prior?.status==='ready'?[stmt(db,"UPDATE s_invoice_delivery_attempts SET status='withdrawn',detail='Replaced by a new audited authorization before provider submission' WHERE id=? AND status='ready'",prior.id)]:[]),stmt(db,'INSERT INTO s_invoice_delivery_attempts(id,delivery_id,notification_template_id,authorized_by,authorized_at,reason,contact_revision) VALUES(?,?,?,?,?,?,?)',attemptId,deliveryId,templateId,actor.email,at,reason,revision),audit(db,actor,prior?'invoice.resend_authorized':'invoice.notification_authorized',attemptId,JSON.stringify({deliveryId,priorAttemptId:prior?.id??null,notificationTemplateId:templateId,reason}),{matterId:d.matter_id})]);return {attemptId,deliveryId};
}
export async function sendInvoiceNotification(env:InvoiceDeliveryEnv,actor:Actor,attemptId:string){
 invoiceStaff(actor,true);const db=env.DB,a=await stmt(db,'SELECT a.*,t.subject,t.body FROM s_invoice_delivery_attempts a JOIN s_invoice_notification_templates t ON t.id=a.notification_template_id WHERE a.id=?',attemptId).first<Data>();insist(a,'Invoice notification attempt not found',404);
 const d=await deliveryAccess(db,actor,a.delivery_id);if(a.status!=='ready')return invoiceDeliveryState(db,actor,d.matter_id);
 const revision=await notificationEligibility(db,actor,d);insist(revision===a.contact_revision,'Contact or consent changed; authorize a new reviewed attempt',409);
 const mail=operatorMail(env);insist(mail&&env.MAIL_FROM,'Configure the firm mail provider and sender',409);
 const origin=new URL(env.AUTH_ORIGIN);insist(origin.protocol==='https:'||env.AUTH_LOCAL==='true','Configure the secure portal origin',409);
 const at=now();await atomic(db,actor,[...deliveryFences(db,actor,d,revision),guard(db,"EXISTS(SELECT 1 FROM s_provider_reviews WHERE provider_id='mail' AND disclosure_version=?)",disclosureVersion),guard(db,"NOT EXISTS(SELECT 1 FROM s_invoice_delivery_events e JOIN s_invoice_delivery_attempts a ON a.id=e.attempt_id JOIN s_invoice_deliveries d ON d.id=a.delivery_id WHERE d.recipient=? AND e.status IN('complained','unsubscribed'))",d.recipient),guard(db,"EXISTS(SELECT 1 FROM s_invoice_delivery_attempts WHERE id=? AND status='ready')",attemptId),stmt(db,"UPDATE s_invoice_delivery_attempts SET status='sending',provider=?,attempted_at=? WHERE id=?",env.MAIL_PROVIDER,at,attemptId),audit(db,actor,'invoice.notification_started',attemptId,JSON.stringify({deliveryId:d.id,notificationTemplate:a.notification_template_id}),{matterId:d.matter_id})]);
 let status='uncertain',providerId:string|null=null,detail='Provider acknowledgment is uncertain. New audited authorization is required; no automatic retry.';
 const message={deliveryId:attemptId,from:env.MAIL_FROM,to:[d.recipient],subject:a.subject,text:a.body+' '+origin.origin+'/app',headers:{}};
 try{
  if(env.MAIL_PROVIDER==='sendgrid'&&env.SENDGRID_SANDBOX==='1'){
   const wire=JSON.parse(serializeSendGridMessage(message));wire.mail_settings={sandbox_mode:{enable:true}};
   const r=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:'Bearer '+env.MAIL_API_KEY,'content-type':'application/json'},body:JSON.stringify(wire),redirect:'manual',signal:AbortSignal.timeout(15000)});
   status=r.status===200?'sandbox_validated':r.status>=400&&r.status<500?'failed':'uncertain';detail=status==='sandbox_validated'?'SendGrid validated the sandbox request. No email was sent and no delivery events will be generated.':'Sandbox validation was refused or uncertain; no mailbox delivery.';
  }else if(env.MAIL_PROVIDER==='sendgrid'){
   const r=await sendSendGrid({apiKey:env.MAIL_API_KEY??'',message});providerId=r.providerMessageId;status='accepted';detail='Provider accepted the notification. Mailbox delivery is unconfirmed.';
  }else{
   const r=await mail.send({...message,html:''});providerId=r.providerMessageId??null;status=['accepted','development','uncertain'].includes(r.status)?r.status:'failed';detail=status==='accepted'?'Provider accepted the notification. Mailbox delivery is unconfirmed.':status==='development'?'Development output only. No provider delivery.':status==='failed'?'Provider refused the notification. New authorization is required before another attempt.':detail;
  }
 }catch(error){if(error instanceof SendGridSendError&&error.outcome!=='ambiguous'){status='failed';detail='Provider refused the notification. New authorization is required before another attempt.';}}
 await db.batch([stmt(db,"UPDATE s_invoice_delivery_attempts SET status=?,provider_id=?,detail=? WHERE id=? AND status='sending'",status,providerId,detail,attemptId),audit(db,actor,'invoice.notification_result',attemptId,JSON.stringify({status,provider:env.MAIL_PROVIDER,providerId}),{matterId:d.matter_id})]);
 return invoiceDeliveryState(db,actor,d.matter_id);
}
