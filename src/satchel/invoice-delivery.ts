import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {invoicePdf} from './invoice-pdf';
import {buildInvoiceBranding,priorInvoiceBalance} from './invoice-templates';
import {auditDeliveryRead,deliveryAccess,deliveryFences,invoiceRecipient,invoiceStaff,invoiceReaders} from './invoice-delivery-access';
import {matterScope} from './matter-scope';
import {portalAccess} from './portal';

export const encodePdf=(bytes:Uint8Array)=>{let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
export async function pdfResponse(base64:string,expected:string,filename:string){
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));insist(await digest(bytes)===expected,'Stored PDF failed its integrity check',503);
 return new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length),'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
export async function prepareInvoiceDelivery(db:D1Database,actor:Actor,billId:string,b:Data,origin:string){
 invoiceStaff(actor,true);const bill=await stmt(db,'SELECT b.*,i.number,i.issued_at,i.pdf_base64 issue_pdf_base64,i.pdf_digest issue_digest,i.snapshot_digest issue_snapshot_digest,i.approved_digest issue_approved_digest,t.snapshot tax_snapshot FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.id=?',billId).first<Data>();
 insist(bill&&bill.status!=='void','Choose a current issued invoice',409);await matter(db,actor,bill.matter_id);
 const recipient=text(b.recipient,'Payer portal email',254).toLowerCase(),payerName=text(b.payerName,'Payer name',300),templateId=text(b.templateId,'Approved invoice template',100);
 const d:Data={id:id(),bill_id:bill.id,matter_id:bill.matter_id,recipient,issue_digest:bill.issue_digest};const revision=await invoiceRecipient(db,actor,d);
 const snapshot=JSON.parse(bill.tax_snapshot??bill.snapshot);insist(await digest(JSON.stringify(snapshot))===bill.issue_snapshot_digest&&await digest(bill.artifact)===bill.issue_approved_digest,'Reviewed invoice no longer matches the immutable issue',409);
 const prior=await priorInvoiceBalance(db,bill,templateId);
 const branding=(await buildInvoiceBranding(db,{...bill,snapshot},origin,templateId,payerName,actor,prior.cents))!;
 const pdf=snapshot.imported?Uint8Array.from(atob(bill.issue_pdf_base64),c=>c.charCodeAt(0)):await invoicePdf({...bill,snapshot},bill.number,bill.issued_at,branding),hash=await digest(pdf),at=now();
 if(snapshot.imported)insist(hash===bill.issue_digest,'Historic invoice original failed its integrity check',503);
 // Delivery freezes the exact issue's reviewed data under an approved template. The issued original is untouched.
 await atomic(db,actor,[...prior.guards,guard(db,'NOT EXISTS(SELECT 1 FROM s_invoice_template_retirements WHERE template_id=?)',templateId),...deliveryFences(db,actor,d,revision),stmt(db,'INSERT INTO s_invoice_deliveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',d.id,bill.id,templateId,recipient,payerName,branding.dueDate,JSON.stringify({number:bill.number,invoice:snapshot,branding}),bill.issue_digest,encodePdf(pdf),hash,actor.email,at),audit(db,actor,'invoice.portal_delivered',d.id,JSON.stringify({billId:bill.id,templateId,pdfDigest:hash,recipient,reviewedIssueDigest:bill.issue_digest}),{matterId:bill.matter_id})]);
 return {id:d.id,billId:bill.id,pdfDigest:hash,paymentUrl:branding.paymentUrl,dueDate:branding.dueDate};
}
async function deliveryJson(db:D1Database,d:Data){
 const attempts=await rows(db,'SELECT * FROM s_invoice_delivery_attempts WHERE delivery_id=? ORDER BY authorized_at,id',d.id);
 for(const a of attempts){a.events=await rows(db,'SELECT id,status,occurred_at,received_at FROM s_invoice_delivery_events WHERE attempt_id=? ORDER BY occurred_at,id',a.id);const states=a.events.map((e:Data)=>e.status);a.outcome=['complained','unsubscribed','bounced','dropped','delivered','deferred','processed'].find(s=>states.includes(s))??(a.status==='sending'?'uncertain':a.status);}
 const {pdf_base64,issue_digest,...metadata}=d;return {...metadata,snapshot:JSON.parse(d.snapshot),attempts,pdfUrl:'/api/satchel/invoice-deliveries/'+d.id+'/pdf'};
}
export async function invoiceDeliveryState(db:D1Database,actor:Actor,matterId:string){
 invoiceStaff(actor);await matter(db,actor,matterId);
 const list=await rows(db,'SELECT d.*,i.number,b.status bill_status FROM s_invoice_deliveries d JOIN s_bills b ON b.id=d.bill_id JOIN s_invoice_issues i ON i.bill_id=d.bill_id WHERE b.matter_id=? ORDER BY d.created_at,d.id',matterId);
 return {deliveries:await Promise.all(list.map(d=>deliveryJson(db,d))),statements:await rows(db,`SELECT s.id,s.recipient,s.pdf_digest,s.created_at FROM s_payer_statements s WHERE s.matter_id=? AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(s.snapshot,'$.matterIds'),json_array(s.matter_id))) selected WHERE NOT ${matterScope('selected.value')}) ORDER BY s.created_at,s.id`,matterId,actor.role,actor.email),statementMatters:await rows(db,`SELECT m.id,m.matter_number,m.title FROM s_matters m WHERE ${matterScope('m.id')} AND m.client=(SELECT client FROM s_matters WHERE id=?) AND EXISTS(SELECT 1 FROM s_invoice_deliveries d JOIN s_bills delivered ON delivered.id=d.bill_id WHERE delivered.matter_id=m.id) ORDER BY m.matter_number`,actor.role,actor.email,matterId),replacements:await rows(db,'SELECT r.*,i.number replacement_number FROM s_invoice_replacements r JOIN s_bills b ON b.id=r.bill_id JOIN s_invoice_issues i ON i.bill_id=r.replacement_bill_id WHERE b.matter_id=?',matterId)};
}
export async function deliveredInvoice(db:D1Database,billId:string,actor:Actor){
 human(actor);const bill=await stmt(db,'SELECT matter_id FROM s_bills WHERE id=?',billId).first<Data>();insist(bill,'Invoice not found',404);
 if(actor.role==='client')insist((await stmt(db,`SELECT ${portalAccess('?',invoiceReaders)} ok`,actor.email,bill.matter_id).first<Data>())?.ok,'Invoice not found',404);else{invoiceStaff(actor);await matter(db,actor,bill.matter_id);}
 const d=await stmt(db,`SELECT * FROM s_invoice_deliveries WHERE bill_id=? ${actor.role==='client'?'AND recipient=?':''} ORDER BY created_at DESC,id DESC LIMIT 1`,billId,...(actor.role==='client'?[actor.email]:[])).first<Data>();
 return d?{id:d.id,pdfUrl:'/api/satchel/invoice-deliveries/'+d.id+'/pdf',pdfDigest:d.pdf_digest,payerName:d.payer_name,dueDate:d.due_date}:null;
}
export async function deliveredInvoiceFile(db:D1Database,actor:Actor,deliveryId:string){
 const d=await deliveryAccess(db,actor,deliveryId);
 if(actor.role==='client')insist(d.bill_status!=='void','This invoice is void. Open its payment page for replacement details.',409);
 await auditDeliveryRead(db,actor,d,'invoice.delivered_pdf_downloaded');return pdfResponse(d.pdf_base64,d.pdf_digest,d.number+'.pdf');
}
export async function replaceInvoiceLink(db:D1Database,actor:Actor,billId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');const original=await stmt(db,"SELECT * FROM s_bills WHERE id=? AND status='void'",billId).first<Data>();insist(original,'Choose a voided invoice',409);await matter(db,actor,original.matter_id);
 const replacementId=text(b.replacementBillId,'Issued replacement invoice',100),reason=text(b.reason,'Replacement reason',2000);
 const sql="EXISTS(SELECT 1 FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.id=? AND b.matter_id=? AND b.status<>'void')";
 insist((await stmt(db,'SELECT '+sql+' ok',replacementId,original.matter_id).first<Data>())?.ok,'Choose a current issued replacement on the same matter',409);
 await atomic(db,actor,[accessGuard(db,actor,original.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND status='void')",billId),guard(db,sql,replacementId,original.matter_id),stmt(db,'INSERT INTO s_invoice_replacements VALUES(?,?,?,?,?)',billId,replacementId,reason,actor.email,now()),audit(db,actor,'invoice.replacement_named',billId,JSON.stringify({replacementId,reason}),{matterId:original.matter_id})]);return {billId,replacementBillId:replacementId};
}
