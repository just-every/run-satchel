import {PDFDocument,StandardFonts} from 'pdf-lib';
import {atomic,audit,digest,human,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard,accessGuard} from './trust-guards';
import {portalAccess} from './portal';
import {invoiceReaders,invoiceStaff} from './invoice-delivery-access';
import {invoiceFunds} from './trust-transfers';
import {encodePdf,pdfResponse} from './invoice-delivery';
import {requireArea} from './role-areas';

async function statementPdf(snapshot:Data){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),branding=snapshot.branding;
 pdf.setCreationDate(new Date(snapshot.asOf));pdf.setModificationDate(new Date(snapshot.asOf));let page=pdf.addPage(),y=780;
 const write=(value:string)=>{for(const block of value.split('\n')){let line='';for(const word of block.split(/\s+/)){if(line&&font.widthOfTextAtSize(line+' '+word,10)>490){draw(line);line='';}if(line)line+=' ';for(const character of word){if(line&&font.widthOfTextAtSize(line+character,10)>490){draw(line);line='';}line+=character;}}if(line)draw(line);}};
 const draw=(line:string)=>{if(y<50){page=pdf.addPage();y=780;}page.drawText(line,{x:45,y,size:10,font});y-=17;};
 const bytes=Uint8Array.from(atob(branding.logoBase64),c=>c.charCodeAt(0)),logo=branding.logoMime==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes),scale=Math.min(110/logo.width,48/logo.height);
 page.drawImage(logo,{x:45,y:y-48,width:logo.width*scale,height:logo.height*scale});y-=65;
 write(branding.firmName);write(branding.address);write('Payer statement');write('Payer: '+snapshot.payerName);write('Client: '+snapshot.client);write('Matter: '+snapshot.matterNumber+' '+snapshot.matterTitle);write('As of: '+snapshot.asOf);
 const money=(c:number)=>(c/100).toFixed(2);
 for(const invoice of snapshot.invoices){write('Invoice '+invoice.number+' | Due '+invoice.dueDate+' | '+invoice.status);write('Invoiced USD '+money(invoice.totalCents)+' | Paid USD '+money(invoice.paidCents)+' | Due USD '+money(invoice.dueCents));write('Sign in to pay: '+invoice.paymentUrl);}
 write('Total due USD '+money(snapshot.totalDueCents));write('Payment terms: '+branding.terms);write('Remittance: '+branding.remittance);
 if(snapshot.trustBalanceCents!==null)write('Matter trust balance USD '+money(snapshot.trustBalanceCents)+' as of '+snapshot.trustAsOf+' (not deducted from the amount due)');
 return pdf.save();
}
export async function createPayerStatement(db:D1Database,actor:Actor,matterId:string,b:Data){
 invoiceStaff(actor,true);const m=await matter(db,actor,matterId),recipient=text(b.recipient,'Payer portal email',254).toLowerCase();
 const deliveries=await rows(db,"SELECT d.*,i.number,b.status FROM s_invoice_deliveries d JOIN s_bills b ON b.id=d.bill_id JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.matter_id=? AND d.recipient=? AND b.status<>'void' ORDER BY d.created_at DESC,d.id DESC",matterId,recipient);
 insist(deliveries.length,'Deliver an issued invoice to this payer before preparing a statement',409);
 const unique=[...new Map(deliveries.toReversed().map(d=>[d.bill_id,d])).values()],invoices:Data[]=[],asOf=now(),statementId=id();
 for(const d of unique){const frozen=JSON.parse(d.snapshot),funds=await invoiceFunds(db,d.bill_id);invoices.push({billId:d.bill_id,number:d.number,totalCents:frozen.invoice.totalCents,paidCents:funds.paid_cents,dueCents:funds.due_cents,status:funds.status,dueDate:d.due_date,paymentUrl:frozen.branding.paymentUrl,pdfDigest:d.pdf_digest});}
 const latest=JSON.parse(deliveries[0].snapshot).branding;if(latest.trustBalanceCents!==null)requireArea(actor,'bank','full');
 const trust=latest.trustBalanceCents!==null?await stmt(db,'SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',m.id).first<Data>():null;
 const trustBalanceCents=trust?Number(trust.cents):null,snapshot={payerName:deliveries[0].payer_name,client:m.client,matterNumber:m.matter_number,matterTitle:m.title,asOf,invoices,totalDueCents:invoices.reduce((s,i)=>s+i.dueCents,0),branding:{...latest,trustBalanceCents,trustAsOf:asOf},trustBalanceCents,trustAsOf:asOf};
 const pdf=await statementPdf(snapshot),hash=await digest(pdf);
 await atomic(db,actor,[accessGuard(db,actor,m.id),guard(db,portalAccess('?',invoiceReaders),recipient,m.id),...unique.map(d=>guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND status<>'void')",d.bill_id)),stmt(db,'INSERT INTO s_payer_statements VALUES(?,?,?,?,?,?,?,?)',statementId,m.id,recipient,JSON.stringify(snapshot),encodePdf(pdf),hash,actor.email,asOf),audit(db,actor,'invoice.payer_statement_delivered',statementId,JSON.stringify({recipient,pdfDigest:hash,invoiceIds:invoices.map(i=>i.billId)}),{matterId:m.id})]);
 return {id:statementId,pdfDigest:hash,pdfUrl:'/api/satchel/payer-statements/'+statementId+'/pdf'};
}
export async function payerStatements(db:D1Database,actor:Actor,matterId:string){
 human(actor);if(actor.role==='client')insist((await stmt(db,`SELECT ${portalAccess('?',invoiceReaders)} ok`,actor.email,matterId).first<Data>())?.ok,'Matter not found',404);else{invoiceStaff(actor);await matter(db,actor,matterId);}
 const list=await rows(db,`SELECT id,recipient,snapshot,pdf_digest,created_at FROM s_payer_statements WHERE matter_id=? ${actor.role==='client'?'AND recipient=?':''} ORDER BY created_at,id`,matterId,...(actor.role==='client'?[actor.email]:[]));
 return {statements:list.map(s=>({...s,snapshot:JSON.parse(s.snapshot),pdfUrl:'/api/satchel/payer-statements/'+s.id+'/pdf'}))};
}
export async function payerStatementFile(db:D1Database,actor:Actor,statementId:string){
 human(actor);const s=await stmt(db,'SELECT * FROM s_payer_statements WHERE id=?',statementId).first<Data>();insist(s,'Payer statement not found',404);
 if(actor.role==='client')insist(s.recipient===actor.email&&(await stmt(db,`SELECT ${portalAccess('?',invoiceReaders)} ok`,actor.email,s.matter_id).first<Data>())?.ok,'Payer statement not found',404);else{invoiceStaff(actor);await matter(db,actor,s.matter_id);if(JSON.parse(s.snapshot).trustBalanceCents!==null)requireArea(actor,'bank','full');}
 await atomic(db,actor,[actor.role==='client'?guard(db,portalAccess('?',invoiceReaders),actor.email,s.matter_id):accessGuard(db,actor,s.matter_id),audit(db,actor,'invoice.payer_statement_downloaded',s.id,s.pdf_digest,{matterId:s.matter_id})]);return pdfResponse(s.pdf_base64,s.pdf_digest,'Payer statement.pdf');
}
