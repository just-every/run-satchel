import {invoiceFunds,invoicePaidGuard} from './trust-transfers';
import {PDFDocument} from 'pdf-lib';
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {invoiceQr} from './invoice-qr';
import type {InvoiceBranding} from './invoice-pdf';
import {requireArea} from './role-areas';

export const invoiceNotification={subject:'A secure portal update',body:'Sign in to your secure portal to review an update.'};
export async function invoiceTemplates(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer','billing');
 return {firmDefault:await stmt(db,"SELECT * FROM s_invoice_template_defaults WHERE scope='firm' ORDER BY sequence DESC LIMIT 1").first<Data>(),templates:(await rows(db,'SELECT t.*,r.retired_at FROM s_invoice_templates t LEFT JOIN s_invoice_template_retirements r ON r.template_id=t.id ORDER BY version')).map(t=>({...t,config:JSON.parse(t.config)})),notifications:await rows(db,'SELECT * FROM s_invoice_notification_templates ORDER BY approved_at,id'),notification:invoiceNotification};
}
export async function saveInvoiceTemplate(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner','lawyer','billing');insist(b.confirmed===true,'Review and approve the complete branded invoice template');
 const previous=await stmt(db,'SELECT * FROM s_invoice_templates ORDER BY version DESC LIMIT 1').first<Data>();
 insist((b.previousId??null)===(previous?.id??null),'Template changed; refresh before approving a version',409);
 const logoBase64=text(b.logoBase64,'Firm logo',350000),logoMime=b.logoMime;insist(logoMime==='image/png'||logoMime==='image/jpeg','Use a PNG or JPEG firm logo');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(logoBase64),c=>c.charCodeAt(0));}catch{insist(false,'Use a valid base64 firm logo');}
 insist(bytes.length<=256000,'Firm logo must be at most 256 kB');
 try{const pdf=await PDFDocument.create(),image=logoMime==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);insist(image.width<=4096&&image.height<=4096,'Logo dimensions must be at most 4096 pixels');}catch{insist(false,'Firm logo cannot be parsed or exceeds the dimensions limit');}
 insist(typeof b.includeTrustBalance==='boolean','Choose whether to include the matter trust balance');
 const display:Data={};
 for(const key of ['showTimeEntryDetail','showHours','showRates','showTimekeepers','showUtbms','showNoChargeLines','showDiscounts']){
  insist(b[key]===undefined||typeof b[key]==='boolean','Choose whether to display '+key);
  display[key]=b[key]??(key==='showTimeEntryDetail'||key==='showNoChargeLines');
 }
 insist(b.layout===undefined||b.layout==='summary'||b.layout==='detailed','Choose a summary or detailed layout');
 insist(b.includePriorBalance===undefined||typeof b.includePriorBalance==='boolean','Choose whether to include prior balances');
 const config={name:b.name===undefined?'Firm invoice':text(b.name,'Template name',200),includePriorBalance:b.includePriorBalance??false,...display,layout:b.layout??'detailed',firmName:text(b.firmName,'Firm name',200),address:text(b.address,'Firm address',1000),logoBase64,logoMime,remittance:text(b.remittance,'Remittance details',2000),terms:text(b.terms,'Payment terms',1000),dueDays:integer(b.dueDays,'Days until due',0,365),includeTrustBalance:b.includeTrustBalance},templateId=id(),version=(previous?.version??0)+1;
 await atomic(db,actor,[guard(db,'COALESCE((SELECT id FROM s_invoice_templates ORDER BY version DESC LIMIT 1),\'\')=?',previous?.id??''),stmt(db,'INSERT INTO s_invoice_templates VALUES(?,?,?,?,?)',templateId,version,JSON.stringify(config),actor.email,now()),audit(db,actor,'invoice.template_approved',templateId,JSON.stringify({version,reason:text(b.reason,'Template approval reason',2000)}))]);
 return {id:templateId,version,config};
}
export async function approveInvoiceNotification(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner','lawyer');insist(b.confirmed===true,'Counsel must review the exact plain-text sign-in notification');
 const template=id(),at=now(),reason=text(b.reason,'Notification approval reason',2000);
 await atomic(db,actor,[stmt(db,'INSERT INTO s_invoice_notification_templates VALUES(?,?,?,?,?,?)',template,invoiceNotification.subject,invoiceNotification.body,actor.email,at,reason),audit(db,actor,'invoice.notification_approved',template,JSON.stringify({...invoiceNotification,reason}))]);return {id:template,...invoiceNotification};
}
// The caller may use this in the existing atomic issue renderer. No template selected means legacy PDF behavior.
export async function buildInvoiceBranding(db:D1Database,bill:Data,origin:string,templateId?:string,payerName?:string,actor?:Actor,priorBalanceCents:number|null=null):Promise<InvoiceBranding|undefined>{
 if(!templateId)return undefined;
 insist(!await stmt(db,'SELECT 1 FROM s_invoice_template_retirements WHERE template_id=?',templateId).first(),'This template revision is retired; select an active revision for future invoices',409);
 const template=await stmt(db,'SELECT * FROM s_invoice_templates WHERE id=?',templateId).first<Data>();insist(template,'Invoice template version not found',404);const config=JSON.parse(template.config);
 if(config.includeTrustBalance){insist(actor,'Staff authority is required to include trust information',403);requireArea(actor,'bank','full');}
 const paymentUrl=new URL('/app/invoices/'+encodeURIComponent(bill.id)+'/pay',origin).href;invoiceQr(paymentUrl);
 const at=bill.issued_at??now(),timezone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC',parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at)),part=(type:string)=>parts.find(p=>p.type===type)!.value,day=new Date(part('year')+'-'+part('month')+'-'+part('day')+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+config.dueDays);
 const trust=config.includeTrustBalance?await stmt(db,'SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',bill.matter_id).first<Data>():null;
 return {...config,templateId:template.id,templateVersion:template.version,paymentUrl,dueDate:day.toISOString().slice(0,10),payerName:payerName??bill.snapshot.client,trustBalanceCents:trust?Number(trust.cents):null,trustAsOf:now(),priorBalanceCents};
}

