// MATTER-002: evidence gates are human decisions against exact reviewed records.
import {atomic,audit,date,Fault,human,id,insist,integer,matter,need,now,stmt,text,type Actor,type Data} from './model';
import {documentGuard,matterGuard,visibleDocument} from './documents';
import {guard} from './trust-guards';
import {matterStageState,missingTypes,readStageProfile,stageDefinitions} from './matter-stage-state';
export {matterBoard,matterStageState,stageDefinitions} from './matter-stage-state';

const lawyerCanSee=`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR (m.active=1 AND m.role='lawyer' AND EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=? AND a.email=o.email))))`;
function counsel(actor:Actor) {human(actor);need(actor,'owner','lawyer');}
function profileGuard(db:D1Database,matterId:string,revision:string|null) {
 return guard(db,'(? IS NULL AND NOT EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=?)) OR EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND revision=?)',revision,matterId,matterId,revision);
}
function profileWrite(db:D1Database,actor:Actor,p:Data,revision:string,at:string) {
 return stmt(db,`INSERT INTO s_matter_stage_profiles(matter_id,stage_id,lawyer_email,risk,milestone,milestone_date,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET stage_id=excluded.stage_id,lawyer_email=excluded.lawyer_email,risk=excluded.risk,milestone=excluded.milestone,milestone_date=excluded.milestone_date,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,p.matterId,p.stageId,p.lawyerEmail,p.risk,p.milestone,p.milestoneDate,revision,actor.email,at);
}
function stageEvent(db:D1Database,actor:Actor,matterId:string,kind:string,detail:Data,at:string) {
 const eventId=id();
 return [stmt(db,'INSERT INTO s_matter_stage_events(id,matter_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',eventId,matterId,kind,JSON.stringify(detail),actor.email,at),audit(db,actor,`matter.stage_${kind}`,eventId,JSON.stringify({matterId,...detail}),{matterId})];
}
export async function saveStageDefinition(db:D1Database,actor:Actor,body:Data) {
 counsel(actor);
 const existing=body.id?await stmt(db,'SELECT * FROM s_matter_stages WHERE id=?',text(body.id,'Stage',100)).first<Data>():null;
 insist(!body.id||existing,'Stage not found',404);
 if(existing)insist(body.revision===existing.revision,'The stage configuration changed. Refresh before saving.',409);
 const name=text(body.name,'Stage name',120);
 insist(Array.isArray(body.requiredTypes)&&body.requiredTypes.length<=30,'Choose at most 30 required document types');
 const requiredTypes=[...new Set((body.requiredTypes as unknown[]).map(v=>text(v,'Required document type',80)))].sort();
 const stageId=existing?.id??id(),revision=id(),at=now(),position=integer(body.position??existing?.position??0,'Stage position',0,1000);
 await atomic(db,actor,[...(existing?[guard(db,'EXISTS(SELECT 1 FROM s_matter_stages WHERE id=? AND revision=?)',stageId,existing.revision)]:[]),
  stmt(db,`INSERT INTO s_matter_stages(id,name,required_types,position,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,required_types=excluded.required_types,position=excluded.position,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,stageId,name,JSON.stringify(requiredTypes),position,revision,actor.email,at),
  audit(db,actor,'matter.stage_configured',stageId,JSON.stringify({previous:existing?{name:existing.name,requiredTypes:JSON.parse(existing.required_types),revision:existing.revision}:null}))]);
 return stageDefinitions(db);
}
export async function saveStageProfile(db:D1Database,actor:Actor,matterId:string,body:Data) {
 counsel(actor);await matter(db,actor,matterId);
 const previous=await readStageProfile(db,matterId);
 insist(body.revision===previous.revision,'The matter stage or profile changed. Refresh before saving.',409);
 const p={...previous};
 if(body.lawyerEmail!==undefined)p.lawyerEmail=body.lawyerEmail===null||body.lawyerEmail===''?null:text(body.lawyerEmail,'Responsible lawyer',254).toLowerCase();
 if(body.risk!==undefined){insist(body.risk===null||['low','medium','high','urgent'].includes(body.risk),'Choose low, medium, high or urgent risk');p.risk=body.risk;}
 if(body.milestone!==undefined)p.milestone=body.milestone===null||body.milestone===''?null:text(body.milestone,'Next milestone',300);
 if(body.milestoneDate!==undefined)p.milestoneDate=body.milestoneDate===null||body.milestoneDate===''?null:date(body.milestoneDate);
 insist(!p.milestoneDate||p.milestone,'A milestone date needs a named next milestone');
 if(p.lawyerEmail)insist(await stmt(db,`SELECT 1 WHERE ${lawyerCanSee}`,p.lawyerEmail,matterId).first(),'Choose an active lawyer who can see this matter');
 const revision=id(),at=now();
 await atomic(db,actor,[...matterGuard(db,actor,matterId),profileGuard(db,matterId,previous.revision),...(p.lawyerEmail?[guard(db,lawyerCanSee,p.lawyerEmail,matterId)]:[]),profileWrite(db,actor,p,revision,at),...stageEvent(db,actor,matterId,'profile',{previous,profile:{...p,revision},revision},at)]);
 return matterStageState(db,actor,matterId);
}
export async function transitionMatterStage(db:D1Database,actor:Actor,matterId:string,body:Data) {
 counsel(actor);await matter(db,actor,matterId);
 const reason=text(body.reason,'Transition reason',2000),stageId=text(body.stageId,'Target stage',100);
 const stage=await stmt(db,'SELECT * FROM s_matter_stages WHERE id=?',stageId).first<Data>();
 insist(stage,'Stage not found',404);
 const previous=await readStageProfile(db,matterId),documents:Data[]=[],detail:Data={fromStageId:previous.stageId,stageId,stageName:stage.name,stageRevision:stage.revision,requiredTypes:JSON.parse(stage.required_types),reason,previous,documents};
 try {
  insist(body.revision===previous.revision,'The matter stage or profile changed. Refresh before moving.',409);
  insist(body.stageRevision===stage.revision,'The target stage requirements changed. Refresh before moving.',409);
  insist(previous.stageId!==stageId,'The matter is already at this stage',409);
  insist(Array.isArray(body.documents)&&body.documents.length<=100,'Supply up to 100 explicit evidence references');
  const writes=[...matterGuard(db,actor,matterId),profileGuard(db,matterId,previous.revision),guard(db,'EXISTS(SELECT 1 FROM s_matter_stages WHERE id=? AND revision=?)',stageId,stage.revision)];
  const selected=new Set<string>();
  for(const ref of body.documents) {
   insist(ref&&typeof ref==='object'&&!Array.isArray(ref),'Supply valid evidence references');
   const document=await visibleDocument(db,actor,text(ref.id,'Evidence document',100));
   insist(document.matter_id===matterId,'Document not found',404);
   insist(!selected.has(document.id),'Select each evidence document only once');selected.add(document.id);
   insist(!document.erased_at,'Use a retained original as evidence',409);
   insist(ref.revision===document.revision&&ref.currentVersion===document.current_version,'An evidence document changed. Review its current version.',409);
   const version=await stmt(db,'SELECT version,name,sha256,size FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',document.id,document.current_version).first<Data>();
   insist(version,'The evidence original is no longer available',409);
   documents.push({id:document.id,title:document.title,documentType:document.document_type,revision:document.revision,currentVersion:version.version,sha256:version.sha256,size:version.size,name:version.name});
   writes.push(...documentGuard(db,actor,document),guard(db,`EXISTS(SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id AND v.version=d.current_version WHERE d.id=? AND d.matter_id=? AND d.current_version=? AND d.document_type=? AND v.sha256=? AND v.content_base64 IS NOT NULL)`,document.id,matterId,version.version,document.document_type,version.sha256));
  }
  detail.missingTypes=missingTypes(detail.requiredTypes,documents);
  insist(!detail.missingTypes.length,`Missing required evidence: ${detail.missingTypes.join(', ')}. Select matching retained originals.`,409);
  // Open work remains visible and is retained as exceptions in this decision;
  // moving a stage cannot complete a task or alter a confirmed legal date.
  const state=await matterStageState(db,actor,matterId);
  detail.exceptions={openTasks:state.openTasks,blockedTasks:state.blockedTasks,openDeadlines:state.openDeadlines,milestoneOverdue:state.milestoneOverdue,today:state.today,timezone:state.timezone};
  const revision=id(),at=now();detail.revision=revision;detail.profile={...previous,stageId,revision};
  writes.push(profileWrite(db,actor,{...previous,stageId},revision,at),...stageEvent(db,actor,matterId,'transition',detail,at));
  await atomic(db,actor,writes);
 } catch(error) {
  if(error instanceof Fault&&error.status===409) {
   // A refusal is activity too. A separate transaction rechecks current matter
   // access and staff authority without replaying a stale decision's guards.
   await atomic(db,actor,[...matterGuard(db,actor,matterId),...stageEvent(db,actor,matterId,'blocked',{...detail,error:error.message},now())]);
  }
  throw error;
 }
 return matterStageState(db,actor,matterId);
}
