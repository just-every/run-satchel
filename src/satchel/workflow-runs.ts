import {matterScope} from './matter-scope';
// MATTER-004: reviewed workflow runs on one matter. Counsel previews a version, approves
// selected steps, stops or restarts the run; each approved step creates its record once.
import {atomic,audit,date,digest,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {matterGuard,visibleDocument} from './documents';
import {firmToday} from './retention';
import {counsel,workflowVersion,type Step} from './workflows';

const addDays=(day:string,n:number)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const openMatterGuard=(db:D1Database,matterId:string)=>guard(db,"EXISTS(SELECT 1 FROM s_matters WHERE id=? AND lifecycle_status='open')",matterId);
export function runEvent(db:D1Database,actor:Actor,runId:string,matterId:string,kind:string,detail:Data,at:string) {
 const eventId=id();
 return [stmt(db,'INSERT INTO s_workflow_run_events(id,run_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',eventId,runId,kind,JSON.stringify(detail),actor.email,at),audit(db,actor,`workflow.run_${kind}`,runId,JSON.stringify({matterId,...detail}),{matterId})];
}
export async function liveRuns(db:D1Database,actor:Actor,workflowId:string) {
 return rows(db,`SELECT r.*,m.matter_number,m.title FROM s_workflow_runs r JOIN s_matters m ON m.id=r.matter_id WHERE r.workflow_id=? AND r.status IN ('proposed','active') AND m.lifecycle_status='open' AND (${matterScope('m.id', actor.channel === 'agent' ? "'agent'" : "'person'")}) ORDER BY m.matter_number,m.id`,workflowId,actor.role,actor.email);
}
// Dates count from the firm's local date when the step is generated. Generated
// appointments use the firm timezone and invite nobody; drafts are matter-visible text.
export async function applyWrites(db:D1Database,actor:Actor,run:Data,steps:Step[],keys:string[],at:string) {
 const m=await stmt(db,'SELECT * FROM s_matters WHERE id=?',run.matter_id).first<Data>(),today=await firmToday(db);
 const zone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const done=new Set((await rows(db,'SELECT step_key FROM s_workflow_run_items WHERE run_id=?',run.id)).map(i=>i.step_key));
 const writes:D1PreparedStatement[]=[openMatterGuard(db,run.matter_id)];
 for(const step of steps.filter(s=>keys.includes(s.key)&&!done.has(s.key))) {
  const itemId=id(),due=addDays(today,step.offsetDays);
  if(step.kind==='task')writes.push(stmt(db,"INSERT INTO s_tasks(id,matter_id,parent_id,title,priority,due_date,deadline_id,owner_email,recurrence,series_id,status,revision,created_by,created_at) VALUES(?,?,NULL,?,?,?,NULL,NULL,'none',?,'open',?,?,?)",itemId,run.matter_id,step.title,step.priority,due,itemId,id(),actor.email,at),
   stmt(db,"INSERT INTO s_task_events(id,task_id,kind,detail,actor,at) VALUES(?,?,'created',?,?,?)",id(),itemId,JSON.stringify({owner:null,priority:step.priority,due,workflowRunId:run.id,step:step.key}),actor.email,at));
  if(step.kind==='appointment')writes.push(stmt(db,"INSERT INTO s_appointments(id,matter_id,title,location,video_url,timezone,start_date,start_time,duration_minutes,frequency,repeat_interval,occurrences,created_by,created_at) VALUES(?,?,?,'','',?,?,?,?,'once',1,1,?,?)",itemId,run.matter_id,step.title,zone,due,step.time,step.durationMinutes,actor.email,at));
  if(step.kind==='document_request')writes.push(stmt(db,"INSERT INTO s_document_requests(id,matter_id,title,due_date,status,created_by,created_at) VALUES(?,?,?,?,'open',?,?)",itemId,run.matter_id,step.title,due,actor.email,at));
  if(step.kind==='draft_document') {
   const body=step.body!.replaceAll('{{matter}}',m!.title).replaceAll('{{client}}',m!.client).replaceAll('{{number}}',m!.matter_number??''),bytes=new TextEncoder().encode(body),name=`${step.title}.txt`.replace(/[\x00-\x1f\x7f/\\]/g,'-');
   writes.push(stmt(db,"INSERT INTO s_documents(id,matter_id,title,visibility,created_by,created_at,current_version,revision,updated_by,updated_channel,updated_at,document_type) VALUES(?,?,?,'matter',?,?,1,?,?,?,?,'draft')",itemId,run.matter_id,name,actor.email,at,id(),actor.email,actor.channel,at),
    stmt(db,"INSERT INTO s_document_versions(document_id,version,name,mime,declared_mime,size,sha256,content_base64,created_by,created_channel,created_at) VALUES(?,1,?,'text/plain','text/plain',?,?,?,?,?,?)",itemId,name,bytes.length,await digest(bytes),btoa(String.fromCharCode(...bytes)),actor.email,actor.channel,at));
  }
  writes.push(stmt(db,'INSERT INTO s_workflow_run_items(run_id,step_key,version,kind,item_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)',run.id,step.key,run.version,step.kind,itemId,actor.email,at));
 }
 return writes;
}
const runJson=(r:Data,items:Data[],events:Data[],steps:Step[])=>({id:r.id,workflowId:r.workflow_id,workflowName:r.name,version:r.version,status:r.status,source:r.source,approvedSteps:JSON.parse(r.approved_steps),revision:r.revision,createdBy:r.created_by,createdAt:r.created_at,
 steps:steps.map(s=>({...s,approved:JSON.parse(r.approved_steps).includes(s.key),item:items.find(i=>i.run_id===r.id&&i.step_key===s.key)?{kind:items.find(i=>i.run_id===r.id&&i.step_key===s.key)!.kind,id:items.find(i=>i.run_id===r.id&&i.step_key===s.key)!.item_id}:null})),
 generated:items.filter(i=>i.run_id===r.id).map(i=>({key:i.step_key,kind:i.kind,id:i.item_id,version:i.version,createdAt:i.created_at})),
 history:events.filter(e=>e.run_id===r.id).map(e=>({kind:e.kind,detail:JSON.parse(e.detail),actor:e.actor,at:e.at}))});
export async function matterWorkflows(db:D1Database,actor:Actor,matterId:string) {
 await matter(db,actor,matterId);
 const [runs,items,events,requests]=await Promise.all([
  rows(db,'SELECT r.*,w.name FROM s_workflow_runs r JOIN s_workflows w ON w.id=r.workflow_id WHERE r.matter_id=? ORDER BY r.created_at,r.id',matterId),
  rows(db,'SELECT i.* FROM s_workflow_run_items i JOIN s_workflow_runs r ON r.id=i.run_id WHERE r.matter_id=? ORDER BY i.created_at,i.step_key',matterId),
  rows(db,'SELECT e.* FROM s_workflow_run_events e JOIN s_workflow_runs r ON r.id=e.run_id WHERE r.matter_id=? ORDER BY e.at,e.id',matterId),
  rows(db,'SELECT * FROM s_document_requests WHERE matter_id=? ORDER BY created_at,id',matterId)]);
 return {runs:await Promise.all(runs.map(async r=>runJson(r,items,events,await workflowVersion(db,r.workflow_id,r.version)))),
  documentRequests:requests.map(q=>({id:q.id,title:q.title,dueDate:q.due_date,status:q.status,documentId:q.document_id,receivedBy:q.received_by,receivedAt:q.received_at}))};
}
export async function previewWorkflow(db:D1Database,actor:Actor,matterId:string,body:Data) {
 counsel(actor);const m=await matter(db,actor,matterId);
 const w=await stmt(db,'SELECT * FROM s_workflows WHERE id=?',text(body.workflowId,'Workflow',100)).first<Data>();insist(w,'Workflow not found',404);
 const run=await stmt(db,"SELECT * FROM s_workflow_runs WHERE matter_id=? AND workflow_id=? AND status IN ('proposed','active')",matterId,w.id).first<Data>();
 const version=run?.version??w.current_version,steps=await workflowVersion(db,w.id,version),today=await firmToday(db);
 const done=run?(await rows(db,'SELECT step_key FROM s_workflow_run_items WHERE run_id=?',run.id)).map(i=>i.step_key):[];
 return {workflowId:w.id,name:w.name,version,matterId,matterStatus:m.lifecycle_status,run:run?{id:run.id,status:run.status,revision:run.revision}:null,
  steps:steps.map(s=>({key:s.key,kind:s.kind,title:s.title,date:addDays(today,s.offsetDays),...(s.time?{time:s.time}:{}),created:done.includes(s.key)}))};
}
// Approving creates the run (or approves a proposed or active one) and generates every
// approved step not yet generated, in one transaction.
export async function approveWorkflow(db:D1Database,actor:Actor,matterId:string,body:Data) {
 const preview=await previewWorkflow(db,actor,matterId,body);
 insist(preview.matterStatus==='open','Reopen the matter and approve the run before generating its steps',409);
 insist(body.version===preview.version,'The workflow changed. Preview it again.',409);
 insist(Array.isArray(body.steps)&&body.steps.length>=1&&body.steps.every((k:unknown)=>preview.steps.some(s=>s.key===k)),'Approve one or more previewed steps');
 const at=now(),run=preview.run?await stmt(db,'SELECT * FROM s_workflow_runs WHERE id=?',preview.run.id).first<Data>():null;
 if(run)insist(body.revision===run.revision,'The workflow run changed. Preview it again.',409);
 const runId=run?.id??id(),approved=[...new Set([...(run?JSON.parse(run.approved_steps):[]),...body.steps])],revision=id();
 const writes=[...matterGuard(db,actor,matterId),...(run?[guard(db,'EXISTS(SELECT 1 FROM s_workflow_runs WHERE id=? AND revision=?)',run.id,run.revision),stmt(db,"UPDATE s_workflow_runs SET status='active',approved_steps=?,revision=?,updated_by=?,updated_at=? WHERE id=?",JSON.stringify(approved),revision,actor.email,at,run.id)]
  :[stmt(db,"INSERT INTO s_workflow_runs(id,workflow_id,matter_id,version,status,source,approved_steps,revision,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,'active','manual',?,?,?,?,?,?)",runId,preview.workflowId,matterId,preview.version,JSON.stringify(approved),revision,actor.email,at,actor.email,at)]),
  ...runEvent(db,actor,runId,matterId,'approved',{version:preview.version,steps:body.steps},at),
  ...await applyWrites(db,actor,{id:runId,matter_id:matterId,version:preview.version},await workflowVersion(db,preview.workflowId,preview.version),approved,at)];
 await atomic(db,actor,writes);
 return matterWorkflows(db,actor,matterId);
}
async function ownRun(db:D1Database,actor:Actor,runId:string,body:Data) {
 counsel(actor);const r=await stmt(db,'SELECT * FROM s_workflow_runs WHERE id=?',runId).first<Data>();insist(r,'Workflow run not found',404);
 const m=await matter(db,actor,r.matter_id);insist(body.revision===r.revision,'The workflow run changed. Refresh before continuing.',409);return {r,m};
}
// Stopping keeps every generated record and its history; nothing is deleted or cancelled.
export async function stopRun(db:D1Database,actor:Actor,runId:string,body:Data) {
 const {r}=await ownRun(db,actor,runId,body);insist(r.status!=='stopped','This run is already stopped',409);
 const at=now(),reason=text(body.reason,'Stop reason',2000);
 await atomic(db,actor,[...matterGuard(db,actor,r.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_workflow_runs WHERE id=? AND revision=?)',r.id,r.revision),
  stmt(db,"UPDATE s_workflow_runs SET status='stopped',revision=?,updated_by=?,updated_at=? WHERE id=?",id(),actor.email,at,r.id),...runEvent(db,actor,r.id,r.matter_id,'stopped',{reason},at)]);
 return matterWorkflows(db,actor,r.matter_id);
}
// Restarting resumes the stopped run and generates only approved steps not yet generated.
export async function restartRun(db:D1Database,actor:Actor,runId:string,body:Data) {
 const {r,m}=await ownRun(db,actor,runId,body);insist(r.status==='stopped','Only a stopped run can be restarted',409);
 insist(m.lifecycle_status==='open','Reopen the matter and approve the run before generating its steps',409);
 const at=now(),reason=text(body.reason,'Restart reason',2000),approved=JSON.parse(r.approved_steps);
 await atomic(db,actor,[...matterGuard(db,actor,r.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_workflow_runs WHERE id=? AND revision=?)',r.id,r.revision),
  stmt(db,"UPDATE s_workflow_runs SET status='active',revision=?,updated_by=?,updated_at=? WHERE id=?",id(),actor.email,at,r.id),...runEvent(db,actor,r.id,r.matter_id,'restarted',{reason},at),
  ...await applyWrites(db,actor,r,await workflowVersion(db,r.workflow_id,r.version),approved,at)]);
 return matterWorkflows(db,actor,r.matter_id);
}
export async function receiveDocumentRequest(db:D1Database,actor:Actor,requestId:string,body:Data) {
 counsel(actor);const q=await stmt(db,'SELECT * FROM s_document_requests WHERE id=?',requestId).first<Data>();insist(q,'Document request not found',404);
 await matter(db,actor,q.matter_id);insist(q.status==='open','This request is already received',409);
 const d=await visibleDocument(db,actor,text(body.documentId,'Received document',100));insist(d.matter_id===q.matter_id&&!d.erased_at,'Choose a retained document on this matter',409);
 const at=now();
 await atomic(db,actor,[...matterGuard(db,actor,q.matter_id),stmt(db,"UPDATE s_document_requests SET status='received',document_id=?,received_by=?,received_at=? WHERE id=? AND status='open'",d.id,actor.email,at,q.id),
  audit(db,actor,'document_request.received',q.id,JSON.stringify({matterId:q.matter_id,documentId:d.id,date:date(at.slice(0,10))}),{matterId:q.matter_id})]);
 return matterWorkflows(db,actor,q.matter_id);
}
// Triggers propose a run for counsel's review; nothing is generated until approval.
// Stage triggers fire only inside a MATTER-002 transition that passed its evidence checks.
export async function proposeRuns(db:D1Database,actor:Actor,matterId:string,source:'opening'|'stage',sourceId:string|null,at:string) {
 const triggered=source==='opening'?await rows(db,"SELECT * FROM s_workflows WHERE trigger='opening'"):await rows(db,"SELECT * FROM s_workflows WHERE trigger='stage' AND trigger_stage_id=?",sourceId);
 const live=new Set((await rows(db,"SELECT workflow_id FROM s_workflow_runs WHERE matter_id=? AND status IN ('proposed','active')",matterId)).map(r=>r.workflow_id));
 return triggered.filter(w=>!live.has(w.id)).flatMap(w=>{const runId=id();return [stmt(db,"INSERT INTO s_workflow_runs(id,workflow_id,matter_id,version,status,source,source_id,approved_steps,revision,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,'proposed',?,?,'[]',?,?,?,?,?)",runId,w.id,matterId,w.current_version,source,sourceId,id(),actor.email,at,actor.email,at),...runEvent(db,actor,runId,matterId,'proposed',{source,sourceId,version:w.current_version},at)];});
}
// MATTER-007 reopening: a live run resumes only when counsel selects it; every other
// live run is stopped with that reason, keeping all it generated.
export function reopenRunWrites(db:D1Database,actor:Actor,matterId:string,runs:Data[],selected:string[],at:string) {
 return runs.filter(r=>['proposed','active'].includes(r.status)).flatMap(r=>selected.includes(`workflow-run:${r.id}`)?runEvent(db,actor,r.id,matterId,'resumed',{on:'reopen'},at)
  :[stmt(db,"UPDATE s_workflow_runs SET status='stopped',revision=?,updated_by=?,updated_at=? WHERE id=?",id(),actor.email,at,r.id),...runEvent(db,actor,r.id,matterId,'stopped',{reason:'Not resumed on reopening'},at)]);
}
