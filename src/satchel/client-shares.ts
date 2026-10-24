// CLIENT-004 / CLIENT-001: shared client tasks, events, deadlines and documents. A share is an explicit, revocable decision by the principal or a lawyer;
// the portal door returns only shared records and exposes only acknowledge and (for a client task) mark done. It has
// no door that changes an event, a deadline or the firm's own task, so a confirmed court date cannot be altered here.
import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {portalAccess,readerKinds} from './portal';
import {decode} from './documents';
import {matterGuard} from './documents';
import {guard} from './trust-guards';
import {matterCalendar} from './appointments';
import {listTasks} from './tasks';
export async function shareWithClient(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');const m=await matter(db,actor,matterId),kind=String(body.kind);
 insist(['task','event','deadline','document'].includes(kind),'Share a task, event, confirmed deadline or document');
 const recordId=text(body.recordId,'Record',100),instructions=text(body.instructions,'Instructions for the client',2000);
 if(kind==='task'){const t=(await listTasks(db,actor,m.id)).find(x=>x.id===recordId);insist(t,'Task not found',404);insist(!t.legalDate,'A task tied to a legal deadline is the firm’s own and is never shared as a client task');insist(t.status==='open','Only an open task can be shared');}
 else if(kind==='document')insist(await stmt(db,"SELECT 1 FROM s_documents WHERE id=? AND matter_id=? AND visibility='matter' AND erased_at IS NULL AND current_version>0",recordId,m.id).first(),'Share only a matter-visible document that is on file',404);
 else{const c=await matterCalendar(db,actor,m.id);if(kind==='event')insist((c.appointments as Data[]).some(a=>a.id===recordId),'Event not found',404);else{const d=(c.deadlines as Data[]).find(x=>x.id===recordId);insist(d,'Deadline not found',404);insist(d.status==='confirmed','Share only a lawyer-confirmed deadline');}}
 const shareId=id(),at=now();
 await atomic(db,actor,[...matterGuard(db,actor,m.id),stmt(db,'INSERT INTO s_client_shares(id,matter_id,kind,record_id,instructions,shared_by,shared_at) VALUES(?,?,?,?,?,?,?)',shareId,m.id,kind,recordId,instructions,actor.email,at),audit(db,actor,'client.shared',shareId,JSON.stringify({kind,recordId}),{matterId:m.id})]);
 return clientShares(db,actor,m.id);
}
export async function revokeShare(db:D1Database,actor:Actor,shareId:string) {
 human(actor);need(actor,'owner','lawyer');const s=await stmt(db,'SELECT * FROM s_client_shares WHERE id=? AND revoked_at IS NULL',shareId).first<Data>();insist(s,'Active share not found',404);await matter(db,actor,s.matter_id);
 await atomic(db,actor,[...matterGuard(db,actor,s.matter_id),stmt(db,'UPDATE s_client_shares SET revoked_by=?,revoked_at=? WHERE id=? AND revoked_at IS NULL',actor.email,now(),s.id),audit(db,actor,'client.share_revoked',s.id,JSON.stringify({kind:s.kind,recordId:s.record_id}),{matterId:s.matter_id})]);
 return clientShares(db,actor,s.matter_id);
}
async function details(db:D1Database,actor:Actor,matterId:string) {
 const calendar=await matterCalendar(db,actor,matterId),tasks=await listTasks(db,actor,matterId);
 const documents=await rows(db,'SELECT id,title,current_version FROM s_documents WHERE matter_id=? AND erased_at IS NULL',matterId);
 return {tasks:new Map(tasks.map(t=>[t.id,t])),events:new Map((calendar.appointments as Data[]).map(a=>[a.id,a])),deadlines:new Map((calendar.deadlines as Data[]).map(d=>[d.id,d])),documents:new Map(documents.map(x=>[x.id,x]))};
}
export async function clientShares(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(db,actor,matterId),d=await details(db,actor,m.id);
 const shares=await rows(db,'SELECT * FROM s_client_shares WHERE matter_id=? ORDER BY shared_at DESC,id',m.id),acks=shares.length?await rows(db,`SELECT * FROM s_client_acks WHERE share_id IN (${shares.map(()=>'?').join(',')}) ORDER BY at,id`,...shares.map(s=>s.id)):[];
 return {shares:shares.map(s=>({id:s.id,kind:s.kind,recordId:s.record_id,title:(d.tasks.get(s.record_id)??d.events.get(s.record_id)??d.deadlines.get(s.record_id)??d.documents.get(s.record_id))?.title??'Unavailable record',instructions:s.instructions,sharedBy:s.shared_by,sharedAt:s.shared_at,revokedAt:s.revoked_at,acks:acks.filter(a=>a.share_id===s.id).map(a=>({kind:a.kind,by:a.client_email,note:a.note,at:a.at}))}))};
}
export async function portalShares(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'client');insist(await stmt(db,`SELECT ${portalAccess('?',readerKinds)} ok`,actor.email,matterId).first<Data>().then(r=>r?.ok),'Matter not found',404);
 // The portal grant above is the authority. The task and calendar readers take a staff-shaped actor; only records the
 // matter's lawyer shared are ever returned from what they load.
 const staff={...actor,role:'owner'} as Actor,d=await details(db,staff,matterId);
 const shares=await rows(db,'SELECT * FROM s_client_shares WHERE matter_id=? AND revoked_at IS NULL ORDER BY shared_at,id',matterId),acks=await rows(db,'SELECT * FROM s_client_acks WHERE client_email=? AND share_id IN (SELECT id FROM s_client_shares WHERE matter_id=?)',actor.email,matterId);
 return {matterId,items:shares.flatMap((s):Data[]=>{
  const mine=(k:string)=>acks.find(a=>a.share_id===s.id&&a.kind===k)?.at??null,base={id:s.id,kind:s.kind,instructions:s.instructions,acknowledgedAt:mine('acknowledged'),completedAt:mine('completed')};
  if(s.kind==='task'){const t=d.tasks.get(s.record_id);return t?[{...base,title:t.title,dueDate:t.dueDate,canComplete:!mine('completed')}]:[];}
  if(s.kind==='event'){const a=d.events.get(s.record_id),o=(a?.occurrences as Data[]|undefined)?.filter(x=>x.status!=='cancelled'&&Date.parse(x.end)>Date.now());return a&&o?.length?[{...base,title:a.title,timezone:a.timezone,location:a.location,videoUrl:a.videoUrl,occurrences:o.map(x=>({date:x.date,time:x.time,start:x.start,end:x.end,status:x.status})),canComplete:false}]:[];}
  if(s.kind==='document'){const doc=d.documents.get(s.record_id);return doc?[{...base,title:doc.title,fileUrl:'/api/satchel/portal/shares/'+s.id+'/file',canComplete:false}]:[];}
  const dl=d.deadlines.get(s.record_id);return dl&&dl.status==='confirmed'?[{...base,title:dl.title,date:dl.date,timezone:dl.timezone,canComplete:false}]:[];
 })};
}
async function mine(db:D1Database,actor:Actor,shareId:string) {
 human(actor);need(actor,'client');const s=await stmt(db,`SELECT * FROM s_client_shares s WHERE s.id=? AND s.revoked_at IS NULL AND ${portalAccess('s.matter_id',readerKinds)}`,shareId,actor.email).first<Data>();insist(s,'Item not found',404);return s;
}
async function record(db:D1Database,actor:Actor,shareId:string,kind:'acknowledged'|'completed',body:Data) {
 const s=await mine(db,actor,shareId);
 if(kind==='completed')insist(s.kind==='task','Only a client task can be marked done here; the firm keeps its dates and deadlines',400);
 const note=body.note===undefined||body.note===''?'':text(body.note,'Note',1000),at=now();
 try{await atomic(db,actor,[guard(db,`EXISTS(SELECT 1 FROM s_client_shares s WHERE s.id=? AND s.revoked_at IS NULL AND ${portalAccess('s.matter_id',readerKinds)})`,s.id,actor.email),stmt(db,'INSERT INTO s_client_acks(id,share_id,kind,client_email,note,at) VALUES(?,?,?,?,?,?)',id(),s.id,kind,actor.email,note,at),audit(db,actor,'client.'+(kind==='completed'?'task_completed':'acknowledged'),s.id,JSON.stringify({kind:s.kind,recordId:s.record_id,note}),{matterId:s.matter_id})]);}
 catch(e){if(/UNIQUE|constraint/i.test(String(e)))insist(false,'You already recorded this',409);throw e;}
 return portalShares(db,actor,s.matter_id);
}
export const acknowledgeShare=(db:D1Database,actor:Actor,shareId:string,body:Data)=>record(db,actor,shareId,'acknowledged',body);
export const completeShare=(db:D1Database,actor:Actor,shareId:string,body:Data)=>record(db,actor,shareId,'completed',body);

