// CLIENT-003: chase a document request to receipt. Staff ask for a specific record with instructions, an owner, a due
// date and acceptance criteria; the matter's portal readers upload; counsel accepts exactly one upload (filing it as
// the matter's retained original and closing that request) or explains the deficiency. Other requests stay open.
import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,date,type Actor,type Data} from './model';
import {matterGuard,decode,mediaType,saveDocument} from './documents';
import {portalAccess,readerKinds} from './portal';
import {guard} from './trust-guards';
const requestJson=(q:Data,uploads:Data[],notes:Data[])=>({id:q.id,matterId:q.matter_id,title:q.title,instructions:q.instructions,criteria:q.criteria,owner:q.owner_email,dueDate:q.due_date,status:q.status,clientVisible:Boolean(q.client_visible),documentId:q.document_id,receivedAt:q.received_at,
 uploads:uploads.filter(u=>u.request_id===q.id).map(u=>({id:u.id,by:u.uploader_email,name:u.name,mime:u.mime,size:u.size,sha256:u.sha256,at:u.uploaded_at,review:u.review,reviewNote:u.review_note,reviewedBy:u.reviewed_by})),
 notes:notes.filter(n=>n.request_id===q.id).map(n=>({id:n.id,uploadId:n.upload_id,side:n.side,by:n.author_email,body:n.body,at:n.at}))});
