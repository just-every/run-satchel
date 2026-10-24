// CLIENT-002: retained two-way messages between the firm and a matter's portal readers. A client reads only threads of a
// matter they hold a reader grant on (client, co-client, delegate; never a payer), opens content only inside the
// authenticated portal, and the notification email carries no message content.
import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterGuard,decode,mediaType} from './documents';
import {portalAccess,readerKinds} from './portal';
import {guard} from './trust-guards';
import {matterScope} from './matter-scope';
import {reviewOf} from './providers';
const system={id:'portal-notifications',email:'portal',role:'system',channel:'automation'} as any;
async function attachments(body:Data) {
 const list=body.attachments===undefined?[]:body.attachments;insist(Array.isArray(list)&&list.length<=3,'Attach at most three files');
 return Promise.all(list.map(async(a:Data)=>{const bytes=decode(a.contentBase64);return {id:id(),name:text(a.name,'File name',200),mime:mediaType(bytes),size:bytes.length,sha256:await digest(bytes),content:a.contentBase64 as string};}));
}
// Assignments and notifications require current staff authority, including ethical walls and exclusions.
const staffAccess=()=>`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members member ON member.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR (member.active=1 AND member.role IN('lawyer','assistant'))) AND EXISTS(SELECT 1 FROM s_matters staff_matter WHERE staff_matter.id=? AND ${matterScope('staff_matter.id').replace('SELECT ? AS role,? AS email',"SELECT CASE WHEN o.role='owner' THEN 'owner' ELSE member.role END AS role,o.email AS email")}))`;
async function readers(db:D1Database,matterId:string) {
 return (await rows(db,`SELECT DISTINCT candidate.email FROM s_portal_grants candidate WHERE candidate.matter_id=? AND ${portalAccess('candidate.matter_id',readerKinds).replace('g.email=?','g.email=candidate.email')} ORDER BY candidate.email`,matterId)).map(r=>r.email as string);
}
async function notify(env:Bindings,messageId:string,recipients:string[],subjectKind:'client'|'staff') {
 const db=env.DB,at=now(),mail=operatorMail(env),firm=(await stmt(db,'SELECT name FROM s_firm WHERE id=1').first<Data>())?.name??'your firm',authority=await reviewOf(db,'mail');
 for(const to of recipients){
  let status='not_sent',provider:string|null=null,providerId:string|null=null,detail='No notification was sent: the firm has not recorded its mail provider review';
  const allowed=await stmt(db,`SELECT ${subjectKind==='client'?portalAccess('?',readerKinds):staffAccess()+" AND EXISTS(SELECT 1 FROM s_portal_messages message JOIN s_portal_threads thread ON thread.id=message.thread_id WHERE message.id=? AND thread.assigned_to=?)"} ok`,to,(await stmt(db,'SELECT t.matter_id FROM s_portal_messages m JOIN s_portal_threads t ON t.id=m.thread_id WHERE m.id=?',messageId).first<Data>())?.matter_id,...(subjectKind==='staff'?[messageId,to]:[])).first<Data>();
  if(!allowed?.ok)detail='No notification was sent: the recipient no longer has access to this matter';
  else if(authority&&mail&&env.MAIL_FROM){
   try{const r=await mail.send({deliveryId:id(),from:env.MAIL_FROM,to:[to],subject:subjectKind==='client'?`A new secure message from ${firm}`:'A new portal message',text:`You have a new secure message. Sign in to read it: ${env.AUTH_ORIGIN}/app\n\nThis email contains no message content.`,html:'',headers:{}});
    status=r.status==='accepted'||r.status==='development'?'accepted':r.status==='uncertain'?'uncertain':'failed';provider=r.provider;providerId=r.providerMessageId??null;detail=status==='accepted'?'Provider accepted the notification; mailbox delivery is unconfirmed.':`Provider result: ${r.status}`;}
   catch{status='uncertain';detail='The provider outcome is uncertain; no automatic resend.';}
  }else if(allowed?.ok&&authority)detail='The firm mail provider or sender is not configured';
  await db.batch([stmt(db,'INSERT INTO s_portal_notifications(id,message_id,recipient,status,provider,provider_id,detail,at) VALUES(?,?,?,?,?,?,?,?)',id(),messageId,to,status,provider,providerId,detail,at),audit(db,system,'portal.notified',messageId,JSON.stringify({recipient:to,status}))]);
 }
}
const messageJson=(m:Data,files:Data[],reads:Data[],notes:Data[])=>({id:m.id,from:m.sender_email,side:m.sender_side,body:m.body,at:m.created_at,attachments:files.filter(f=>f.message_id===m.id).map(f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,sha256:f.sha256})),readBy:reads.filter(r=>r.message_id===m.id).map(r=>({by:r.reader_email,at:r.read_at})),notifications:notes.filter(n=>n.message_id===m.id).map(n=>({to:n.recipient,status:n.status,detail:n.detail}))});
async function load(db:D1Database,threadIds:string[]) {
 if(!threadIds.length)return {messages:[] as Data[],files:[] as Data[],reads:[] as Data[],notes:[] as Data[]};
 const marks=threadIds.map(()=>'?').join(','),messages=await rows(db,`SELECT * FROM s_portal_messages WHERE thread_id IN (${marks}) ORDER BY created_at,id`,...threadIds),ids=messages.map(m=>m.id),m2=ids.map(()=>'?').join(',');
 return {messages,files:ids.length?await rows(db,`SELECT id,message_id,name,mime,size,sha256 FROM s_portal_attachments WHERE message_id IN (${m2})`,...ids):[],reads:ids.length?await rows(db,`SELECT * FROM s_portal_reads WHERE message_id IN (${m2})`,...ids):[],notes:ids.length?await rows(db,`SELECT * FROM s_portal_notifications WHERE message_id IN (${m2}) ORDER BY at,id`,...ids):[]};
}
async function threadsFor(db:D1Database,where:string,...params:unknown[]) {
 const threads=await rows(db,`SELECT * FROM s_portal_threads t WHERE ${where} ORDER BY t.created_at DESC,t.id`,...params),data=await load(db,threads.map(t=>t.id));
 return {threads:threads.map(t=>({id:t.id,matterId:t.matter_id,subject:t.subject,assignedTo:t.assigned_to,createdBy:t.created_by,createdAt:t.created_at,messages:data.messages.filter(m=>m.thread_id===t.id).map(m=>messageJson(m,data.files,data.reads,data.notes))}))};
}
async function post(env:Bindings,actor:Actor,threadId:string|null,matterId:string,subject:string|null,assignedTo:string|null,body:Data,side:'staff'|'client') {
 const text_=text(body.body,'Message',20000),files=await attachments(body),at=now(),messageId=id(),thread=threadId??id();
 const writes=[...(threadId?[]:[stmt(env.DB,'INSERT INTO s_portal_threads(id,matter_id,subject,assigned_to,created_by,created_at) VALUES(?,?,?,?,?,?)',thread,matterId,subject!,assignedTo!,actor.email,at)]),
  stmt(env.DB,'INSERT INTO s_portal_messages(id,thread_id,sender_email,sender_side,body,created_at) VALUES(?,?,?,?,?,?)',messageId,thread,actor.email,side,text_,at),
  ...files.map(f=>stmt(env.DB,'INSERT INTO s_portal_attachments(id,message_id,name,mime,size,sha256,content_base64) VALUES(?,?,?,?,?,?,?)',f.id,messageId,f.name,f.mime,f.size,f.sha256,f.content)),
  audit(env.DB,actor,'portal.message_sent',messageId,JSON.stringify({threadId:thread,matterId,side,attachments:files.map(f=>({name:f.name,sha256:f.sha256}))}),{matterId})];
 return {thread,messageId,writes};
}
export async function startThread(env:Bindings,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(env.DB,actor,matterId),to=await readers(env.DB,m.id);insist(to.length>0,'No client has portal access to this matter',409);
 const assigned=body.assignedTo?text(body.assignedTo,'Assigned staff',254).toLowerCase():actor.email;
 insist((await stmt(env.DB,`SELECT ${staffAccess()} ok`,assigned,m.id).first<Data>())?.ok,'Assign the thread to active staff who can see this matter');
 const p=await post(env,actor,null,m.id,text(body.subject,'Subject',200),assigned,body,'staff');
 await atomic(env.DB,actor,[...matterGuard(env.DB,actor,m.id),guard(env.DB,staffAccess(),assigned,m.id),...p.writes]);await notify(env,p.messageId,to,'client');
 return staffThreads(env.DB,actor,m.id);
}
export async function staffReply(env:Bindings,actor:Actor,threadId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer','assistant');const t=await stmt(env.DB,'SELECT * FROM s_portal_threads WHERE id=?',threadId).first<Data>();insist(t,'Thread not found',404);const m=await matter(env.DB,actor,t.matter_id),to=await readers(env.DB,m.id);insist(to.length>0,'No client has portal access to this matter',409);
 insist(actor.role!=='assistant'||t.assigned_to===actor.email||t.created_by===actor.email,'Thread not found',404);
 const p=await post(env,actor,t.id,m.id,null,null,body,'staff');await atomic(env.DB,actor,[...matterGuard(env.DB,actor,m.id),...p.writes]);await notify(env,p.messageId,to,'client');
 return staffThreads(env.DB,actor,m.id);
}
export async function assignThread(db:D1Database,actor:Actor,threadId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');const t=await stmt(db,'SELECT * FROM s_portal_threads WHERE id=?',threadId).first<Data>();insist(t,'Thread not found',404);await matter(db,actor,t.matter_id);
 const to=text(body.assignedTo,'Assigned staff',254).toLowerCase();insist((await stmt(db,`SELECT ${staffAccess()} ok`,to,t.matter_id).first<Data>())?.ok,'Assign the thread to active staff who can see this matter');
 await atomic(db,actor,[...matterGuard(db,actor,t.matter_id),guard(db,staffAccess(),to,t.matter_id),stmt(db,'UPDATE s_portal_threads SET assigned_to=? WHERE id=?',to,t.id),audit(db,actor,'portal.thread_assigned',t.id,JSON.stringify({from:t.assigned_to,to}),{matterId:t.matter_id})]);
 return staffThreads(db,actor,t.matter_id);
}
export async function staffThreads(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(db,actor,matterId);
 const result=await threadsFor(db,'t.matter_id=? AND (?<>\'assistant\' OR t.assigned_to=? OR t.created_by=?)',m.id,actor.role,actor.email,actor.email);
 return {threads:result.threads.map(t=>({...t,unread:t.messages.filter((x:Data)=>x.side==='client'&&!x.readBy.some((r:Data)=>r.by===actor.email)).length}))};
}
export async function staffRead(db:D1Database,actor:Actor,threadId:string) {
 human(actor);need(actor,'owner','lawyer','assistant');const t=await stmt(db,'SELECT * FROM s_portal_threads WHERE id=?',threadId).first<Data>();insist(t,'Thread not found',404);await matter(db,actor,t.matter_id);
 insist(actor.role!=='assistant'||t.assigned_to===actor.email||t.created_by===actor.email,'Thread not found',404);
 const unread=await rows(db,"SELECT m.id FROM s_portal_messages m WHERE m.thread_id=? AND m.sender_side='client' AND NOT EXISTS(SELECT 1 FROM s_portal_reads r WHERE r.message_id=m.id AND r.reader_email=?)",t.id,actor.email),at=now();
 if(unread.length)await atomic(db,actor,[...matterGuard(db,actor,t.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_portal_threads WHERE id=? AND (?<>'assistant' OR assigned_to=? OR created_by=?))",t.id,actor.role,actor.email,actor.email),...unread.flatMap(u=>[stmt(db,'INSERT OR IGNORE INTO s_portal_reads(message_id,reader_email,read_at) VALUES(?,?,?)',u.id,actor.email,at),audit(db,actor,'portal.message_read',u.id,JSON.stringify({threadId:t.id}),{matterId:t.matter_id})])]);
 return staffThreads(db,actor,t.matter_id);
}
// The staff unread queue: client messages nobody on the thread's staff has opened, for threads assigned to the reader.
export async function unreadQueue(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner','lawyer','assistant');
 const list=await rows(db,"SELECT t.id,t.subject,t.matter_id,m.matter_number,COUNT(x.id) unread,MAX(x.created_at) latest FROM s_portal_threads t JOIN s_matters m ON m.id=t.matter_id JOIN s_portal_messages x ON x.thread_id=t.id AND x.sender_side='client' WHERE t.assigned_to=? AND NOT EXISTS(SELECT 1 FROM s_portal_reads r WHERE r.message_id=x.id AND r.reader_email=?) GROUP BY t.id ORDER BY latest DESC",actor.email,actor.email);
 const out=[];for(const t of list){try{await matter(db,actor,t.matter_id);out.push({threadId:t.id,subject:t.subject,matterId:t.matter_id,matterNumber:t.matter_number,unread:t.unread,latest:t.latest});}catch{}}
 return {queue:out};
}
// Portal side.
const grantedReader=(matterSql:string)=>portalAccess(matterSql,readerKinds);
export async function portalThreads(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'client');insist(await stmt(db,`SELECT ${grantedReader('?')} ok`,actor.email,matterId).first<Data>().then(r=>r?.ok),'Matter not found',404);
 const result=await threadsFor(db,'t.matter_id=?',matterId);
 return {threads:result.threads.map(t=>({id:t.id,subject:t.subject,createdAt:t.createdAt,unread:t.messages.filter((x:Data)=>x.side==='staff'&&!x.readBy.some((r:Data)=>r.by===actor.email)).length,messages:t.messages.map((x:Data)=>({id:x.id,from:x.from,side:x.side,body:x.body,at:x.at,attachments:x.attachments,readByYou:x.readBy.some((r:Data)=>r.by===actor.email)}))}))};
}
async function readerThread(db:D1Database,actor:Actor,threadId:string) {
 human(actor);need(actor,'client');const t=await stmt(db,`SELECT t.* FROM s_portal_threads t WHERE t.id=? AND ${grantedReader('t.matter_id')}`,threadId,actor.email).first<Data>();insist(t,'Thread not found',404);return t;
}
export async function portalOpen(db:D1Database,actor:Actor,threadId:string) {
 const t=await readerThread(db,actor,threadId),unread=await rows(db,"SELECT m.id FROM s_portal_messages m WHERE m.thread_id=? AND m.sender_side='staff' AND NOT EXISTS(SELECT 1 FROM s_portal_reads r WHERE r.message_id=m.id AND r.reader_email=?)",t.id,actor.email),at=now();
 if(unread.length)await atomic(db,actor,[guard(db,grantedReader('?'),actor.email,t.matter_id),...unread.flatMap(u=>[stmt(db,'INSERT OR IGNORE INTO s_portal_reads(message_id,reader_email,read_at) VALUES(?,?,?)',u.id,actor.email,at),audit(db,actor,'portal.message_read',u.id,JSON.stringify({threadId:t.id}),{matterId:t.matter_id})])]);
 return portalThreads(db,actor,t.matter_id);
}
export async function portalReply(env:Bindings,actor:Actor,threadId:string,body:Data) {
 const t=await readerThread(env.DB,actor,threadId),p=await post(env,actor,t.id,t.matter_id,null,null,body,'client');
 await atomic(env.DB,actor,[guard(env.DB,grantedReader('?'),actor.email,t.matter_id),...p.writes]);
 await notify(env,p.messageId,[t.assigned_to],'staff');
 return portalThreads(env.DB,actor,t.matter_id);
}
export async function attachmentFile(db:D1Database,actor:Actor,attachmentId:string,side:'staff'|'client') {
 human(actor);let a:Data|null;
 if(side==='client'){need(actor,'client');a=await stmt(db,`SELECT a.*,t.matter_id FROM s_portal_attachments a JOIN s_portal_messages m ON m.id=a.message_id JOIN s_portal_threads t ON t.id=m.thread_id WHERE a.id=? AND ${grantedReader('t.matter_id')}`,attachmentId,actor.email).first<Data>();}
 else{need(actor,'owner','lawyer','assistant');a=await stmt(db,'SELECT a.*,t.matter_id,t.assigned_to,t.created_by FROM s_portal_attachments a JOIN s_portal_messages m ON m.id=a.message_id JOIN s_portal_threads t ON t.id=m.thread_id WHERE a.id=?',attachmentId).first<Data>();if(a)await matter(db,actor,a.matter_id);if(a&&actor.role==='assistant'&&a.assigned_to!==actor.email&&a.created_by!==actor.email)a=null;}
 insist(a,'Attachment not found',404);const bytes=decode(a.content_base64);insist(bytes.length===a.size&&await digest(bytes)===a.sha256,'Stored attachment failed its integrity check',503);
 await db.batch([audit(db,actor,'portal.attachment_downloaded',a.id,JSON.stringify({name:a.name,sha256:a.sha256}),{matterId:a.matter_id})]);
 const filename=encodeURIComponent(a.name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(bytes,{headers:{'content-type':a.mime,'content-length':String(bytes.length),'content-disposition':`attachment; filename*=UTF-8''${filename}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'; base-uri 'none'",'referrer-policy':'no-referrer'}});
}
