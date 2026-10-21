import {documentAccess,documentGuard,visibleDocument} from './documents';
import {digest,insist,integer,rows,stmt,text,type Actor,type Data} from './model';

// Expense provenance is attached in the same transaction as the native entry.
// A source reference records an import assertion; it is not provider verification.
export async function expenseInput(db:D1Database,actor:Actor,matterId:string,body:Data,entry:Data){
 if(body.expense===undefined)return null;
 insist(body.kind==='disbursement','Expense details require a disbursement');
 const e=body.expense;insist(e&&typeof e==='object'&&!Array.isArray(e),'Give expense details');
 insist(['overhead','client_disbursement','advanced_cost'].includes(e.category),'Choose overhead, client disbursement or advanced cost');
 const detail:Data={category:e.category,vendor:text(e.vendor,'Vendor',200),vendorReference:text(e.vendorReference,'Vendor reference',200),accountingCode:text(e.accountingCode,'Accounting code',100),sourceSystem:e.sourceSystem==null?null:text(e.sourceSystem,'Source system',100),sourceId:e.sourceId==null?null:text(e.sourceId,'Source charge reference',200)};
 insist(Boolean(detail.sourceSystem)===Boolean(detail.sourceId),'Give both source system and source charge reference');
 let document:Data|null=null;
 if(e.receipt!=null){
  document=await visibleDocument(db,actor,text(e.receipt.documentId,'Receipt document',100));
  insist(document.matter_id===matterId&&!document.erased_at,'Use a retained receipt from this matter',409);
  const version=integer(e.receipt.version,'Receipt version',1);
  const file=await stmt(db,'SELECT sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',document.id,version).first<Data>();
  insist(file,'Receipt version is unavailable',409);
  detail.receipt={documentId:document.id,version,sha256:file.sha256};
 }else detail.receipt=null;
 const requestDigest=await digest(JSON.stringify({matterId,...entry,...detail}));
 return {detail,requestDigest,guards:document?documentGuard(db,actor,document):[]};
}

export async function expenseReplay(db:D1Database,input:Awaited<ReturnType<typeof expenseInput>>){
 if(!input?.detail.sourceSystem)return null;
 const existing=await stmt(db,'SELECT entry_id,request_digest FROM s_expense_details WHERE source_system=? AND source_id=?',input.detail.sourceSystem,input.detail.sourceId).first<Data>();
 if(!existing)return null;
 insist(existing.request_digest===input.requestDigest,'Source charge already recorded with different details',409);
 return existing.entry_id as string;
}

export function expenseInsert(db:D1Database,entryId:string,input:NonNullable<Awaited<ReturnType<typeof expenseInput>>>){
 const e=input.detail;
 return stmt(db,'INSERT INTO s_expense_details(entry_id,category,vendor,vendor_reference,accounting_code,source_system,source_id,request_digest,receipt_document_id,receipt_version,receipt_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?)',entryId,e.category,e.vendor,e.vendorReference,e.accountingCode,e.sourceSystem,e.sourceId,input.requestDigest,e.receipt?.documentId??null,e.receipt?.version??null,e.receipt?.sha256??null);
}

export async function expenseDetails(db:D1Database,actor:Actor,entryIds:string[]){
 const details=await rows(db,'SELECT * FROM s_expense_details WHERE entry_id IN(SELECT value FROM json_each(?))',JSON.stringify(entryIds));
 const result=new Map<string,Data>();
 for(const e of details){
  let receipt:Data|null=null;
  if(e.receipt_document_id){
   // Apply the existing document boundary before exposing even its identity.
   const access=documentAccess(actor);
   const d=await stmt(db,`SELECT d.id,d.title,d.erased_at,v.sha256,v.content_base64 IS NOT NULL retained FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id AND v.version=? WHERE d.id=? AND ${access.sql}`,e.receipt_version,e.receipt_document_id,...access.params).first<Data>();
   receipt=d&&!d.erased_at&&d.retained?{documentId:d.id,title:d.title,version:e.receipt_version,sha256:e.receipt_digest}: {unavailable:true};
  }
  result.set(e.entry_id,{category:e.category,vendor:e.vendor,vendorReference:e.vendor_reference,accountingCode:e.accounting_code,sourceSystem:e.source_system,sourceId:e.source_id,receipt});
 }
 return result;
}
