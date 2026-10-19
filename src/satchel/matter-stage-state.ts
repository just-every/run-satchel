// Read models share the existing matter/document boundaries. Historical evidence
// is retained in storage; each response reapplies today's document permissions.
import {insist,matter,rows,stmt,type Actor,type Data} from './model';
import {listDocuments} from './documents';
import {visibility} from './deadlines';
import {firmToday} from './retention';

export async function stageDefinitions(db:D1Database) {
 return {stages:(await rows(db,'SELECT * FROM s_matter_stages ORDER BY position,name,id')).map(s=>({id:s.id,name:s.name,requiredTypes:JSON.parse(s.required_types) as string[],position:s.position,revision:s.revision,updatedBy:s.updated_by,updatedAt:s.updated_at}))};
}
export function stageProfile(matterId:string,p:Data|null) {
 return {matterId,revision:p?.revision??null,stageId:p?.stage_id??null,lawyerEmail:p?.lawyer_email??null,risk:p?.risk??null,milestone:p?.milestone??null,milestoneDate:p?.milestone_date??null};
}
export async function readStageProfile(db:D1Database,matterId:string) {
 return stageProfile(matterId,await stmt(db,'SELECT * FROM s_matter_stage_profiles WHERE matter_id=?',matterId).first<Data>());
}
async function stageClock(db:D1Database) {
 const firm=await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<{timezone:string}>();
 return {timezone:firm?.timezone??'UTC',today:await firmToday(db)};
}
export function missingTypes(requiredTypes:string[],documents:Data[]) {
 return requiredTypes.filter(type=>!documents.some(d=>d.documentType===type));
}
async function stageWork(db:D1Database,actor:Actor,matterId:string,today:string|null) {
 const access=visibility(actor);
 const [tasks,dependencies,deadlines]=await Promise.all([
  rows(db,`SELECT t.id,t.title,t.owner_email,t.parent_id,t.status,COALESCE(d.date,t.due_date) due_date FROM s_tasks t LEFT JOIN s_deadlines d ON d.id=t.deadline_id WHERE t.matter_id=? AND (t.deadline_id IS NULL OR EXISTS(SELECT 1 FROM s_deadlines t WHERE t.id=d.id AND ${access.sql})) ORDER BY COALESCE(d.date,t.due_date),t.id`,matterId,...access.params),
  rows(db,'SELECT x.* FROM s_task_dependencies x JOIN s_tasks t ON t.id=x.task_id WHERE t.matter_id=?',matterId),
  rows(db,`SELECT t.id,t.title,t.date,t.status FROM s_deadlines t WHERE t.matter_id=? AND ${access.sql} ORDER BY t.date,t.id`,matterId,...access.params)
 ]);
 const open=tasks.filter(t=>t.status==='open').map(t=>({id:t.id,title:t.title,dueDate:t.due_date,owner:t.owner_email,overdue:Boolean(today&&t.due_date&&t.due_date<today),blockers:tasks.filter(p=>p.status==='open'&&(p.parent_id===t.id||dependencies.some(d=>d.task_id===t.id&&d.prerequisite_id===p.id))).map(p=>({id:p.id,title:p.title}))}));
 const openDeadlines=deadlines.filter(d=>['proposed','confirmed','superseded'].includes(d.status)).map(d=>({id:d.id,title:d.title,date:d.date,status:d.status,overdue:Boolean(today&&d.date<today)}));
 return {work:{openTasks:open,blockedTasks:open.filter(t=>t.blockers.length>0),overdueTasks:open.filter(t=>t.overdue),openDeadlines,overdueDeadlines:openDeadlines.filter(d=>d.overdue)},visibleTaskIds:new Set(tasks.map(t=>t.id)),visibleDeadlineIds:new Set(deadlines.map(d=>d.id))};
}
export async function matterStageState(db:D1Database,actor:Actor,matterId:string,includeHistory=true) {
 await matter(db,actor,matterId);
 const [profile,{stages},allDocuments,history,clock]=await Promise.all([
  readStageProfile(db,matterId),stageDefinitions(db),listDocuments(db,actor,matterId),
  includeHistory?rows(db,'SELECT * FROM s_matter_stage_events WHERE matter_id=? ORDER BY at,id',matterId):Promise.resolve([] as Data[]),stageClock(db)
 ]);
 // Only retained current originals count as evidence. listDocuments omits bytes;
 // this query also excludes a version whose bytes were erased independently.
 const retained=await rows(db,'SELECT v.document_id FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id AND d.current_version=v.version WHERE d.matter_id=? AND d.erased_at IS NULL AND v.content_base64 IS NOT NULL',matterId);
 const documents=allDocuments.filter(d=>!d.erasedAt&&retained.some(v=>v.document_id===d.id));
 const {work,visibleTaskIds,visibleDeadlineIds}=await stageWork(db,actor,matterId,clock.today);
 const visibleHistory=history.map(e=>{
  const detail=JSON.parse(e.detail);
  if(detail.documents)detail.documents=detail.documents.filter((d:Data)=>allDocuments.some(v=>v.id===d.id));
  if(detail.exceptions?.openDeadlines)detail.exceptions.openDeadlines=detail.exceptions.openDeadlines.filter((d:Data)=>visibleDeadlineIds.has(d.id));
  for(const key of ['blockedTasks','openTasks'])if(detail.exceptions?.[key])detail.exceptions[key]=detail.exceptions[key].filter((t:Data)=>visibleTaskIds.has(t.id)).map((t:Data)=>({...t,blockers:t.blockers.filter((b:Data)=>visibleTaskIds.has(b.id))}));
  return {id:e.id,kind:e.kind,actor:e.actor,at:e.at,detail};
 });
 const requirements=stages.map(s=>({stageId:s.id,requiredTypes:s.requiredTypes,missingTypes:missingTypes(s.requiredTypes,documents)}));
 return {profile,stages,documents,history:visibleHistory,requirements,missingTypes:requirements.find(s=>s.stageId===profile.stageId)?.missingTypes??[],...work,milestoneOverdue:Boolean(clock.today&&profile.milestoneDate&&profile.milestoneDate<clock.today),...clock};
}
export async function matterBoard(db:D1Database,actor:Actor,filters:Data={}) {
 const allowed=['lawyer','practice','stage','risk','milestone'];
 for(const k of allowed)insist(filters[k]===undefined||typeof filters[k]==='string'&&filters[k].length<=300,'Use valid board filters');
 const [matters,{stages},clock]=await Promise.all([
  rows(db,"SELECT m.*,p.lawyer_email,p.stage_id,p.risk,p.milestone FROM s_matters m LEFT JOIN s_matter_stage_profiles p ON p.matter_id=m.id WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?) ORDER BY m.opened_at DESC,m.id",actor.role,actor.email),stageDefinitions(db),stageClock(db)
 ]);
 const eq=(filter:string|undefined,value:unknown)=>!filter||(filter==='unassigned'?!value:filter===value);
 const selected=matters.filter(m=>eq(filters.lawyer,m.lawyer_email)&&eq(filters.practice,m.practice_code)&&eq(filters.stage,m.stage_id)&&eq(filters.risk,m.risk)&&(!filters.milestone||String(m.milestone??'').toLocaleLowerCase().includes(filters.milestone.toLocaleLowerCase())));
 const summaries=await Promise.all(selected.map(async m=>{
  const s=await matterStageState(db,actor,m.id,false);
  return {id:m.id,title:m.title,matterNumber:m.matter_number,practiceCode:m.practice_code,client:m.client,profile:s.profile,stageName:stages.find(stage=>stage.id===s.profile.stageId)?.name??null,missingTypes:s.missingTypes,openTasks:s.openTasks,blockedTasks:s.blockedTasks,overdueTasks:s.overdueTasks,openDeadlines:s.openDeadlines,overdueDeadlines:s.overdueDeadlines,milestoneOverdue:s.milestoneOverdue};
 }));
 return {matters:summaries,stages,...clock};
}
