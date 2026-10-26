import {listProductionShares} from './production-shares';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {zipSync,strToU8} from 'fflate';
import {atomic,audit,digest,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {decode,documentByteLimit,documentGuard,matterGuard,visibleDocument} from './documents';

function counsel(actor:Actor){human(actor);need(actor,'owner','lawyer');}
function encode(bytes:Uint8Array){let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);}
async function sources(db:D1Database,actor:Actor,productionId:string){
 const links=await rows(db,'SELECT * FROM s_production_sources WHERE production_id=? ORDER BY document_id',productionId),documents=[];
 for(const link of links){const d=await visibleDocument(db,actor,link.document_id);insist(!d.erased_at,'Production source is unavailable',404);documents.push(d);}
 return documents;
}
async function load(db:D1Database,actor:Actor,productionId:string){
 counsel(actor);
 const p=await stmt(db,'SELECT * FROM s_document_productions WHERE id=?',productionId).first<Data>();
 insist(p,'Production not found',404);await matter(db,actor,p.matter_id);
 const documents=await sources(db,actor,p.id);return {p,documents};
}
function json(p:Data){const {artifact_base64,snapshot,...rest}=p;return {...rest,snapshot:snapshot?JSON.parse(snapshot):null};}
function guard(db:D1Database,p:Data){
 const fence=id();return [stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_productions WHERE id=? AND status=? AND exported_at IS ?) THEN 1 ELSE 0 END',fence,p.id,p.status,p.exported_at),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)];
}
export async function listProductions(db:D1Database,actor:Actor,matterId:string){
 counsel(actor);await matter(db,actor,matterId);
 const result=[];
 for(const p of await rows(db,'SELECT * FROM s_document_productions WHERE matter_id=? ORDER BY created_at DESC,id',matterId)){
  // An invisible private source hides the entire packet, including counts and recipients.
  try{await sources(db,actor,p.id);result.push({...json(p),shares:await listProductionShares(db,actor,p.id)});}catch(error){if((error as {status?:number}).status!==404)throw error;}
 }
 return result;
}
export async function prepareProduction(db:D1Database,actor:Actor,matterId:string,body:Data){
 counsel(actor);await matter(db,actor,matterId);
 insist(Array.isArray(body.items)&&body.items.length>0&&body.items.length<=20,'Select between 1 and 20 source documents');
 const prefix=text(body.batesPrefix,'Bates prefix',20);insist(/^[A-Z0-9-]+$/.test(prefix),'Use uppercase letters, digits and hyphens for the Bates prefix');
 let sequence=integer(body.batesStart,'First Bates number',1,99999999);
 const recipient={name:text(body.recipientName,'Intended recipient name',160),email:text(body.recipientEmail,'Intended recipient email',240).toLowerCase()};
 insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email),'Supply a recipient email');
 const documents:Data[]=[],items:Data[]=[],files:Record<string,Uint8Array>={},labels:string[]=[],seen=new Set<string>(),at=now(),productionId=id();
 for(const selected of body.items){
  insist(selected&&typeof selected==='object'&&!Array.isArray(selected),'Supply a source selection');
  const d=await visibleDocument(db,actor,text(selected.documentId,'Source document',100));
  insist(d.matter_id===matterId&&!d.erased_at,'Source document not found',404);
  insist(!seen.has(d.id),'Select each source once');seen.add(d.id);
  insist(selected.revision===d.revision,'A source changed. Review the selection again.',409);
  const version=integer(selected.version,'Source version',1);
  const v=await stmt(db,'SELECT * FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.id,version).first<Data>();
  insist(v,'Original version not found',404);const bytes=decode(v.content_base64);
  insist(bytes.length===v.size&&await digest(bytes)===v.sha256,'Original failed its integrity check',503);
  const holds=await rows(db,'SELECT id,reason,placed_at FROM s_holds WHERE matter_id=? AND (document_id IS NULL OR document_id=?) AND released_at IS NULL ORDER BY id',matterId,d.id);
  const privilege=text(selected.privilege,'Privilege label',120),withheld=selected.withheld===true;
  insist(Array.isArray(selected.redactedPages)&&selected.redactedPages.length<=500,'Supply the whole pages to redact');
  const redactedPages=[...new Set<number>(selected.redactedPages.map((n:unknown)=>integer(n,'Redacted page',1,500)))].sort((a,b)=>a-b);
  insist(!withheld||redactedPages.length===0,'Withheld documents do not have produced redacted pages');
  const reason=withheld||redactedPages.length?text(selected.reason,'Withholding or redaction reason',1000):'';
  const item:Data={documentId:d.id,title:d.title,version,sourceName:v.name,sourceSha256:v.sha256,privilege,withheld,reason,redactedPages,holds};
  if(!withheld){
   insist(v.mime==='application/pdf','This production door currently accepts PDF originals only');
   let original:PDFDocument;
   try{original=await PDFDocument.load(bytes);}catch{insist(false,'The source must be a readable, unencrypted PDF');}
   const pageCount=original.getPageCount();insist(pageCount>0&&pageCount<=500,'A source must have between 1 and 500 pages');
   insist(redactedPages.every(n=>n<=pageCount),'A redacted page is outside the source');
   const selective=redactedPages.length>0&&redactedPages.length<pageCount;
   const render=selected.renderedPages;
   if(selective){
    insist(render&&render.sourceSha256===v.sha256&&Array.isArray(render.pages),'Render the selected original to sanitized page images before selective redaction');
    const kept=Array.from({length:pageCount},(_,i)=>i+1).filter(n=>!redactedPages.includes(n));
    insist(render.pages.length===kept.length&&render.pages.every((p:Data,i:number)=>p.page===kept[i]),'Supply exactly the unredacted page images in source order');
   }
   insist(sequence+pageCount-1<=99999999,'Bates numbering exceeds eight digits');
   const output=await PDFDocument.create(),font=await output.embedFont(StandardFonts.Helvetica);
   output.setCreationDate(new Date(at));output.setModificationDate(new Date(at));
   const bates=(n:number)=>prefix+String(n).padStart(8,'0');
   item.firstBates=bates(sequence);item.pageCount=pageCount;
   for(let index=0;index<pageCount;index++){
    const sourcePage=original.getPage(index),{width,height}=sourcePage.getSize();
    insist(width>0&&height>0&&width<=14400&&height<=14400,'Unsupported source page dimensions');
    insist(labels.length<500,'A packet may contain at most 500 produced pages');
    const page=output.addPage([width,height+30]);
    if(redactedPages.includes(index+1)){
     // A fresh blank page contains no source content, resources, hidden text or attachments.
     page.drawRectangle({x:0,y:30,width,height,color:rgb(0,0,0)});
    }else if(selective){
     const imageBytes=decode(render.pages.find((p:Data)=>p.page===index+1).pngBase64);
     insist(imageBytes.length>=24&&imageBytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10','Sanitized pages must be PNG images');
     const header=new DataView(imageBytes.buffer,imageBytes.byteOffset,imageBytes.byteLength),w=header.getUint32(16),h=header.getUint32(20);
     insist(w>0&&h>0&&w*h<=16000000,'Sanitized page image dimensions are too large');
     let image;try{image=await output.embedPng(imageBytes);}catch{insist(false,'The sanitized page image is unreadable');}
     page.drawImage(image,{x:0,y:30,width,height});
    }else{const embedded=await output.embedPage(sourcePage);page.drawPage(embedded,{x:0,y:30,width,height});}
    const label=bates(sequence++);labels.push(label);page.drawText(label,{x:8,y:10,size:10,font});
   }
   item.lastBates=bates(sequence-1);const produced=await output.save();
   insist(produced.length<=documentByteLimit,'The produced PDF exceeds the current 1 MiB packet limit');
   item.file=String(items.length+1).padStart(3,'0')+'.pdf';item.producedSha256=await digest(produced);item.producedSize=produced.length;files[item.file]=produced;
  }
  documents.push(d);items.push(item);
 }
 insist(items.some(item=>!item.withheld),'Select at least one document to produce');
 const snapshot={id:productionId,matterId,createdAt:at,createdBy:actor.email,recipient,batesPrefix:prefix,items,scope:'Exact reviewed packet for one authenticated recipient only. No onward sharing. Hold and privilege labels remain attached.'};
 files['manifest.json']=strToU8(JSON.stringify(snapshot,null,2));
 files['privilege-log.json']=strToU8(JSON.stringify(items.filter(item=>item.withheld||item.redactedPages.length||item.privilege!=='None'),null,2));
 const artifact=zipSync(files,{level:6});
 insist(artifact.length<=documentByteLimit,'The complete production packet exceeds the current 1 MiB limit');
 const hash=await digest(artifact);
 await atomic(db,actor,[...matterGuard(db,actor,matterId),...documents.flatMap(d=>documentGuard(db,actor,d)),
  stmt(db,"INSERT INTO s_document_productions(id,matter_id,snapshot,artifact_base64,sha256,size,status,created_by,created_at) VALUES(?,?,?,?,?,?,'draft',?,?)",productionId,matterId,JSON.stringify(snapshot),encode(artifact),hash,artifact.length,actor.email,at),
  ...labels.map(label=>stmt(db,'INSERT INTO s_production_bates VALUES(?,?,?)',matterId,label,productionId)),
  ...items.map(item=>stmt(db,'INSERT INTO s_production_sources VALUES(?,?,?)',productionId,item.documentId,item.version)),
  audit(db,actor,'production.prepared',productionId,JSON.stringify({sha256:hash,sourceCount:items.length}),{matterId})]);
 return json((await load(db,actor,productionId)).p);
}
export async function productionAction(db:D1Database,actor:Actor,productionId:string,op:string,body:Data){
 const {p,documents}=await load(db,actor,productionId);
 insist(p.artifact_base64&&p.status!=='erased','Production was erased',410);
 const writes=[...matterGuard(db,actor,p.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),...guard(db,p)],at=now();
 if(op==='approve'){
  insist(p.status==='draft','Only a draft can be approved',409);
  insist(body.sha256===p.sha256,'Review the exact packet hash before approving',409);
  writes.push(stmt(db,"UPDATE s_document_productions SET status='approved',approved_by=?,approved_at=?,review_note=?,review_note_sha256=? WHERE id=?",actor.email,at,text(body.reviewNote,'Counsel review note',2000),await digest(text(body.reviewNote,'Counsel review note',2000)),p.id));
 }else if(op==='recall'){
  insist(['draft','approved'].includes(p.status)&&!p.exported_at,'Only a packet that has not been exported can be recalled',409);
  insist(!await stmt(db,'SELECT 1 FROM s_production_shares WHERE production_id=? AND opened_at IS NOT NULL',p.id).first(),'An opened recipient packet stays disclosed and cannot be recalled',409);
  const shareFence=id();writes.push(stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM s_production_shares WHERE production_id=? AND opened_at IS NOT NULL) THEN 1 ELSE 0 END',shareFence,p.id),stmt(db,'DELETE FROM s_guard WHERE id=?',shareFence));
  writes.push(stmt(db,"UPDATE s_document_productions SET status='recalled',recalled_by=?,recalled_at=?,recall_reason=?,recall_reason_sha256=? WHERE id=?",actor.email,at,text(body.reason,'Recall reason',1000),await digest(text(body.reason,'Recall reason',1000)),p.id));
 }else insist(false,'Unknown production action',404);
 writes.push(audit(db,actor,'production.'+(op==='approve'?'approved':'recalled'),p.id,JSON.stringify({sha256:p.sha256}),{matterId:p.matter_id}));
 await atomic(db,actor,writes);return json((await load(db,actor,p.id)).p);
}
export async function productionFile(db:D1Database,actor:Actor,productionId:string,preview=false){
 const {p,documents}=await load(db,actor,productionId);
 insist(p.artifact_base64&&['draft','approved'].includes(p.status),'Production is unavailable',410);
 insist(preview||p.status==='approved','Counsel must approve this exact packet before export',409);
 const bytes=decode(p.artifact_base64);insist(bytes.length===p.size&&await digest(bytes)===p.sha256,'Production failed its integrity check',503);
 const at=now();
 await atomic(db,actor,[...matterGuard(db,actor,p.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),...guard(db,p),
  ...(!preview&&!p.exported_at?[stmt(db,'UPDATE s_document_productions SET exported_at=? WHERE id=?',at,p.id)]:[]),
  audit(db,actor,preview?'production.previewed':'production.exported',p.id,JSON.stringify({sha256:p.sha256,size:p.size,scope:'Internal counsel download; not recipient delivery proof'}),{matterId:p.matter_id})]);
 return new Response(bytes,{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="production-${p.id}.zip"`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
}
export function eraseProductions(db:D1Database,documentId:string){
 return [stmt(db,"UPDATE s_document_productions SET snapshot=NULL,artifact_base64=NULL,status='erased',review_note=NULL,recall_reason=NULL WHERE id IN (SELECT production_id FROM s_production_sources WHERE document_id=?)",documentId)];
}
