import {atomic,audit,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {documentGuard,matterGuard,visibleDocument} from './documents';
import {matterScope} from './matter-scope';
import {visibleDeadline} from './deadlines';
import {guard} from './agent-authority';

// This identifies the preparation semantics, separately from the agreed model.
export const preparationPolicyRevision='native-preparation-1';
const principal=(actor:Actor)=>{human(actor);need(actor,'owner');};
const parse=(value:string|null|undefined)=>value?JSON.parse(value):null;
const sum=(list:Data[],key:string)=>list.reduce((n,r)=>n+(r[key]??0),0);

export async function preparationProvenance(db:D1Database,actor:Actor,originKind:string,originId:string,action:string,inputs:Data){
 const d=actor.agentExecution?.delegation,matterId=d?.matter_id??inputs.matterId;
 if(!matterId)return [];
 const agreement=d?await stmt(db,'SELECT id,processor,model_revision,agreement_reference,retention_terms,training_terms,health_reference,expires_at,approved_by,approved_at FROM s_agent_agreements WHERE id=?',d.agreement_id).first<Data>():null;
 const documents=d?await rows(db,'SELECT s.document_id documentId,s.version,s.sha256,s.kind,s.license_reference licenseReference,s.license_expires_at licenseExpiresAt,s.permitted_use permittedUse,doc.revision documentRevision,v.name,v.mime,v.size FROM s_agent_sources s JOIN s_documents doc ON doc.id=s.document_id LEFT JOIN s_document_versions v ON v.document_id=s.document_id AND v.version=s.version WHERE s.delegation_id=? ORDER BY s.document_id',d.id):[];
 const entries=Array.isArray(inputs.entryIds)?await rows(db,'SELECT e.id,e.matter_id matterId,e.revision,e.kind,e.minutes,e.amount_cents amountCents,e.billable,COALESCE(e.timekeeper_email,e.created_by) timekeeper,(SELECT bill_id FROM s_billing_sources WHERE entry_id=e.id) reservedBy FROM s_entries e WHERE e.matter_id=? AND e.id IN (SELECT value FROM json_each(?)) ORDER BY e.id',matterId,JSON.stringify(inputs.entryIds)):[];
 const snapshot={action,inputs,documents,entries,agreement,policy:{revision:preparationPolicyRevision,delegationId:d?.id??null,approvedAt:d?.approved_at??null,approvedBy:d?.approved_by??null,actions:parse(d?.actions),recipients:parse(d?.recipients),maxJobs:d?.max_jobs??null,spendCents:d?.spend_cents??null,expiresAt:d?.expires_at??null,stopRule:d?.stop_rule??null},preparer:{id:actor.agentKeyId??actor.id,name:(actor as Actor&{label?:string}).label??actor.name,channel:actor.channel},sponsor:{id:actor.id,name:actor.name},jobId:actor.agentExecution?.jobId??null};
 return [stmt(db,'INSERT INTO s_agent_provenance VALUES(?,?,?,?,?)',originKind,originId,matterId,JSON.stringify(snapshot),now())];
}

// A row and its contribution to all totals have exactly the same access test.
// Legacy provenance is not reconstructed from today's agreement or membership.
async function visiblePreparation(db:D1Database,actor:Actor,r:Data){
 try{
  if(r.matterId)await matter(db,actor,r.matterId);
  else if(await stmt(db,`SELECT 1 FROM s_matters m WHERE NOT ${matterScope('m.id')} LIMIT 1`,actor.role,actor.email).first())return false;
  if(r.result?.kind==='matter')await matter(db,actor,r.result.id);
  for(const s of r.provenance?.documents??[])await visibleDocument(db,actor,s.documentId);
  if(r.inputs.documentId)await visibleDocument(db,actor,r.inputs.documentId);
  return true;
 }catch(error){if([403,404].includes((error as {status?:number}).status??0))return false;throw error;}
}
async function preparations(db:D1Database,actor:Actor){
 const list:Data[]=[];
 const proposals=await rows(db,`SELECT p.*,v.snapshot provenance,COALESCE(v.matter_id,d.matter_id,json_extract(p.payload,'$.matterId')) scope_matter FROM s_proposals p LEFT JOIN s_agent_provenance v ON v.origin_kind='proposal' AND v.origin_id=p.id LEFT JOIN s_agent_delegations d ON d.id=p.delegation_id ORDER BY p.created_at,p.id`);
 for(const p of proposals){
  const provenance=parse(p.provenance),r={id:p.id,origin:'proposal',proposalId:p.id,jobId:provenance?.jobId??null,matterId:p.scope_matter,action:'prepare-'+p.kind,status:p.status==='approved'?'accepted':p.status,inputs:parse(p.payload),provenance,createdAt:p.created_at,decision:p.decided_by?{by:p.decided_by,at:p.decided_at}:null,result:p.result_id?{id:p.result_id,kind:p.kind}:null};
  if(await visiblePreparation(db,actor,r))list.push(r);
 }
 // A job that produced a proposal is represented once, by that proposal.
 for(const j of await rows(db,"SELECT j.*,v.snapshot provenance FROM s_agent_jobs j LEFT JOIN s_agent_provenance v ON v.origin_kind='job' AND v.origin_id=j.id WHERE j.proposal_id IS NULL ORDER BY j.created_at,j.id")){
  const r={id:j.id,origin:'job',proposalId:null,jobId:j.id,matterId:j.matter_id,action:j.action,status:j.status==='refused'?'refused':'pending',inputs:parse(j.payload),provenance:parse(j.provenance),createdAt:j.created_at,decision:null,result:null,outcome:j.outcome};
  if(await visiblePreparation(db,actor,r))list.push(r);
 }
 for(const v of await rows(db,"SELECT * FROM s_agent_provenance WHERE origin_kind='refusal' ORDER BY created_at,origin_id")){
  const provenance=parse(v.snapshot),r={id:v.origin_id,origin:'refusal',proposalId:null,jobId:null,matterId:v.matter_id,action:provenance.action,status:'refused',inputs:provenance.inputs,provenance,createdAt:v.created_at,decision:null,result:null,outcome:'preparation_refused'};
  if(await visiblePreparation(db,actor,r))list.push(r);
 }
 return list;
}

async function completedMilestones(db:D1Database,actor:Actor,items:Data[]){
 const result:Data[]=[];
 for(const p of items.filter(p=>p.status==='accepted'&&p.result?.kind==='deadline')){
  const d=await visibleDeadline(db,actor,p.result.id);
  if(d.status==='done')result.push({id:d.id,matterId:d.matter_id,proposalId:p.id,revision:d.revision,title:d.title,completedAt:d.completed_at,completedBy:d.completed_by,evidence:d.completion_evidence});
 }
 return result;
}

async function recoveredWork(db:D1Database,actor:Actor,items:Data[]){
 const result:Data[]=[];
 for(const r of await rows(db,'SELECT * FROM s_agent_recoveries ORDER BY reviewed_at,entry_id')){
  const p=items.find(p=>p.id===r.proposal_id);if(!p||p.status!=='accepted'||p.result?.kind!=='bill')continue;
  const e=await stmt(db,'SELECT e.*,b.id bill_id,b.status bill_status,b.revision bill_revision,b.corrects_bill_id FROM s_entries e JOIN s_billing_sources s ON s.entry_id=e.id JOIN s_bills b ON b.id=s.bill_id WHERE e.id=? AND e.revision=? AND b.id=? AND b.status IN (\'approved\',\'exported\')',r.entry_id,r.entry_revision,p.result.id).first<Data>();
  // Drafts, voids, changed sources and corrected bill chains are not recovered work.
  if(!e||!e.billable||e.corrects_bill_id||await stmt(db,"SELECT 1 FROM s_bills WHERE corrects_bill_id=? AND status<>'void'",e.bill_id).first())continue;
  await matter(db,actor,e.matter_id);
  result.push({entryId:e.id,revision:e.revision,matterId:e.matter_id,proposalId:p.id,billId:e.bill_id,billRevision:e.bill_revision,kind:e.kind,minutes:e.minutes??0,amountCents:e.amount_cents,confirmedBy:e.timekeeper_email??e.created_by,reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,reason:r.reason});
 }
 return result;
}

async function studies(db:D1Database,actor:Actor){
 const result:Data[]=[];
 for(const r of await rows(db,'SELECT * FROM s_agent_metric_studies ORDER BY reviewed_at,id')){
  const snapshot=parse(r.snapshot);let allowed=true;
  for(const unit of [...snapshot.baseline,...snapshot.assisted]){
   try{await matter(db,actor,unit.matterId);await visibleDeadline(db,actor,unit.deadlineId);}catch(error){if(![403,404].includes((error as {status?:number}).status??0))throw error;allowed=false;break;}
  }
  if(allowed)result.push({id:r.id,label:r.label,basis:r.basis,reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,...snapshot});
 }
 return result;
}
export async function agentMetrics(db:D1Database,actor:Actor){
 principal(actor);const items=await preparations(db,actor),counts={pending:0,accepted:0,declined:0,refused:0};
 const reviews=await rows(db,'SELECT r.* FROM s_agent_metric_reviews r WHERE NOT EXISTS(SELECT 1 FROM s_agent_metric_reviews n WHERE n.supersedes_id=r.id) ORDER BY r.reviewed_at,r.id');
 for(const item of items){counts[item.status as keyof typeof counts]++;item.reviews=await rows(db,'SELECT * FROM s_agent_metric_reviews WHERE proposal_id=? ORDER BY reviewed_at,id',item.id);item.sourceReview=reviews.find(r=>r.proposal_id===item.id)??null;item.audit=await rows(db,"SELECT id,action,at,actor,detail FROM s_audit WHERE object_id=? AND action LIKE 'proposal.%' ORDER BY at,id",item.id);}
 const accuracy={accurate:items.filter(p=>p.sourceReview?.verdict==='accurate').length,inaccurate:items.filter(p=>p.sourceReview?.verdict==='inaccurate').length,unreviewed:items.filter(p=>p.origin==='proposal'&&!p.sourceReview).length};
 const milestones=await completedMilestones(db,actor,items),recovered=await recoveredWork(db,actor,items),measurementCandidates:Data[]=[];
 for(const d of await rows(db,`SELECT id FROM s_deadlines WHERE status='done' AND ${matterScope('s_deadlines.matter_id')}`,actor.role,actor.email)){
  try{const current=await visibleDeadline(db,actor,d.id);measurementCandidates.push({id:current.id,revision:current.revision,matterId:current.matter_id,title:current.title,assisted:items.some(p=>p.status==='accepted'&&p.result?.id===d.id),entries:await rows(db,"SELECT id,revision,date,description,minutes FROM s_entries WHERE matter_id=? AND kind='time' ORDER BY date,id",current.matter_id)});}catch(error){if((error as {status?:number}).status!==404)throw error;}
 }
 return {asOf:now(),counts,items,milestones,recovered,measurementCandidates,completedMilestones:milestones.length,recoveredMinutes:sum(recovered,'minutes'),recoveredBillableCents:sum(recovered,'amountCents'),sourceAccuracy:{...accuracy,rate:accuracy.accurate+accuracy.inaccurate?accuracy.accurate/(accuracy.accurate+accuracy.inaccurate):null},studies:await studies(db,actor),rules:{decisions:'Accepted means a review decision. It is not completed legal work, revenue or measured time saved.',recovery:'Principal-confirmed previously unbilled sources in counsel-approved bills; excludes drafts, voids and corrected bills. Billable value is not recovered revenue.',accuracy:'Practitioner source review, with unreviewed recommendations excluded from the accuracy denominator.',comparison:'Observed minutes per completed milestone. The chosen measured baseline and source records are disclosed; selection is not evidence of causation.'}};
}

async function inspectProposal(db:D1Database,actor:Actor,proposalId:string){
 principal(actor);const p=(await preparations(db,actor)).find(p=>p.origin==='proposal'&&p.id===proposalId);insist(p,'Preparation not found',404);return p;
}
export async function reviewAgentSource(db:D1Database,actor:Actor,proposalId:string,b:Data){
 const p=await inspectProposal(db,actor,proposalId);insist(p.provenance,'Legacy provenance is unknown; it cannot establish source accuracy',409);
 insist(['accurate','inaccurate'].includes(b.verdict),'Choose accurate or inaccurate');
 const previous=await stmt(db,'SELECT r.id FROM s_agent_metric_reviews r WHERE r.proposal_id=? AND NOT EXISTS(SELECT 1 FROM s_agent_metric_reviews n WHERE n.supersedes_id=r.id)',p.id).first<Data>();
 insist((b.supersedesId??null)===(previous?.id??null),'Review changed; inspect the current source review',409);
 const reviewId=id(),reason=text(b.reason,'Source review evidence',2000);
 await atomic(db,actor,[...(p.matterId?matterGuard(db,actor,p.matterId):[]),stmt(db,'INSERT INTO s_agent_metric_reviews VALUES(?,?,?,?,?,?,?)',reviewId,p.id,b.verdict,reason,previous?.id??null,actor.email,now()),audit(db,actor,'agent.metric_source_review',p.id,reason,{matterId:p.matterId,reviewId,verdict:b.verdict})]);return {id:reviewId};
}
export async function attributeRecoveredWork(db:D1Database,actor:Actor,proposalId:string,b:Data){
 const p=await inspectProposal(db,actor,proposalId);insist(p.status==='accepted'&&p.result?.kind==='bill'&&p.provenance,'Accept a source-traced bill preparation first',409);
 const source=p.provenance.entries.find((e:Data)=>e.id===b.entryId);insist(source&&source.billable&&!source.reservedBy,'Only confirmed work unbilled at recommendation time qualifies',409);
 insist(source.revision===b.revision,'Review the exact source revision',409);
 const e=await stmt(db,"SELECT e.id FROM s_entries e JOIN s_billing_sources s ON s.entry_id=e.id JOIN s_bills b ON b.id=s.bill_id WHERE e.id=? AND e.revision=? AND b.id=? AND b.status IN ('approved','exported') AND e.billable=1 AND b.corrects_bill_id IS NULL AND NOT EXISTS(SELECT 1 FROM s_bills c WHERE c.corrects_bill_id=b.id AND c.status<>'void')",source.id,source.revision,p.result.id).first();
 insist(e,'Counsel-approved, uncorrected bill required; a draft is not recovered work',409);
 const reason=text(b.reason,'Confirmed recovery attribution',2000),existing=await stmt(db,'SELECT * FROM s_agent_recoveries WHERE entry_id=?',source.id).first<Data>();
 if(existing){insist(existing.proposal_id===p.id&&existing.entry_revision===source.revision&&existing.reason===reason,'Work already has a different recovery attribution',409);return {entryId:source.id};}
 await atomic(db,actor,[...matterGuard(db,actor,p.matterId),...guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND status IN ('approved','exported'))",p.result.id),stmt(db,'INSERT INTO s_agent_recoveries VALUES(?,?,?,?,?,?)',source.id,p.id,source.revision,reason,actor.email,now()),audit(db,actor,'agent.metric_recovery_confirmed',p.id,reason,{matterId:p.matterId,entryId:source.id,sourceRevision:source.revision,billId:p.result.id})]);return {entryId:source.id};
}

async function cohort(db:D1Database,actor:Actor,units:unknown,assisted:boolean,used:Set<string>){
 insist(Array.isArray(units)&&units.length>0&&units.length<=50,'Select between 1 and 50 completed milestones for each cohort');
 const result:Data[]=[],writes:D1PreparedStatement[]=[];
 for(const unit of units){
  insist(unit&&typeof unit==='object','Select a milestone and its measured work');
  const d=await visibleDeadline(db,actor,text(unit.deadlineId,'Completed milestone',100));insist(d.status==='done'&&d.revision===unit.revision,'Review the current completed milestone revision',409);
  insist(!used.has(d.id),'Each milestone and time entry can appear only once in the comparison');used.add(d.id);
  const p=await stmt(db,"SELECT id FROM s_proposals WHERE result_id=? AND kind='deadline' AND status='approved'",d.id).first<Data>();
  insist(assisted?Boolean(p):!p,assisted?'Assisted milestones require an accepted agent preparation':'Baseline milestones must be completed without an agent preparation',409);
  const entries:Data[]=[];
  insist(Array.isArray(unit.entries)&&unit.entries.length>0&&unit.entries.length<=50,'Select the recorded time spent completing this milestone');
  for(const source of unit.entries){
   const e=await stmt(db,"SELECT id,revision,matter_id matterId,date,minutes,COALESCE(timekeeper_email,created_by) confirmedBy FROM s_entries WHERE id=? AND revision=? AND kind='time' AND matter_id=?",text(source.id,'Time entry',100),text(source.revision,'Time revision',100),d.matter_id).first<Data>();insist(e,'Confirmed native time at the exact revision is required',409);
   insist(!used.has(e.id),'Each milestone and time entry can appear only once in the comparison');used.add(e.id);entries.push(e);
  }
  const completedDay=new Intl.DateTimeFormat('en-CA',{timeZone:d.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d.completed_at));
  result.push({deadlineId:d.id,revision:d.revision,matterId:d.matter_id,title:d.title,dueDate:d.date,timezone:d.timezone,completedAt:d.completed_at,completionEvidence:d.completion_evidence,proposalId:p?.id??null,entries,minutes:sum(entries,'minutes'),overdue:completedDay>d.date});
  writes.push(...matterGuard(db,actor,d.matter_id),...guard(db,"EXISTS(SELECT 1 FROM s_deadlines WHERE id=? AND revision=? AND status='done')",d.id,d.revision));
  if(d.document_id)writes.push(...documentGuard(db,actor,await visibleDocument(db,actor,d.document_id)));
 }
 return {units:result,writes};
}
export async function compareAgentCohorts(db:D1Database,actor:Actor,b:Data){
 principal(actor);const requestKey=text(b.requestKey,'Comparison identity',100),label=text(b.label,'Comparison title',200),basis=text(b.basis,'Comparable work and selection rationale',2000),fingerprint=await digest(JSON.stringify({label,basis,baseline:b.baseline,assisted:b.assisted}));
 const existing=await stmt(db,'SELECT id,fingerprint FROM s_agent_metric_studies WHERE request_key=?',requestKey).first<Data>();
 if(existing){insist(existing.fingerprint===fingerprint,'Comparison identity already used for different work',409);insist((await studies(db,actor)).some(s=>s.id===existing.id),'Comparison not found',404);return {id:existing.id};}
 const used=new Set<string>(),baseline=await cohort(db,actor,b.baseline,false,used),assisted=await cohort(db,actor,b.assisted,true,used),baselineMinutes=sum(baseline.units,'minutes'),assistedMinutes=sum(assisted.units,'minutes');
 const snapshot={baseline:baseline.units,assisted:assisted.units,baselineMinutes,assistedMinutes,baselineMinutesPerMilestone:baselineMinutes/baseline.units.length,assistedMinutesPerMilestone:assistedMinutes/assisted.units.length,minutesSaved:baselineMinutes*assisted.units.length/baseline.units.length-assistedMinutes,baselineOverdue:baseline.units.filter(u=>u.overdue).length,assistedOverdue:assisted.units.filter(u=>u.overdue).length,overdueReductionPercentagePoints:100*(baseline.units.filter(u=>u.overdue).length/baseline.units.length-assisted.units.filter(u=>u.overdue).length/assisted.units.length)};
 const studyId=id();await atomic(db,actor,[...baseline.writes,...assisted.writes,stmt(db,'INSERT INTO s_agent_metric_studies VALUES(?,?,?,?,?,?,?,?)',studyId,requestKey,fingerprint,label,basis,JSON.stringify(snapshot),actor.email,now()),audit(db,actor,'agent.metric_cohorts_compared',studyId,'Measured native time and completed milestones; observational comparison',{matterId:baseline.units[0].matterId,studyId})]);return {id:studyId};
}
