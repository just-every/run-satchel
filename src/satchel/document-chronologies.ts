import {PDFDocument} from 'pdf-lib';
import {extractChronologyPdf} from './chronology-extraction';
import {atomic,audit,date,digest,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {decode,documentGuard,matterGuard,visibleDocument} from './documents';

// Conservative health-data default: principal only, native processing, no outbound processor.
function healthOwner(actor:Actor){human(actor);need(actor,'owner');}
async function healthSetup(db:D1Database,actor:Actor,matterId:string){
 healthOwner(actor);await matter(db,actor,matterId);
 return stmt(db,'SELECT * FROM s_health_setup WHERE matter_id=?',matterId).first<Data>();
}
async function chronologySources(db:D1Database,actor:Actor,chronologyId:string){
 const documents=[];
 for(const source of await rows(db,'SELECT DISTINCT document_id FROM s_chronology_sources WHERE chronology_id=?',chronologyId)){
  const d=await visibleDocument(db,actor,source.document_id);insist(!d.erased_at,'Chronology source unavailable',404);documents.push(d);
 }
 return documents;
}
function json(row:Data){return {...row,snapshot:row.snapshot?JSON.parse(row.snapshot):null,review:row.review?JSON.parse(row.review):null};}
export async function chronologyState(db:D1Database,actor:Actor,matterId:string){
 const setup=await healthSetup(db,actor,matterId),chronologies=[];
 if(setup)for(const row of await rows(db,'SELECT * FROM s_document_chronologies WHERE matter_id=? AND status<>? ORDER BY created_at DESC,id',matterId,'erased')){
  try{await chronologySources(db,actor,row.id);chronologies.push(json(row));}catch(error){if((error as {status?:number}).status!==404)throw error;}
 }
 const sources=setup?await rows(db,"SELECT d.id documentId,d.title,v.version,v.name,v.sha256 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id WHERE d.matter_id=? AND d.visibility='private' AND d.created_by=? AND d.erased_at IS NULL AND v.created_by=? AND v.created_channel='person' AND v.mime='application/pdf' AND v.content_base64 IS NOT NULL ORDER BY d.title,v.version DESC",matterId,actor.email,actor.email):[];
 return {setup,chronologies,sources,policy:'Principal only; native processing; no external processor or disclosure'};
}
export async function configureHealth(db:D1Database,actor:Actor,matterId:string,body:Data){
 await healthSetup(db,actor,matterId);
 insist(body.confirmed===true,'Explicitly confirm authority and agreements for native health-data processing');
 const authorization=text(body.authorizationReference,'Health-data authorization reference',1000),agreement=text(body.agreementReference,'Reviewed storage and processing agreement reference',1000);
 await atomic(db,actor,[...matterGuard(db,actor,matterId),
  stmt(db,'INSERT INTO s_health_setup VALUES(?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET authorization_reference=excluded.authorization_reference,agreement_reference=excluded.agreement_reference,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at',matterId,authorization,agreement,actor.email,now()),
  audit(db,actor,'chronology.health_setup',matterId,JSON.stringify({authorizationReference:authorization,agreementReference:agreement,processor:'native-only'}),{matterId})]);
 return chronologyState(db,actor,matterId);
}
export async function importChronology(db:D1Database,actor:Actor,matterId:string,body:Data){
 const setup=await healthSetup(db,actor,matterId);insist(setup,'Review health-data authority and agreements before importing',409);
 const native=body.sources!==undefined;
 insist(!(native&&body.entries!==undefined),'Choose original PDF extraction or a record file, not both');
 const inputs=native?body.sources:body.entries;
 insist(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=(native?20:200),native?'Select between 1 and 20 private PDF originals':'Import between 1 and 200 source-linked records');
 const reportedTotalCents=integer(body.reportedTotalCents,'Packet reported bill total',0,1000000000),gapDays=integer(body.gapDays,'Record interval threshold in days',1,3650),entries:Data[]=[],documents=new Map<string,Data>(),versions=new Map<string,Data>(),extractedSources:Data[]=[];
 const selected=new Set<string>();
 for(const value of inputs){
  insist(value&&typeof value==='object'&&!Array.isArray(value),'Supply a chronology source');
  const documentId=text(value.documentId,'Source document',100),version=integer(value.version,'Source version',1),key=documentId+':'+version;
  if(native){insist(!selected.has(key),'Select each original version only once');selected.add(key);}
  let d=documents.get(documentId);if(!d){d=await visibleDocument(db,actor,documentId);insist(d.matter_id===matterId&&!d.erased_at,'Source document not found',404);insist(d.visibility==='private'&&d.created_by===actor.email,'Health chronology sources must be private originals uploaded by the principal',409);documents.set(documentId,d);}
  let source=versions.get(key);
  if(!source){
   const v=await stmt(db,'SELECT * FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',documentId,version).first<Data>();insist(v,'Source original not found',404);
   insist(v.created_by===actor.email&&v.created_channel==='person','Health chronology source versions must be uploaded by the principal',409);
   const bytes=decode(v.content_base64);insist(bytes.length===v.size&&await digest(bytes)===v.sha256,'Source original failed its integrity check',503);
   insist(v.mime==='application/pdf','Chronology page citations currently require PDF originals');
   if(native){
    const extracted=await extractChronologyPdf(bytes);source={...v,pageCount:extracted.pageCount,extractedEntries:extracted.entries};
    extractedSources.push({documentId,version,sourceName:v.name,sourceSha256:v.sha256,pageCount:extracted.pageCount,reportedTotals:extracted.reportedTotals});
   }else{
    let pdf:PDFDocument;try{pdf=await PDFDocument.load(bytes);}catch{insist(false,'Use a readable unencrypted source PDF');}
    source={...v,pageCount:pdf.getPageCount()};
   }
   versions.set(key,source);
  }
  for(const record of native?source.extractedEntries:[value]){
   insist(entries.length<200,'Extraction exceeds 200 records; split the packet before importing',422);
   insist(record.kind==='treatment'||record.kind==='bill','Choose treatment or bill');
   entries.push({index:entries.length,documentId,version,sourceName:source.name,sourceSha256:source.sha256,page:integer(record.page,'Source page',1,source.pageCount),kind:record.kind,provider:text(record.provider,'Provider',160),date:date(record.date),treatment:text(record.treatment,'Treatment or bill description',2000),chargeCents:record.kind==='bill'?integer(record.chargeCents,'Bill charge in cents',0,100000000):null,...(native?{sourceText:record.sourceText}: {})});
  }
 }
 let grossTotalCents=0;const first=new Map<string,number>(),duplicates:Data[]=[],intervals:Data[]=[];
 for(const entry of entries)if(entry.kind==='bill'){
  grossTotalCents+=entry.chargeCents;const key=JSON.stringify([entry.provider.toLowerCase(),entry.date,entry.chargeCents]);
  if(first.has(key))duplicates.push({index:entry.index,possibleDuplicateOf:first.get(key)});else first.set(key,entry.index);
 }
 const providers=[...new Set(entries.map(entry=>entry.provider.toLowerCase()))];
 for(const provider of providers){const ordered=entries.filter(entry=>entry.provider.toLowerCase()===provider&&entry.kind==='treatment').sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
  for(let n=1;n<ordered.length;n++){const days=(Date.parse(ordered[n].date)-Date.parse(ordered[n-1].date))/86400000;if(days>gapDays)intervals.push({provider:ordered[n].provider,fromIndex:ordered[n-1].index,toIndex:ordered[n].index,days});}
 }
 const chronologyId=id(),at=now(),snapshot={id:chronologyId,matterId,createdAt:at,createdBy:actor.email,setup:{authorizationReference:setup.authorization_reference,agreementReference:setup.agreement_reference,reviewedAt:setup.reviewed_at,processor:'native-only'},extraction:native?{method:'native-pdf-text',sources:extractedSources}:{method:'reviewed-record-file'},reportedTotalCents,grossTotalCents,unreviewedDifferenceCents:grossTotalCents-reportedTotalCents,gapDays,entries,duplicates,intervals,notice:'Source-linked records for counsel review. Intervals do not establish missing treatment; duplicate candidates are not excluded automatically. No causation is inferred.'},hash=await digest(JSON.stringify(snapshot));
 const setupGuard=id();
 await atomic(db,actor,[...matterGuard(db,actor,matterId),...[...documents.values()].flatMap(d=>documentGuard(db,actor,d)),
  stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_health_setup WHERE matter_id=? AND reviewed_at=?) THEN 1 ELSE 0 END',setupGuard,matterId,setup.reviewed_at),stmt(db,'DELETE FROM s_guard WHERE id=?',setupGuard),
  stmt(db,"INSERT INTO s_document_chronologies(id,matter_id,snapshot,sha256,status,created_by,created_at) VALUES(?,?,?,?,'draft',?,?)",chronologyId,matterId,JSON.stringify(snapshot),hash,actor.email,at),
  ...[...versions.values()].map(v=>stmt(db,'INSERT INTO s_chronology_sources VALUES(?,?,?)',chronologyId,v.document_id,v.version)),
  audit(db,actor,'chronology.imported',chronologyId,JSON.stringify({sha256:hash,records:entries.length}),{matterId})]);
 return {id:chronologyId,sha256:hash,snapshot,status:'draft'};
}
export async function publishChronology(db:D1Database,actor:Actor,chronologyId:string,body:Data){
 healthOwner(actor);const row=await stmt(db,'SELECT * FROM s_document_chronologies WHERE id=?',chronologyId).first<Data>();insist(row&&row.snapshot,'Chronology not found',404);await healthSetup(db,actor,row.matter_id);
 const documents=await chronologySources(db,actor,row.id),snapshot=JSON.parse(row.snapshot);
 insist(row.status==='draft'&&body.sha256===row.sha256,'Review the exact unpublished chronology before publication',409);
 insist(Array.isArray(body.decisions)&&body.decisions.length===snapshot.duplicates.length,'Resolve every possible duplicate before publication');
 const excluded=new Set<number>(),seen=new Set<number>(),decisions:Data[]=[];
 for(const value of body.decisions){
  const index=integer(value?.index,'Duplicate record index',0,199);insist(snapshot.duplicates.some((d:Data)=>d.index===index)&&!seen.has(index),'Resolve each duplicate candidate exactly once');
  insist(value.decision==='keep'||value.decision==='exclude','Explicitly keep or exclude the candidate');seen.add(index);
  if(value.decision==='exclude')excluded.add(index);decisions.push({index,decision:value.decision,note:text(value.note,'Duplicate review reason',1000)});
 }
 const reconciledTotalCents=snapshot.entries.reduce((sum:number,entry:Data)=>sum+(entry.kind==='bill'&&!excluded.has(entry.index)?entry.chargeCents:0),0),review={note:text(body.reviewNote,'Counsel publication review',2000),decisions,reconciledTotalCents,differenceCents:reconciledTotalCents-snapshot.reportedTotalCents},fence=id();
 await atomic(db,actor,[...matterGuard(db,actor,row.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),
  stmt(db,"INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_chronologies WHERE id=? AND status='draft' AND sha256=?) THEN 1 ELSE 0 END",fence,row.id,row.sha256),stmt(db,'DELETE FROM s_guard WHERE id=?',fence),
  stmt(db,"UPDATE s_document_chronologies SET status='published',review=?,published_by=?,published_at=? WHERE id=?",JSON.stringify(review),actor.email,now(),row.id),
  audit(db,actor,'chronology.published',row.id,JSON.stringify({sha256:row.sha256,reconciledTotalCents,differenceCents:review.differenceCents}),{matterId:row.matter_id})]);
 return {id:row.id,status:'published',review};
}
export function eraseChronologies(db:D1Database,documentId:string){return [stmt(db,"UPDATE s_document_chronologies SET snapshot=NULL,review=NULL,status='erased' WHERE id IN (SELECT chronology_id FROM s_chronology_sources WHERE document_id=?)",documentId)];}
