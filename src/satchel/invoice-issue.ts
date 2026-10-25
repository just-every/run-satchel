import {buildInvoiceBranding} from './invoice-templates';
import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {formatInvoice,invoiceCounter} from './invoice-schemes';
import {invoicePdf} from './invoice-pdf';
import {freezeLedes,reserveInvoice} from './ledes';

export async function invoiceIssue(db:D1Database,billId:string){
 return stmt(db,'SELECT bill_id,number,approved_revision,approved_digest,snapshot_digest,pdf_digest,issued_by,issued_at,scheme_id FROM s_invoice_issues WHERE bill_id=?',billId).first<Data>();
}
export async function issueInvoices(db:D1Database,actor:Actor,b:Data,origin?:string){
 human(actor);need(actor,'owner','lawyer','billing');
 insist(Array.isArray(b.bills)&&b.bills.length>0&&b.bills.length<=50,'Select 1–50 approved bills');
 insist(new Set(b.bills.map((x:Data)=>x.id)).size===b.bills.length,'Select each bill only once');
 const counter=await invoiceCounter(db);insist(counter,'The principal must save an invoice scheme before issuing',422);
 const scheme=(await stmt(db,'SELECT * FROM s_invoice_schemes WHERE id=?',counter.scheme_id).first<Data>())!,terms=JSON.parse(scheme.terms);
 const zone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC',at=now();
 const year=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric'}).format(new Date(at));
 let next=Number(counter.next_number);const writes:D1PreparedStatement[]=[],result:Data[]=[];
 for(const request of b.bills){
  const billId=text(request.id,'Bill ID',100),bill=await stmt(db,'SELECT b.*,t.snapshot tax_snapshot FROM s_bills b LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.id=?',billId).first<Data>();
  insist(bill,'Bill not found',404);await matter(db,actor,bill.matter_id);
  const prior=await invoiceIssue(db,billId);
  if(prior){insist(request.revision===prior.approved_revision,'Issue replay must name the original approved revision',409);result.push(prior);continue;}
  insist(request.revision===bill.revision,'Bill changed; review the exact approved revision before issuing',409);
  insist(bill.status==='approved'&&bill.artifact&&bill.approved_by,'Only an exact approved bill can be issued',409);
  insist(await digest(bill.artifact)===bill.artifact_digest,'Approved CSV integrity check failed',409);
  const snapshot=JSON.parse(bill.tax_snapshot??bill.snapshot);
  insist(snapshot.taxReview,'Unknown tax treatment: issuance requires an exact reviewed tax calculation, including exemptions',422);
  const registered=await stmt(db,'SELECT * FROM s_invoice_numbers WHERE bill_id=?',billId).first<Data>();
  let number=registered?.number,ordinal:number|null=null;
  if(!number&&bill.corrects_bill_id){
   const parent=await stmt(db,'SELECT number FROM s_invoice_numbers WHERE bill_id=?',bill.corrects_bill_id).first<Data>();
   insist(parent,'Issue the original before its correction',422);
   const [,base,k]=String(parent.number).match(/^(.*?)(?:-R(\d+))?$/)!;number=base+'-R'+(Number(k??0)+1);
  }
  if(!number){ordinal=next++;number=formatInvoice(terms,ordinal,year);}
  insist(registered||!await stmt(db,'SELECT 1 FROM s_invoice_numbers WHERE number=?',number).first(),'Invoice number collision; no number was consumed',409);
  const numbered={...snapshot,invoiceNumber:number,...(snapshot.ledes?{ledes:{...snapshot.ledes,invoiceNumber:number}}:{})};
  const branding=request.templateId?(insist(origin,'The invoice origin is required'),await buildInvoiceBranding(db,{...bill,snapshot:numbered,issued_at:at},origin,text(request.templateId,'Invoice template revision',100),undefined,actor)):undefined;
  const pdf=await invoicePdf({...bill,snapshot:numbered},number,at,branding),pdfDigest=await digest(pdf),snapshotDigest=await digest(JSON.stringify(snapshot));
  let binary='';for(const byte of pdf)binary+=String.fromCharCode(byte);
  writes.push(accessGuard(db,actor,bill.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status='approved' AND artifact_digest=?)",billId,bill.revision,bill.artifact_digest));
  if(!registered)writes.push(stmt(db,'INSERT INTO s_invoice_numbers VALUES(?,?,?,?,?,?,?)',number,billId,bill.corrects_bill_id?'correction':'issued',ordinal,scheme.id,'Satchel atomic issue',at));
  if(snapshot.ledes){
   const existing=await stmt(db,'SELECT artifact FROM s_bill_ledes WHERE bill_id=?',billId).first<Data>();
   if(!existing)writes.push(reserveInvoice(db,billId,number));
   if(!existing?.artifact)writes.push(...await freezeLedes(db,{id:billId,snapshot:numbered}));
  }
  writes.push(stmt(db,'INSERT INTO s_invoice_issues VALUES(?,?,?,?,?,?,?,?,?,?)',billId,number,bill.revision,bill.artifact_digest,snapshotDigest,btoa(binary),pdfDigest,actor.email,at,scheme.id),audit(db,actor,'invoice.issued',billId,JSON.stringify({number,schemeId:scheme.id,approvedDigest:bill.artifact_digest,snapshotDigest,pdfDigest}),{matterId:bill.matter_id}));
  result.push({bill_id:billId,number,approved_revision:bill.revision,approved_digest:bill.artifact_digest,snapshot_digest:snapshotDigest,pdf_digest:pdfDigest,issued_by:actor.email,issued_at:at,scheme_id:scheme.id});
 }
 if(writes.length)await atomic(db,actor,[guard(db,'EXISTS(SELECT 1 FROM s_invoice_counter WHERE revision=? AND next_number=?)',counter.revision,counter.next_number),...writes,stmt(db,'UPDATE s_invoice_counter SET next_number=?,revision=? WHERE id=1',next,id())]);
 return {issues:result};
}

export async function invoiceFile(db:D1Database,actor:Actor,billId:string){
 human(actor);need(actor,'owner','lawyer','billing');const bill=await stmt(db,'SELECT matter_id FROM s_bills WHERE id=?',billId).first<Data>();insist(bill,'Bill not found',404);await matter(db,actor,bill.matter_id);
 const issue=await stmt(db,'SELECT * FROM s_invoice_issues WHERE bill_id=?',billId).first<Data>();insist(issue,'This bill has not been issued',404);
 const bytes=Uint8Array.from(atob(issue.pdf_base64),c=>c.charCodeAt(0));insist(await digest(bytes)===issue.pdf_digest,'Issued PDF integrity check failed',409);
 await atomic(db,actor,[accessGuard(db,actor,bill.matter_id),audit(db,actor,'invoice.pdf_downloaded',billId,issue.pdf_digest,{matterId:bill.matter_id})]);
 return new Response(bytes,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(issue.number)}.pdf`,'cache-control':'no-store'}});
}
