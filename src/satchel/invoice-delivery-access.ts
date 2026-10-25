import {atomic,audit,authority,human,insist,matter,need,stmt,type Actor,type Data} from './model';
import {contactData,contactRevisionGuard} from './contact-data';
import {contactGraph} from './contact-graph';
import {portalAccess} from './portal';
import {accessGuard,guard} from './trust-guards';
import {requireArea} from './role-areas';
import {requireProviderReview} from './providers';

export const invoiceReaders=['client','co_client','payer'];
export function invoiceStaff(actor:Actor,write=false){human(actor);need(actor,'owner','lawyer','billing');requireArea(actor,'billing',write?'write':'read');requireArea(actor,'rates','all');}
export async function invoiceRecipient(db:D1Database,actor:Actor,m:Data,mail=false){
 invoiceStaff(actor,true);await matter(db,actor,m.matter_id);requireArea(actor,'contacts','read');
 const data=await contactData(db),graph=contactGraph(data),contacts=graph.contacts.filter(c=>c.emails.some(e=>e.toLowerCase()===m.recipient));
 insist(contacts.length===1,'Identify exactly one payer contact for this email',409);
 const contact=contacts[0];insist(contact.matterRoles.some(r=>r.matter_id===m.matter_id&&['client','insurer'].includes(r.role)),'Choose a client or insurer contact linked to this matter',409);
 insist((await stmt(db,`SELECT ${portalAccess('?',invoiceReaders)} ok`,m.recipient,m.matter_id).first<Data>())?.ok,'Payer needs active invoice portal access with no ethical wall',409);
 if(mail){await requireProviderReview(db,'mail');insist(contact.effectiveConsent.email==='allowed','Record affirmative email consent for every retained merged identity',409);}
 return data.revision;
}
export function deliveryFences(db:D1Database,actor:Actor,m:Data,revision?:number){return [accessGuard(db,actor,m.matter_id),...(revision===undefined?[]:contactRevisionGuard(db,revision)),guard(db,portalAccess('?',invoiceReaders),m.recipient,m.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.id=? AND b.matter_id=? AND b.status<>'void' AND i.pdf_digest=?)",m.bill_id,m.matter_id,m.issue_digest)];}
export async function deliveryAccess(db:D1Database,actor:Actor,deliveryId:string){
 human(actor);const d=await stmt(db,'SELECT d.*,b.matter_id,b.status bill_status,i.number FROM s_invoice_deliveries d JOIN s_bills b ON b.id=d.bill_id JOIN s_invoice_issues i ON i.bill_id=b.id WHERE d.id=?',deliveryId).first<Data>();insist(d,'Invoice delivery not found',404);
 if(actor.role==='client')insist(d.recipient===actor.email&&(await stmt(db,`SELECT ${portalAccess('?',invoiceReaders)} ok`,actor.email,d.matter_id).first<Data>())?.ok,'Invoice delivery not found',404);
 else{invoiceStaff(actor);await matter(db,actor,d.matter_id);if(JSON.parse(d.snapshot).branding.trustBalanceCents!==null)requireArea(actor,'bank','full');}
 return d;
}
export async function auditDeliveryRead(db:D1Database,actor:Actor,d:Data,action:string){
 await atomic(db,actor,[actor.role==='client'?guard(db,portalAccess('?',invoiceReaders),actor.email,d.matter_id):accessGuard(db,actor,d.matter_id),audit(db,actor,action,d.id,JSON.stringify({billId:d.bill_id,pdfDigest:d.pdf_digest}),{matterId:d.matter_id})]);
}
export async function assertCurrentStaff(db:D1Database,actor:Actor){const a=authority(actor);insist(await stmt(db,`SELECT 1 WHERE ${a.sql}`,...a.params).first(),'Staff authority is no longer active',403);}
