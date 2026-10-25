import {PDFDocument} from 'pdf-lib';
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {invoiceQr} from './invoice-qr';
import type {InvoiceBranding} from './invoice-pdf';

export const invoiceNotification={subject:'A secure portal update',body:'Sign in to your secure portal to review an update.'};
export async function invoiceTemplates(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer','billing');
 return {templates:(await rows(db,'SELECT * FROM s_invoice_templates ORDER BY version')).map(t=>({...t,config:JSON.parse(t.config)})),notifications:await rows(db,'SELECT * FROM s_invoice_notification_templates ORDER BY approved_at,id'),notification:invoiceNotification};
}
export async function saveInvoiceTemplate(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner','lawyer');insist(b.confirmed===true,'Review and approve the complete branded invoice template');
 const previous=await stmt(db,'SELECT * FROM s_invoice_templates ORDER BY version DESC LIMIT 1').first<Data>();
 insist((b.previousId??null)===(previous?.id??null),'Template changed; refresh before approving a version',409);
 const logoBase64=text(b.logoBase64,'Firm logo',350000),logoMime=b.logoMime;insist(logoMime==='image/png'||logoMime==='image/jpeg','Use a PNG or JPEG firm logo');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(logoBase64),c=>c.charCodeAt(0));}catch{insist(false,'Use a valid base64 firm logo');}
 insist(bytes.length<=256000,'Firm logo must be at most 256 kB');
 try{const pdf=await PDFDocument.create(),image=logoMime==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);insist(image.width<=4096&&image.height<=4096,'Logo dimensions must be at most 4096 pixels');}catch{insist(false,'Firm logo cannot be parsed or exceeds the dimensions limit');}
 insist(typeof b.includeTrustBalance==='boolean','Choose whether to include the matter trust balance');
 const config={firmName:text(b.firmName,'Firm name',200),address:text(b.address,'Firm address',1000),logoBase64,logoMime,remittance:text(b.remittance,'Remittance details',2000),terms:text(b.terms,'Payment terms',1000),dueDays:integer(b.dueDays,'Days until due',0,365),includeTrustBalance:b.includeTrustBalance},templateId=id(),version=(previous?.version??0)+1;
 await atomic(db,actor,[guard(db,'COALESCE((SELECT id FROM s_invoice_templates ORDER BY version DESC LIMIT 1),\'\')=?',previous?.id??''),stmt(db,'INSERT INTO s_invoice_templates VALUES(?,?,?,?,?)',templateId,version,JSON.stringify(config),actor.email,now()),audit(db,actor,'invoice.template_approved',templateId,JSON.stringify({version,reason:text(b.reason,'Template approval reason',2000)}))]);
 return {id:templateId,version,config};
}
export async function approveInvoiceNotification(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner','lawyer');insist(b.confirmed===true,'Counsel must review the exact plain-text sign-in notification');
 const template=id(),at=now(),reason=text(b.reason,'Notification approval reason',2000);
 await atomic(db,actor,[stmt(db,'INSERT INTO s_invoice_notification_templates VALUES(?,?,?,?,?,?)',template,invoiceNotification.subject,invoiceNotification.body,actor.email,at,reason),audit(db,actor,'invoice.notification_approved',template,JSON.stringify({...invoiceNotification,reason}))]);return {id:template,...invoiceNotification};
}
// The caller may use this in the existing atomic issue renderer. No template selected means legacy PDF behavior.
export async function buildInvoiceBranding(db:D1Database,bill:Data,origin:string,templateId?:string,payerName?:string):Promise<InvoiceBranding|undefined>{
 if(!templateId)return undefined;
 const template=await stmt(db,'SELECT * FROM s_invoice_templates WHERE id=?',templateId).first<Data>();insist(template,'Invoice template version not found',404);const config=JSON.parse(template.config);
 const paymentUrl=new URL('/app/invoices/'+encodeURIComponent(bill.id)+'/pay',origin).href;invoiceQr(paymentUrl);
 const at=bill.issued_at??now(),day=new Date(at);day.setUTCDate(day.getUTCDate()+config.dueDays);
 const trust=config.includeTrustBalance?await stmt(db,'SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',bill.matter_id).first<Data>():null;
 return {...config,templateId:template.id,templateVersion:template.version,paymentUrl,dueDate:day.toISOString().slice(0,10),payerName:payerName??bill.snapshot.client,trustBalanceCents:trust?Number(trust.cents):null,trustAsOf:at};
}
