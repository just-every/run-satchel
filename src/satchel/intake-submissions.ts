import type {Bindings} from '../auth.server';
import {audit,date,digest,Fault,id,insist,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {activeIntakeAssigneeSql,type IntakeQuestion} from './intake-forms';
import {recoverIntakeUploads,removeStagedIntakeFiles,stageIntakeFiles,visibleIntakeLeadPath,type StagedIntakeFile} from './intake-files';

const totalLimit=32*1024*1024;
const publicActor={id:'system:public-intake',email:'system:public-intake',role:'system',channel:'system'};
export async function purgeIntakeSecurity(db:D1Database,at=now()){
 await db.batch([stmt(db,'DELETE FROM s_intake_tokens WHERE expires_at<=?',at),stmt(db,'DELETE FROM s_intake_rate_limits WHERE expires_at<=?',at)]);
}
async function publishedForm(db:D1Database,formId:string){
 const form=await stmt(db,'SELECT * FROM s_intake_forms WHERE id=? AND published=1',text(formId,'Form',100)).first<Data>();
 insist(form,'Intake form not found',404);return form;
}
export async function publicIntake(env:Bindings,formId:string){
 const form=await publishedForm(env.DB,formId),snapshot=JSON.parse(form.snapshot),at=now();
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),expiresAt=new Date(Date.now()+20*60*1000).toISOString();
 await Promise.all([purgeIntakeSecurity(env.DB,at),recoverIntakeUploads(env,at)]);
 await env.DB.batch([guard(env.DB,'EXISTS(SELECT 1 FROM s_intake_forms WHERE id=? AND published=1 AND revision=?)',form.id,form.revision),stmt(env.DB,'INSERT INTO s_intake_tokens(token_hash,form_id,revision,expires_at) VALUES(?,?,?,?)',await digest(token),form.id,form.revision,expiresAt)]);
 const {assignedEmail:_,...publicSnapshot}=snapshot;
 return {...publicSnapshot,id:form.id,revision:form.revision,version:form.version,token,expiresAt};
}
async function boundedMultipart(request:Request){
 const contentType=request.headers.get('content-type')??'';
 insist(/^multipart\/form-data\s*;/i.test(contentType),'Use a multipart form upload',415);
 const length=request.headers.get('content-length');
 if(length!==null)insist(/^\d+$/.test(length)&&Number(length)<=totalLimit,'The upload exceeds 32 MiB',413);
 insist(request.body,'An intake submission is required');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try {
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>totalLimit){await reader.cancel();throw new Fault('The upload exceeds 32 MiB',413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return await new Response(bytes,{headers:{'content-type':contentType}}).formData();}catch{throw new Fault('Use a valid multipart form upload');}
}
function answerValues(questions:IntakeQuestion[],input:unknown){
 insist(input&&typeof input==='object'&&!Array.isArray(input),'Provide answers as text fields');
 const answers=input as Record<string,unknown>,known=new Set(questions.map(q=>q.key)),active=new Set<string>(),out:{key:string;label:string;value:string}[]=[];
 insist(Object.keys(answers).every(k=>known.has(k)),'An answer does not belong to this form');
 for(const q of questions){
  const shown=!q.when||(active.has(q.when.key)&&answers[q.when.key]===q.when.equals),present=Object.hasOwn(answers,q.key);
  if(!shown){insist(!present,'Do not submit answers to hidden questions');continue;}
  active.add(q.key);
  if(present)insist(typeof answers[q.key]==='string'&&(answers[q.key] as string).length<=4000,'Answers must be plain strings up to 4,000 characters');
  const value=present?(answers[q.key] as string).trim():'';
  insist(!q.required||value.length>0,`${q.label} is required`);
  if(value){
   if(q.type==='select')insist(q.options!.includes(value),`Choose an available answer for ${q.label}`);
   if(q.type==='yesno')insist(['yes','no'].includes(value),`Choose yes or no for ${q.label}`);
   if(q.type==='date')date(value);
   out.push({key:q.key,label:q.label,value});
  }
 }
 return out;
}
async function ipDigest(env:Bindings,formId:string,hour:string,request:Request){
 const ip=request.headers.get('CF-Connecting-IP');insist(ip&&ip.length<=100,'Client network information is unavailable',400);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`satchel-intake\n${formId}\n${hour}\n${ip}`))),n=>n.toString(16).padStart(2,'0')).join('');
}
async function tokenState(db:D1Database,hash:string,formId:string){
 return stmt(db,'SELECT t.*,s.receipt,s.submitted_at FROM s_intake_tokens t LEFT JOIN s_intake_submissions s ON s.id=t.submission_id WHERE t.token_hash=? AND t.form_id=?',hash,formId).first<Data>();
}
const received=(token:Data)=>({receipt:token.receipt as string,receivedAt:token.submitted_at as string});
export async function submitIntake(env:Bindings,formId:string,request:Request){
 insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Submit the form from this site',403);
 const multipart=await boundedMultipart(request);
 insist(Array.from(multipart.keys()).every(k=>k==='data'||k==='files')&&multipart.getAll('data').length===1,'Use the intake data and files fields');
 const encoded=multipart.get('data');insist(typeof encoded==='string'&&encoded.length<=160000,'Intake data is required');
 let body:Data;try{body=JSON.parse(encoded);}catch{throw new Fault('Intake data must be valid JSON');}
 insist(body&&typeof body==='object'&&!Array.isArray(body),'Intake data must be an object');
 insist(typeof body.token==='string'&&/^[a-f0-9]{64}$/.test(body.token),'Invalid intake token');
 insist(body.website==='','The submission did not pass spam checks');
 const hash=await digest(body.token),token=await tokenState(env.DB,hash,formId),at=now();
 insist(token,'The intake token is invalid or expired',409);
 insist(token.expires_at>at,'The intake token expired. Reload the form.',409);
 if(token.submission_id&&token.receipt)return received(token);
 const form=await publishedForm(env.DB,formId),snapshot=JSON.parse(form.snapshot);
 insist(body.revision===form.revision&&token.revision===form.revision,'This form changed. Reload before submitting.',409);
 insist(body.consent===true,'Consent to review this inquiry is required');
 const optional=(value:unknown,label:string,max:number)=>{insist(typeof value==='string'&&value.length<=max,`${label} must be plain text`);return value.trim();};
 const profile={name:text(body.name,'Name',200),email:optional(body.email,'Email',254),phone:optional(body.phone,'Phone',40),summary:text(body.summary,'Inquiry summary',2000)};
 if(profile.email)insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email),'Use a valid email address');
 const answers=answerValues(snapshot.questions,body.answers),hour=at.slice(0,13),network=await ipDigest(env,form.id,hour,request),rateExpires=new Date(new Date(hour+':00:00.000Z').getTime()+2*60*60*1000).toISOString();
 const leadId=id(),submissionId=id(),receipt=id(),original={profile,answers,consent:{text:snapshot.consentText,accepted:true,at},form:{id:form.id,revision:form.revision,version:form.version,title:snapshot.title,practice:snapshot.practice}};
 let staged:StagedIntakeFile[]=[];
 try {
  staged=await stageIntakeFiles(env,multipart.getAll('files'));
  await env.DB.batch([
   guard(env.DB,'EXISTS(SELECT 1 FROM s_intake_tokens WHERE token_hash=? AND form_id=? AND revision=? AND expires_at>? AND submission_id IS NULL)',hash,form.id,form.revision,now()),
   guard(env.DB,'EXISTS(SELECT 1 FROM s_intake_forms WHERE id=? AND revision=? AND published=1)',form.id,form.revision),
   guard(env.DB,activeIntakeAssigneeSql,form.assigned_email,form.assigned_email),
   guard(env.DB,'COALESCE((SELECT accepted FROM s_intake_rate_limits WHERE form_id=? AND hour=? AND ip_digest=?),0)<10',form.id,hour,network),
   stmt(env.DB,'INSERT INTO s_intake_rate_limits(form_id,hour,ip_digest,accepted,expires_at) VALUES(?,?,?,1,?) ON CONFLICT(form_id,hour,ip_digest) DO UPDATE SET accepted=accepted+1',form.id,hour,network,rateExpires),
   stmt(env.DB,"INSERT INTO s_leads(id,name,email,phone,summary,referral_source,assigned_email,status,revision,created_by,created_at,last_activity_at) VALUES(?,?,?,?,?,?,?,'open',?,?,?,?)",leadId,profile.name,profile.email,profile.phone,profile.summary,`Intake form ${form.id} version ${form.version}`,form.assigned_email,id(),publicActor.email,at,at),
   stmt(env.DB,'INSERT INTO s_intake_submissions(id,lead_id,form_id,form_version,receipt,submitted_at,original_data) VALUES(?,?,?,?,?,?,?)',submissionId,leadId,form.id,form.version,receipt,at,JSON.stringify(original)),
   ...staged.map(f=>stmt(env.DB,'INSERT INTO s_intake_files(id,submission_id,name,mime,size,sha256,object_key) VALUES(?,?,?,?,?,?,?)',f.id,submissionId,f.name,f.mime,f.size,f.sha256,f.objectKey)),
   ...staged.map(f=>stmt(env.DB,'DELETE FROM s_intake_uploads WHERE object_key=?',f.objectKey)),
   stmt(env.DB,'UPDATE s_intake_tokens SET submission_id=? WHERE token_hash=?',submissionId,hash),
   stmt(env.DB,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),leadId,'intake_received',JSON.stringify({submissionId,formId:form.id,formVersion:form.version,assignedEmail:form.assigned_email}),publicActor.email,at),
   audit(env.DB,publicActor,'intake.received',submissionId,JSON.stringify({leadId,formId:form.id,formVersion:form.version,receipt,original,files:staged.map(({objectKey:_,...file})=>file)}))
  ]);
 }catch(error){
  // A lost response can follow a committed transaction: never delete that winner's originals.
  const winner=await tokenState(env.DB,hash,formId);
  if(winner?.submission_id===submissionId&&winner.receipt)return received(winner);
  await removeStagedIntakeFiles(env,staged);
  if(winner?.submission_id&&winner.receipt)return received(winner);
  const limit=await stmt(env.DB,'SELECT accepted FROM s_intake_rate_limits WHERE form_id=? AND hour=? AND ip_digest=?',form.id,hour,network).first<Data>();
  if(limit?.accepted>=10)throw new Fault('The hourly submission limit was reached. Try again later.',429);
  if(/constraint|s_guard|UNIQUE/i.test(String(error)))throw new Fault('This intake changed, its assignee is unavailable, or its hourly submission limit was reached. Reload before trying again.',409);
  throw error;
 }
 await Promise.all([purgeIntakeSecurity(env.DB,at),recoverIntakeUploads(env,at)]);
 return {receipt,receivedAt:at};
}
export async function leadIntake(db:D1Database,actor:Actor,leadId:string){
 await visibleIntakeLeadPath(db,actor,leadId);
 const submissions=await rows(db,`WITH RECURSIVE family(id) AS (SELECT ? UNION SELECT l.id FROM s_leads l JOIN family p ON l.merged_into=p.id) SELECT s.*,v.snapshot FROM s_intake_submissions s JOIN family f ON f.id=s.lead_id JOIN s_intake_form_versions v ON v.form_id=s.form_id AND v.version=s.form_version ORDER BY s.submitted_at,s.id`,leadId);
 const visible=[];
 for(const submission of submissions){
  try{await visibleIntakeLeadPath(db,actor,submission.lead_id);}catch(error){if(error instanceof Fault&&error.status===404)continue;throw error;}
  const data=JSON.parse(submission.original_data),snapshot=JSON.parse(submission.snapshot),files=await rows(db,'SELECT * FROM s_intake_files WHERE submission_id=? ORDER BY id',submission.id);
  visible.push({id:submission.id,formId:submission.form_id,formVersion:submission.form_version,formTitle:snapshot.title,practice:snapshot.practice,receipt:submission.receipt,submittedAt:submission.submitted_at,consent:data.consent,answers:data.answers,files:files.map(f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,sha256:f.sha256,scanStatus:f.scan_status,downloadUrl:`/api/satchel/intake/files/${encodeURIComponent(f.id)}`}))});
 }
 return {submissions:visible};
}