async function bundle(db:D1Database,matterId:string,onlyVisible:boolean) {
 const list=await rows(db,`SELECT * FROM s_document_requests WHERE matter_id=? ${onlyVisible?'AND client_visible=1':''} ORDER BY created_at,id`,matterId),ids=list.map(q=>q.id),marks=ids.map(()=>'?').join(',');
 const uploads=ids.length?await rows(db,`SELECT id,request_id,uploader_email,name,mime,size,sha256,uploaded_at,review,review_note,reviewed_by FROM s_request_uploads WHERE request_id IN (${marks}) ORDER BY uploaded_at,id`,...ids):[],notes=ids.length?await rows(db,`SELECT * FROM s_request_notes WHERE request_id IN (${marks}) ORDER BY at,id`,...ids):[];
 return list.map(q=>requestJson(q,uploads,notes));
}
export async function requestState(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(db,actor,matterId);return {requests:await bundle(db,m.id,false)};
}
export async function createRequest(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(db,actor,matterId),requestId=id(),at=now();
 const owner=body.owner?text(body.owner,'Owner',254).toLowerCase():actor.email;insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1 AND role IN('lawyer','assistant') UNION SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active'",owner,owner).first(),'Choose an active lawyer, assistant or the principal as owner');
 await atomic(db,actor,[...matterGuard(db,actor,m.id),stmt(db,"INSERT INTO s_document_requests(id,matter_id,title,due_date,status,created_by,created_at,instructions,owner_email,criteria,client_visible) VALUES(?,?,?,?,'open',?,?,?,?,?,?)",requestId,m.id,text(body.title,'Requested record',200),body.dueDate?date(body.dueDate):null,actor.email,at,text(body.instructions,'Instructions for the client',2000),owner,text(body.criteria,'Acceptance criteria',2000),body.clientVisible===true?1:0),audit(db,actor,'document_request.created',requestId,JSON.stringify({matterId:m.id,owner,clientVisible:body.clientVisible===true}),{matterId:m.id})]);
 return requestState(db,actor,m.id);
}
export async function addNote(db:D1Database,actor:Actor,requestId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer','assistant');const q=await stmt(db,'SELECT * FROM s_document_requests WHERE id=?',requestId).first<Data>();insist(q,'Request not found',404);await matter(db,actor,q.matter_id);insist(q.client_visible,'Share the request with the client before writing to them',409);
 await atomic(db,actor,[...matterGuard(db,actor,q.matter_id),stmt(db,'INSERT INTO s_request_notes(id,request_id,upload_id,side,author_email,body,at) VALUES(?,?,?,?,?,?,?)',id(),q.id,body.uploadId?text(body.uploadId,'Upload',100):null,'staff',actor.email,text(body.body,'Clarification',2000),now()),audit(db,actor,'document_request.clarified',q.id,'{}',{matterId:q.matter_id})]);
 return requestState(db,actor,q.matter_id);
}
export async function reviewUpload(db:D1Database,actor:Actor,requestId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');const q=await stmt(db,'SELECT * FROM s_document_requests WHERE id=?',requestId).first<Data>();insist(q,'Request not found',404);const m=await matter(db,actor,q.matter_id);
 insist(q.status==='open','This request is already received',409);
 const u=await stmt(db,"SELECT * FROM s_request_uploads WHERE id=? AND request_id=? AND review='submitted'",text(body.uploadId,'Upload',100),q.id).first<Data>();insist(u,'Submitted upload not found',404);
 const note=body.note===undefined||body.note===''?'':text(body.note,'Note',2000),at=now();
 if(body.decision==='deficient'){
  insist(note,'Explain what is missing so the client can correct it');
  await atomic(db,actor,[...matterGuard(db,actor,m.id),stmt(db,"UPDATE s_request_uploads SET review='deficient',reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND review='submitted'",actor.email,at,note,u.id),stmt(db,'INSERT INTO s_request_notes(id,request_id,upload_id,side,author_email,body,at) VALUES(?,?,?,?,?,?,?)',id(),q.id,u.id,'staff',actor.email,note,at),audit(db,actor,'document_request.deficient',q.id,JSON.stringify({uploadId:u.id,note}),{matterId:m.id})]);
 }else{
  insist(body.decision==='accept','Choose accept or deficient');
  const doc=await saveDocument(db,actor,m.id,{name:u.name,mime:u.mime,contentBase64:u.content_base64,visibility:'matter'});
  await atomic(db,actor,[...matterGuard(db,actor,m.id),guard(db,"EXISTS(SELECT 1 FROM s_document_requests WHERE id=? AND status='open') AND EXISTS(SELECT 1 FROM s_request_uploads WHERE id=? AND review='submitted')",q.id,u.id),
   stmt(db,"UPDATE s_request_uploads SET review='accepted',reviewed_by=?,reviewed_at=?,review_note=?,document_id=? WHERE id=? AND review='submitted'",actor.email,at,note,doc.id,u.id),
   stmt(db,"UPDATE s_document_requests SET status='received',document_id=?,received_by=?,received_at=? WHERE id=? AND status='open'",doc.id,actor.email,at,q.id),audit(db,actor,'document_request.accepted',q.id,JSON.stringify({uploadId:u.id,documentId:doc.id,sha256:u.sha256}),{matterId:m.id})]);
 }
 return requestState(db,actor,m.id);
}
// Portal side: a matter's readers (never a payer) see requests shared with them and upload originals.
async function reader(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'client');insist(await stmt(db,`SELECT ${portalAccess('?',readerKinds)} ok`,actor.email,matterId).first<Data>().then(r=>r?.ok),'Matter not found',404);
}
export async function portalRequests(db:D1Database,actor:Actor,matterId:string) {await reader(db,actor,matterId);return {requests:await bundle(db,matterId,true)};}
async function visible(db:D1Database,actor:Actor,requestId:string) {
 human(actor);need(actor,'client');const q=await stmt(db,`SELECT q.* FROM s_document_requests q WHERE q.id=? AND q.client_visible=1 AND ${portalAccess('q.matter_id',readerKinds)}`,requestId,actor.email).first<Data>();insist(q,'Request not found',404);return q;
}
export async function portalUpload(db:D1Database,actor:Actor,requestId:string,body:Data) {
 const q=await visible(db,actor,requestId);insist(q.status==='open','This request is already received',409);
 const bytes=decode(body.contentBase64),name=text(body.name,'File name',200),sha=await digest(bytes),at=now();
 insist((await stmt(db,"SELECT COUNT(*) n FROM s_request_uploads WHERE request_id=?",q.id).first<Data>())!.n<10,'This request already has ten uploads; ask the firm to continue',409);
 await db.batch([guard(db,"EXISTS(SELECT 1 FROM s_document_requests WHERE id=? AND status='open' AND client_visible=1)",q.id),guard(db,portalAccess('?',readerKinds),actor.email,q.matter_id),
  stmt(db,'INSERT INTO s_request_uploads(id,request_id,uploader_email,name,mime,size,sha256,content_base64,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?)',id(),q.id,actor.email,name,mediaType(bytes),bytes.length,sha,body.contentBase64,at),audit(db,actor,'document_request.uploaded',q.id,JSON.stringify({name,sha256:sha,size:bytes.length}),{matterId:q.matter_id})]);
 return portalRequests(db,actor,q.matter_id);
}
export async function portalNote(db:D1Database,actor:Actor,requestId:string,body:Data) {
 const q=await visible(db,actor,requestId);
 await db.batch([stmt(db,'INSERT INTO s_request_notes(id,request_id,upload_id,side,author_email,body,at) VALUES(?,?,?,?,?,?,?)',id(),q.id,null,'client',actor.email,text(body.body,'Message',2000),now()),audit(db,actor,'document_request.client_note',q.id,'{}',{matterId:q.matter_id})]);
 return portalRequests(db,actor,q.matter_id);
}