export async function retireInvoiceTemplate(db:D1Database,actor:Actor,templateId:string,b:Data){
 human(actor);need(actor,'owner','lawyer','billing');const reason=text(b.reason,'Retirement reason',2000);
 insist(await stmt(db,'SELECT id FROM s_invoice_templates WHERE id=?',templateId).first(),'Template not found',404);
 const existing=await stmt(db,'SELECT * FROM s_invoice_template_retirements WHERE template_id=?',templateId).first<Data>();if(existing)return existing;
 await atomic(db,actor,[stmt(db,'INSERT INTO s_invoice_template_retirements VALUES(?,?,?,?)',templateId,reason,actor.email,now()),audit(db,actor,'invoice.template_retired',templateId,reason)]);
 return {templateId,retired:true};
}

export async function priorInvoiceBalance(db:D1Database,bill:Data,templateId?:string){
 const template=templateId?await stmt(db,'SELECT config FROM s_invoice_templates WHERE id=?',templateId).first<Data>():null;
 if(!template||!JSON.parse(template.config).includePriorBalance)return {cents:null,guards:[] as D1PreparedStatement[]};
 const sql="FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.matter_id=? AND b.id<>? AND b.status<>'void' AND i.issued_at<?",args=[bill.matter_id,bill.id,bill.issued_at??now()];
 const prior=await rows(db,'SELECT b.id,b.revision,COALESCE(t.snapshot,b.snapshot) snapshot '+sql,...args),guards:D1PreparedStatement[]=[guard(db,'(SELECT COUNT(*) '+sql+')=?',...args,prior.length)];let cents=0;
 for(const invoice of prior){const funds=await invoiceFunds(db,invoice.id);cents+=JSON.parse(invoice.snapshot).totalCents-funds.paid_cents;guards.push(invoicePaidGuard(db,invoice.id,funds.paid_cents),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status<>'void')",invoice.id,invoice.revision));}
 insist(Number.isSafeInteger(cents),'Prior balance exceeds exact integer range');
 return {cents,guards};
}
