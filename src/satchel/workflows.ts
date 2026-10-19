// MATTER-004: versioned practice workflow templates and reviewed rollout to open matters.
// A new version never changes generated history; open matters receive its new steps
// only when counsel chooses them.
import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {applyWrites,liveRuns,runEvent} from './workflow-runs';

export type Step={key:string;kind:'task'|'appointment'|'document_request'|'draft_document';title:string;offsetDays:number;priority?:string;time?:string;durationMinutes?:number;body?:string};
const kinds=['task','appointment','document_request','draft_document'];
export function counsel(actor:Actor) {human(actor);need(actor,'owner','lawyer');}
export function steps(value:unknown):Step[] {
 insist(Array.isArray(value)&&value.length>=1&&value.length<=50,'A workflow has 1 to 50 steps');
 const list=value.map((s:Data)=>{
  insist(s&&typeof s==='object'&&kinds.includes(s.kind),'Choose a task, appointment, document request or draft document step');
  const key=text(s.key,'Step key',40);insist(/^[a-z0-9-]+$/.test(key),'Step keys use lowercase letters, digits and hyphens');
  const step:Step={key,kind:s.kind,title:text(s.title,'Step title',200),offsetDays:integer(s.offsetDays??0,'Days after approval',0,365)};
  if(s.kind==='task'){step.priority=s.priority??'normal';insist(['low','normal','high','urgent'].includes(step.priority!),'Choose low, normal, high or urgent');}
  if(s.kind==='appointment'){step.time=text(s.time,'Start time',5);insist(/^([01]\d|2[0-3]):[0-5]\d$/.test(step.time),'Use a 24-hour HH:MM start time');step.durationMinutes=integer(s.durationMinutes,'Duration in minutes',5,1440);}
  if(s.kind==='draft_document')step.body=text(s.body,'Draft text',20000);
  return step;
 });
 insist(new Set(list.map(s=>s.key)).size===list.length,'Use a distinct key for each step');
 return list;
}
export async function workflowVersion(db:D1Database,workflowId:string,version:number) {
 const v=await stmt(db,'SELECT * FROM s_workflow_versions WHERE workflow_id=? AND version=?',workflowId,version).first<Data>();
 insist(v,'Workflow version not found',404);return JSON.parse(v.steps) as Step[];
}
// Every signed-in staff member may read the firm's templates; only counsel changes them.
export async function listWorkflows(db:D1Database,actor:Actor) {
 human(actor);
 const [workflows,versions]=await Promise.all([rows(db,'SELECT * FROM s_workflows ORDER BY lower(name),id'),rows(db,'SELECT * FROM s_workflow_versions ORDER BY workflow_id,version')]);
 return {workflows:workflows.map(w=>({id:w.id,name:w.name,trigger:w.trigger,triggerStageId:w.trigger_stage_id,currentVersion:w.current_version,
  versions:versions.filter(v=>v.workflow_id===w.id).map(v=>({version:v.version,steps:JSON.parse(v.steps),note:v.note,createdBy:v.created_by,createdAt:v.created_at}))}))};
}
export async function createWorkflow(db:D1Database,actor:Actor,body:Data) {
 counsel(actor);
 insist(['manual','opening','stage'].includes(body.trigger),'Start the workflow manually, on matter opening or on an approved stage transition');
 const stageId=body.trigger==='stage'?text(body.triggerStageId,'Trigger stage',100):null;
 if(stageId)insist(await stmt(db,'SELECT 1 FROM s_matter_stages WHERE id=?',stageId).first(),'Stage not found',404);
 const workflowId=id(),at=now(),list=steps(body.steps),note=text(body.note,'Version note',500);
 await atomic(db,actor,[
  stmt(db,'INSERT INTO s_workflows(id,name,trigger,trigger_stage_id,current_version,created_by,created_at) VALUES(?,?,?,?,1,?,?)',workflowId,text(body.name,'Workflow name',120),body.trigger,stageId,actor.email,at),
  stmt(db,'INSERT INTO s_workflow_versions(workflow_id,version,steps,note,created_by,created_at) VALUES(?,1,?,?,?,?)',workflowId,JSON.stringify(list),note,actor.email,at),
  audit(db,actor,'workflow.created',workflowId,JSON.stringify({version:1,note}))]);
 return listWorkflows(db,actor);
}
export async function editWorkflow(db:D1Database,actor:Actor,workflowId:string,body:Data) {
 counsel(actor);
 const w=await stmt(db,'SELECT * FROM s_workflows WHERE id=?',workflowId).first<Data>();insist(w,'Workflow not found',404);
 insist(body.version===w.current_version,'The workflow changed. Review its current version before editing.',409);
 const version=w.current_version+1,list=steps(body.steps),note=text(body.note,'Version note',500),at=now();
 await atomic(db,actor,[guard(db,'EXISTS(SELECT 1 FROM s_workflows WHERE id=? AND current_version=?)',workflowId,w.current_version),
  stmt(db,'INSERT INTO s_workflow_versions(workflow_id,version,steps,note,created_by,created_at) VALUES(?,?,?,?,?,?)',workflowId,version,JSON.stringify(list),note,actor.email,at),
  stmt(db,'UPDATE s_workflows SET current_version=? WHERE id=?',version,workflowId),
  audit(db,actor,'workflow.versioned',workflowId,JSON.stringify({version,note}))]);
 return listWorkflows(db,actor);
}
// Rollout preview: each open matter the person sees with a live run on an older version,
// and the steps the current version adds (by key). Edited existing steps stay as generated.
export async function rolloutPreview(db:D1Database,actor:Actor,workflowId:string) {
 counsel(actor);
 const w=await stmt(db,'SELECT * FROM s_workflows WHERE id=?',workflowId).first<Data>();insist(w,'Workflow not found',404);
 const current=await workflowVersion(db,workflowId,w.current_version),runs=await liveRuns(db,actor,workflowId);
 const matters=await Promise.all(runs.filter(r=>r.version<w.current_version).map(async r=>{const old=await workflowVersion(db,workflowId,r.version);return {runId:r.id,revision:r.revision,matterId:r.matter_id,matterNumber:r.matter_number,title:r.title,fromVersion:r.version,newSteps:current.filter(s=>!old.some(o=>o.key===s.key)).map(s=>({key:s.key,kind:s.kind,title:s.title}))};}));
 return {workflowId,version:w.current_version,matters};
}
export async function rollout(db:D1Database,actor:Actor,workflowId:string,body:Data) {
 const preview=await rolloutPreview(db,actor,workflowId);
 insist(body.version===preview.version,'The workflow changed. Preview its current version again.',409);
 insist(Array.isArray(body.matterIds)&&body.matterIds.length<=200,'Choose up to 200 matters');
 const chosen=preview.matters.filter(m=>body.matterIds.includes(m.matterId));
 insist(chosen.length===body.matterIds.length,'Choose only previewed open matters',409);
 const steps=await workflowVersion(db,workflowId,preview.version),at=now(),writes:D1PreparedStatement[]=[];
 for(const m of chosen) {
  const run=await stmt(db,'SELECT * FROM s_workflow_runs WHERE id=?',m.runId).first<Data>(),added=m.newSteps.map(s=>s.key);
  const approved=run!.status==='active'?[...new Set([...JSON.parse(run!.approved_steps),...added])]:JSON.parse(run!.approved_steps),revision=id();
  writes.push(guard(db,'EXISTS(SELECT 1 FROM s_workflow_runs WHERE id=? AND revision=?)',run!.id,run!.revision),
   stmt(db,'UPDATE s_workflow_runs SET version=?,approved_steps=?,revision=?,updated_by=?,updated_at=? WHERE id=?',preview.version,JSON.stringify(approved),revision,actor.email,at,run!.id),
   ...runEvent(db,actor,run!.id,run!.matter_id,'rolled_out',{fromVersion:m.fromVersion,version:preview.version,added},at),
   ...(run!.status==='active'?await applyWrites(db,actor,{...run!,version:preview.version},steps,added,at):[]));
 }
 await atomic(db,actor,writes);
 return rolloutPreview(db,actor,workflowId);
}