// The shared document's current original, with an integrity check, to a client reader of that matter and no one else.
export async function portalFile(db:D1Database,actor:Actor,shareId:string) {
 const s=await mine(db,actor,shareId);insist(s.kind==='document','Item not found',404);
 const v=await stmt(db,'SELECT v.* FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.id=? AND d.matter_id=? AND d.visibility=\'matter\' AND d.erased_at IS NULL AND v.version=d.current_version AND v.content_base64 IS NOT NULL',s.record_id,s.matter_id).first<Data>();insist(v,'Item not found',404);
 const bytes=decode(v.content_base64);insist(bytes.length===v.size&&await digest(bytes)===v.sha256,'Stored original failed its integrity check',503);
 await db.batch([audit(db,actor,'client.file_downloaded',s.id,JSON.stringify({documentId:s.record_id,version:v.version,sha256:v.sha256}),{matterId:s.matter_id})]);
 const filename=encodeURIComponent(v.name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(bytes,{headers:{'content-type':v.mime,'content-length':String(bytes.length),'content-disposition':`attachment; filename*=UTF-8''${filename}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'; base-uri 'none'",'referrer-policy':'no-referrer'}});
}
// A payer's door: issued invoices for the matter and nothing else. Clients and co-clients see the same list; delegates do not.
export async function portalInvoices(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'client');insist(await stmt(db,`SELECT ${portalAccess('?',['client','co_client','payer'])} ok`,actor.email,matterId).first<Data>().then(r=>r?.ok),'Matter not found',404);
 const list=await rows(db,"SELECT b.id,i.number,i.issued_at,b.status,json_extract(b.snapshot,'$.totalCents') total FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE b.matter_id=? AND b.status<>'void' ORDER BY i.issued_at,i.number",matterId);
 return {matterId,invoices:list.map(b=>({id:b.id,number:b.number,issuedAt:b.issued_at,totalCents:b.total,status:b.status,pdfUrl:'/api/satchel/portal/invoices/'+b.id+'/pdf'}))};
}
export async function portalInvoicePdf(db:D1Database,actor:Actor,billId:string) {
 human(actor);need(actor,'client');
 const row=await stmt(db,`SELECT i.pdf_base64,i.number,i.pdf_digest FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE i.bill_id=? AND b.status<>'void' AND ${portalAccess('b.matter_id',['client','co_client','payer'])}`,billId,actor.email).first<Data>();insist(row,'Invoice not found',404);
 const bytes=decode(row.pdf_base64);insist(await digest(bytes)===row.pdf_digest,'Stored invoice failed its integrity check',503);
 await db.batch([audit(db,actor,'client.invoice_downloaded',billId,JSON.stringify({number:row.number}))]);
 return new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length),'content-disposition':`attachment; filename="${String(row.number).replace(/[^A-Za-z0-9._-]/g,'_')}.pdf"`,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
