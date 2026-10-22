import {matterScope} from './matter-scope';
// TIME-007: LEDES 1998B invoices frozen at approval, their export, and e-billing
// outcomes imported from the client's vendor file (recorded, never verified with the vendor).
import {atomic,audit,digest,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {invoiceCounter} from './invoice-schemes';
import {getInvoiceVoid} from './invoice-void';
import {ledesXml} from './ledes-xml';
import {xmlFormat} from './ledes-xml-profile';
import {accessGuard,guard} from './trust-guards';

const fields=['INVOICE_DATE','INVOICE_NUMBER','CLIENT_ID','LAW_FIRM_MATTER_ID','INVOICE_TOTAL','BILLING_START_DATE','BILLING_END_DATE','INVOICE_DESCRIPTION','LINE_ITEM_NUMBER','EXP/FEE/INV_ADJ_TYPE','LINE_ITEM_NUMBER_OF_UNITS','LINE_ITEM_ADJUSTMENT_AMOUNT','LINE_ITEM_TOTAL','LINE_ITEM_DATE','LINE_ITEM_TASK_CODE','LINE_ITEM_EXPENSE_CODE','LINE_ITEM_ACTIVITY_CODE','TIMEKEEPER_ID','LINE_ITEM_DESCRIPTION','LAW_FIRM_ID','LINE_ITEM_UNIT_COST','TIMEKEEPER_NAME','TIMEKEEPER_CLASSIFICATION','CLIENT_MATTER_ID'];
const day=(d:string)=>d.replaceAll('-','');
const amount=(cents:number)=>{const sign=cents<0?'-':'',a=Math.abs(cents);return `${sign}${Math.floor(a/100)}.${String(a%100).padStart(2,'0')}`;};
const units=(u4:number)=>`${Math.floor(u4/10000)}.${String(u4%10000).padStart(4,'0')}`.replace(/\.?0+$/,'');

// The invoice number is reserved at preparation: <matter number>-<n> for a first bill,
// <original number>-R<k> for the k-th replacement in a correction branch.
export async function nextInvoiceNumber(db:D1Database,matterId:string,matterNumber:string,corrects?:string) {
 if(await invoiceCounter(db))return '';
 if(corrects){const prior=await stmt(db,'SELECT invoice_number FROM s_bill_ledes WHERE bill_id=?',corrects).first<Data>();insist(prior,'The corrected bill has no LEDES invoice',409);const [,base,k]=String(prior.invoice_number).match(/^(.*?)(?:-R(\d+))?$/)!;return `${base}-R${Number(k??0)+1}`;}
 const n=await stmt(db,'SELECT COUNT(*) n FROM s_bill_ledes l JOIN s_bills b ON b.id=l.bill_id WHERE b.matter_id=? AND b.corrects_bill_id IS NULL',matterId).first<Data>();
 return `${matterNumber}-${(n!.n as number)+1}`;
}
export const reserveInvoice=(db:D1Database,billId:string,invoiceNumber:string)=>stmt(db,'INSERT INTO s_bill_ledes(bill_id,invoice_number,created_at) VALUES(?,?,?)',billId,invoiceNumber,now());

export function ledes1998B(bill:Data) {
 const s=bill.snapshot,l=s.ledes,tax=l.tax;
 const taxLines=tax?tax.lines.filter((x:Data)=>x.taxCents!==0).map((x:Data,index:number)=>({lineNumber:l.lines.length+index+1,type:'E',units4:10000,unitCostCents:x.taxCents,adjustmentCents:0,totalCents:x.taxCents,date:s.date,expense:tax.mapping.expenseCode,description:('Tax '+tax.rule.jurisdiction+' source '+x.sourceId).replace(/[|]|\[\]/g,' ')})):[];
 const exported=[...l.lines,...taxLines],total=l.lines.reduce((n:number,x:Data)=>n+x.totalCents,0)+(tax?.totalCents??0);
 const dates=l.lines.map((x:Data)=>x.date).sort();
 const row=(x:Data)=>[day(s.date),l.invoiceNumber,l.clientId,s.matterNumber,amount(total),day(dates[0]),day(dates.at(-1)),s.title.replace(/[|]|\[\]/g,' '),x.lineNumber,x.type,units(x.units4),amount(x.adjustmentCents),amount(x.totalCents),day(x.date),x.task??'',x.expense??'',x.activity??'',x.timekeeperId??'',x.description,l.lawFirmId,amount(x.unitCostCents),x.timekeeperName??'',x.classification??'',''];
 return ['LEDES1998B',fields.join('|'),...exported.map((x:Data)=>row(x).join('|'))].map(r=>r+'[]').join('\r\n')+'\r\n';
}
export async function freezeLedes(db:D1Database,bill:Data) {
 if(!bill.snapshot.ledes)return [];
 const file=ledes1998B(bill);
 const xml=bill.snapshot.ledes.xml?ledesXml(bill):null;
 return [...(xml?[stmt(db,'INSERT INTO s_bill_ledes_xml(bill_id,artifact,artifact_digest) VALUES(?,?,?)',bill.id,xml,await digest(xml))]:[]),stmt(db,'UPDATE s_bill_ledes SET artifact=?,artifact_digest=? WHERE bill_id=? AND artifact IS NULL',file,await digest(file),bill.id),guard(db,'EXISTS(SELECT 1 FROM s_bill_ledes WHERE bill_id=? AND artifact IS NOT NULL)',bill.id)];
}

// Status follows the latest imported file: rejected if any of its rows rejects, else accepted.
export async function billLedes(db:D1Database,billId:string) {
 const l=await stmt(db,'SELECT invoice_number,artifact_digest FROM s_bill_ledes WHERE bill_id=?',billId).first<Data>();
 if(!l)return null;
 const xml=await stmt(db,'SELECT artifact_digest FROM s_bill_ledes_xml WHERE bill_id=?',billId).first<Data>();
 const outcomes=await rows(db,'SELECT * FROM s_ledes_outcomes WHERE bill_id=? ORDER BY at,id',billId),latest=outcomes.at(-1)?.import_id,current=outcomes.filter(o=>o.import_id===latest);
 return {invoiceNumber:l.invoice_number,format:'LEDES 1998B',xmlFormat,xmlReady:!!xml,ready:!!l.artifact_digest,status:!latest?'not reported':current.some(o=>o.status==='rejected')?'rejected':'accepted',
  rejections:current.filter(o=>o.status==='rejected').map(o=>({lineNumber:o.line_number,reason:o.reason})),
  outcomes:outcomes.map(o=>({importId:o.import_id,status:o.status,lineNumber:o.line_number,reason:o.reason,sourceName:o.source_name,importedBy:o.imported_by,at:o.at}))};
}

async function ledesBill(db:D1Database,actor:Actor,billId:string) {
 need(actor,'owner','lawyer','billing');human(actor);
 const bill=await stmt(db,'SELECT b.*,l.invoice_number,l.artifact AS ledes_artifact,l.artifact_digest AS ledes_digest FROM s_bills b JOIN s_bill_ledes l ON l.bill_id=b.id WHERE b.id=?',billId).first<Data>();
 insist(bill,'This bill has no LEDES invoice',404);
 const seen=await stmt(db,`SELECT 1 FROM s_matters m WHERE m.id=? AND (${matterScope('m.id', actor.channel === 'agent' ? "'agent'" : "'person'")})`,bill.matter_id,actor.role,actor.email).first();
 insist(seen,'Bill not found',404);return bill;
}

export async function exportLedes(db:D1Database,actor:Actor,billId:string,xml=false):Promise<Response> {
 const bill=await ledesBill(db,actor,billId);
 insist((['approved','exported'].includes(bill.status)||(bill.status==='void'&&await getInvoiceVoid(db,bill.id)))&&bill.ledes_artifact,'A person must approve this bill before export',409);
 const artifact=xml?await stmt(db,'SELECT artifact,artifact_digest FROM s_bill_ledes_xml WHERE bill_id=?',billId).first<Data>():{artifact:bill.ledes_artifact,artifact_digest:bill.ledes_digest};
 insist(artifact,'This reviewed bill has no XML profile; record XML billing details before preparing a new bill or a substantive reviewed correction',409);
 insist(await digest(artifact.artifact)===artifact.artifact_digest,'Reviewed LEDES integrity check failed',409);
 await atomic(db,actor,[accessGuard(db,actor,bill.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=?)',bill.id,bill.revision),
  ...(bill.status==='approved'?[stmt(db,"UPDATE s_bills SET status='exported',exported_at=?,revision=? WHERE id=? AND revision=? AND status='approved'",now(),id(),bill.id,bill.revision)]:[]),
  audit(db,actor,'bill.ledes.exported',bill.id,artifact.artifact_digest,{matterId:bill.matter_id,format:xml?xmlFormat:'LEDES 1998B'})]);
 return new Response(artifact.artifact,{headers:{'Content-Type':xml?'application/xml; charset=utf-8':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="${bill.invoice_number}.ledes.${xml?'xml':'txt'}"`,'Cache-Control':'private, no-store'}});
}

// Outcome file rows: INVOICE_NUMBER|LINE_ITEM_NUMBER|STATUS|REASON (header optional; a blank
// line number is the whole invoice; STATUS ACCEPTED or REJECTED; a rejection needs a reason).
// Re-importing the same file records nothing new.
export async function importOutcomes(db:D1Database,actor:Actor,billId:string,body:Data) {
 const bill=await ledesBill(db,actor,billId);
 insist(bill.status==='exported','Export the LEDES invoice before recording its e-billing outcome',409);
 const sourceName=text(body.fileName,'Outcome file name',200),content=text(body.content,'Outcome file',200000),sourceDigest=await digest(content);
 if(await stmt(db,'SELECT 1 FROM s_ledes_outcomes WHERE bill_id=? AND source_digest=?',bill.id,sourceDigest).first())return billLedes(db,bill.id);
 const approved=await stmt(db,'SELECT snapshot FROM s_bill_tax_approvals WHERE bill_id=?',bill.id).first<Data>(),snapshot=JSON.parse(approved?.snapshot??bill.snapshot),l=snapshot.ledes;
 const lineNumbers=new Set([...l.lines.map((x:Data)=>x.lineNumber),...(l.tax?l.tax.lines.filter((x:Data)=>x.taxCents!==0).map((_:Data,i:number)=>l.lines.length+i+1):[])]);
 const parsed=content.split(/\r?\n/).map(r=>r.replace(/\[\]$/,'').trim()).filter(r=>r&&!/^INVOICE_NUMBER\|/i.test(r)).map((r,i)=>{
  const [invoice,line,status,...reason]=r.split('|').map(x=>x.trim());
  insist(invoice===bill.invoice_number,`Row ${i+1} is for invoice ${invoice}, not ${bill.invoice_number}`);
  const s=String(status).toLowerCase();insist(s==='accepted'||s==='rejected',`Row ${i+1}: status must be ACCEPTED or REJECTED`);
  const n=line?Number(line):null;insist(n===null||lineNumbers.has(n),`Row ${i+1}: invoice ${invoice} has no line ${line}`);
  const why=reason.join('|');insist(s==='accepted'||why,`Row ${i+1}: a rejection needs its reason`);
  return {status:s,lineNumber:n,reason:why||'Accepted'};
 });
 insist(parsed.length>0&&parsed.length<=500,'The outcome file has no rows (maximum 500)');
 const importId=id(),at=now();
 await atomic(db,actor,[accessGuard(db,actor,bill.matter_id),
  ...parsed.map(o=>stmt(db,'INSERT INTO s_ledes_outcomes(id,bill_id,import_id,status,line_number,reason,source_name,source_digest,imported_by,at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',id(),bill.id,importId,o.status,o.lineNumber,o.reason,sourceName,sourceDigest,actor.email,at)),
  audit(db,actor,'bill.ledes.outcome_imported',bill.id,JSON.stringify({sourceName,sourceDigest,rows:parsed.length}),{matterId:bill.matter_id})]);
 return billLedes(db,bill.id);
}
