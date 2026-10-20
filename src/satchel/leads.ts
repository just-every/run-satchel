// INTAKE-002: a lead pipeline for prospective clients. The principal and lawyers see and
// maintain every lead; an assistant sees and works only leads assigned to them; trust
// officers see none. History is append-only and a merge keeps the duplicate as provenance.
import {atomic,audit,date,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
export async function leadCalendar(db:D1Database) {
 const timezone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<{timezone:string}>())?.timezone??'UTC';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {today,timezone};
}

const qualifications=['pending','qualified','not_qualified'];
export const counselRole=(actor:Actor)=>['owner','lawyer'].includes(actor.role);
export function staff(actor:Actor) {human(actor);need(actor,'owner','lawyer','assistant');}
function counsel(actor:Actor) {human(actor);need(actor,'owner','lawyer');}
export const visibleLeadSql="(?='owner' OR ?='lawyer' OR l.assigned_email=?)";
const visibleParams=(actor:Actor)=>[actor.role,actor.role,actor.email];
// Duplicates: another open lead with the same email (case-insensitive), the same phone
// digits (at least 7) or the same name (case- and space-insensitive).
const norm={name:(v:string)=>v.toLowerCase().replace(/\s+/g,' ').trim(),email:(v:string)=>v.toLowerCase().trim(),phone:(v:string)=>v.replace(/\D/g,'')};
export function duplicateOf(a:Data,b:Data) {
 if(a.id===b.id||b.status!=='open')return null;
 if(a.email&&norm.email(a.email)===norm.email(b.email))return 'same email';
 if(norm.phone(a.phone).length>=7&&norm.phone(a.phone)===norm.phone(b.phone))return 'same phone';
 if(norm.name(a.name)===norm.name(b.name))return 'same name';
 return null;
}
function event(db:D1Database,actor:Actor,leadId:string,kind:string,detail:Data,at:string) {
 return [stmt(db,'INSERT INTO s_lead_events(id,lead_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',id(),leadId,kind,JSON.stringify(detail),actor.email,at),audit(db,actor,`lead.${kind}`,leadId,JSON.stringify(detail))];
}
async function assignee(db:D1Database,email:unknown) {
 if(email===undefined||email===null||email==='')return null;
 const e=text(email,'Assignee',254).toLowerCase();
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1 AND role IN ('lawyer','assistant') UNION SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner'",e,e).first(),'Assign the lead to an active lawyer, assistant or the principal');
 return e;
}
export async function leadPractice(db:D1Database,value:unknown) {
 if(value===undefined||value===null||value==='')return null;
 const code=text(value,'Practice area code',6).toUpperCase();
 insist(await stmt(db,'SELECT 1 FROM s_practice_areas WHERE code=?',code).first(),'Choose a configured practice area');
 return code;
}
async function stage(db:D1Database,value:unknown) {
 if(value===undefined||value===null||value==='')return null;
 const s=await stmt(db,'SELECT id FROM s_lead_stages WHERE id=?',text(value,'Lead stage',100)).first<Data>();insist(s,'Lead stage not found',404);return s.id as string;
}
export async function leadStages(db:D1Database) {
 return (await rows(db,'SELECT * FROM s_lead_stages ORDER BY position,lower(name),id')).map(s=>({id:s.id,name:s.name,position:s.position,revision:s.revision}));
}
export async function saveLeadStage(db:D1Database,actor:Actor,body:Data) {
 counsel(actor);
 const existing=body.id?await stmt(db,'SELECT * FROM s_lead_stages WHERE id=?',text(body.id,'Lead stage',100)).first<Data>():null;
 insist(!body.id||existing,'Lead stage not found',404);if(existing)insist(body.revision===existing.revision,'The stage changed. Refresh before saving.',409);
 const stageId=existing?.id??id(),name=text(body.name,'Stage name',80),position=integer(body.position??existing?.position??0,'Stage position',0,1000),at=now();
 await atomic(db,actor,[...(existing?[guard(db,'EXISTS(SELECT 1 FROM s_lead_stages WHERE id=? AND revision=?)',stageId,existing.revision)]:[]),
  stmt(db,'INSERT INTO s_lead_stages(id,name,position,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at',stageId,name,position,id(),actor.email,at),
  audit(db,actor,'lead.stage_configured',stageId,JSON.stringify({name,position,previous:existing?{name:existing.name,position:existing.position}:null}))]);
 return leadStages(db);
}
export async function createLead(db:D1Database,actor:Actor,body:Data) {
 staff(actor);
 const at=now(),leadId=id(),assigned=counselRole(actor)?await assignee(db,body.assignedEmail):actor.email;
 const lead={name:text(body.name,'Prospect name',200),email:body.email?text(body.email,'Email',254).toLowerCase():'',phone:body.phone?text(body.phone,'Phone',40):'',summary:text(body.summary,'Inquiry summary',2000),referralSource:text(body.referralSource,'Referral source',200),stageId:await stage(db,body.stageId),practiceCode:await leadPractice(db,body.practiceCode),assigned,nextAction:body.nextAction?text(body.nextAction,'Next action',300):'',nextActionDate:body.nextActionDate?date(body.nextActionDate):null};
 await atomic(db,actor,[stmt(db,"INSERT INTO s_leads(id,name,email,phone,summary,referral_source,stage_id,practice_code,assigned_email,next_action,next_action_date,status,revision,created_by,created_at,last_activity_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)",leadId,lead.name,lead.email,lead.phone,lead.summary,lead.referralSource,lead.stageId,lead.practiceCode,lead.assigned,lead.nextAction,lead.nextActionDate,id(),actor.email,at,at),
  ...event(db,actor,leadId,'created',{referralSource:lead.referralSource,assigned:lead.assigned,stageId:lead.stageId,practiceCode:lead.practiceCode},at)]);
 return leadDetail(db,actor,leadId);
}
async function visibleLead(db:D1Database,actor:Actor,leadId:string) {
 staff(actor);
 const l=await stmt(db,`SELECT * FROM s_leads l WHERE l.id=? AND ${visibleLeadSql}`,leadId,...visibleParams(actor)).first<Data>();insist(l,'Lead not found',404);return l;
}
export function leadJson(l:Data,stages:Data[],today:string,timezone:string) {
 const inactive=new Date(today+'T00:00:00Z');inactive.setUTCDate(inactive.getUTCDate()-14);
 const activityDate=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(l.last_activity_at));
 const stalled=l.status!=='open'?[]:[...(l.next_action_date&&l.next_action_date<today?['Next action overdue']:[]),...(activityDate<=inactive.toISOString().slice(0,10)?['No activity for 14 days']:[])];
 return {id:l.id,name:l.name,email:l.email,phone:l.phone,summary:l.summary,referralSource:l.referral_source,practiceCode:l.practice_code??null,stageId:l.stage_id,stageName:stages.find(s=>s.id===l.stage_id)?.name??null,assignedEmail:l.assigned_email,qualification:l.qualification,consultationOutcome:l.consultation_outcome,nextAction:l.next_action,nextActionDate:l.next_action_date,status:l.status,lostReason:l.lost_reason,matterId:l.matter_id,mergedInto:l.merged_into,revision:l.revision,createdBy:l.created_by,createdAt:l.created_at,lastActivityAt:l.last_activity_at,overdue:Boolean(l.status==='open'&&l.next_action_date&&l.next_action_date<today),stalled};
}
export async function leadDetail(db:D1Database,actor:Actor,leadId:string) {
 const l=await visibleLead(db,actor,leadId),stages=await leadStages(db),{today,timezone}=await leadCalendar(db);
 const [events,merged,others]=await Promise.all([rows(db,'SELECT * FROM s_lead_events WHERE lead_id=? ORDER BY at,id',leadId),rows(db,`SELECT * FROM s_leads l WHERE l.merged_into=? AND ${visibleLeadSql} ORDER BY l.created_at,l.id`,leadId,...visibleParams(actor)),rows(db,`SELECT * FROM s_leads l WHERE l.status='open' AND ${visibleLeadSql}`,...visibleParams(actor))]);
 return {...leadJson(l,stages,today,timezone),history:events.map(e=>({kind:e.kind,detail:JSON.parse(e.detail),actor:e.actor,at:e.at})).filter(e=>counselRole(actor)||e.kind!=='absorbed'||merged.some(m=>m.id===e.detail.from?.id)),
  mergedFrom:merged.map(m=>({id:m.id,name:m.name,email:m.email,phone:m.phone,summary:m.summary,referralSource:m.referral_source,practiceCode:m.practice_code??null,createdBy:m.created_by,createdAt:m.created_at})),
  duplicates:l.status==='open'?others.map(o=>({id:o.id,name:o.name,reason:duplicateOf(l,o)})).filter(o=>o.reason):[]};
}
// One reviewed change at a time against the lead's revision. Assistants work their own
// leads but cannot reassign them; losing a lead needs a reason; conversion links a matter
// opened through the conflict-reviewed door (INTAKE-007 adds full carry-over).
export async function updateLead(db:D1Database,actor:Actor,leadId:string,body:Data) {
 const l=await visibleLead(db,actor,leadId);
 insist(body.revision===l.revision,'The lead changed. Refresh before saving.',409);insist(l.status==='open','Only an open lead can change',409);
 const next={...l},changes:Data={};
 const set=(key:string,value:unknown)=>{if(value!==l[key]){changes[key]={from:l[key],to:value};next[key]=value;}};
 if(body.stageId!==undefined)set('stage_id',await stage(db,body.stageId));
 if(body.practiceCode!==undefined)set('practice_code',await leadPractice(db,body.practiceCode));
 if(body.assignedEmail!==undefined){insist(counselRole(actor),'Only the principal or a lawyer reassigns a lead',403);set('assigned_email',await assignee(db,body.assignedEmail));}
 if(body.qualification!==undefined){insist(qualifications.includes(body.qualification),'Choose pending, qualified or not qualified');set('qualification',body.qualification);}
 if(body.consultationOutcome!==undefined)set('consultation_outcome',body.consultationOutcome===''?'':text(body.consultationOutcome,'Consultation outcome',2000));
 if(body.nextAction!==undefined)set('next_action',body.nextAction===''?'':text(body.nextAction,'Next action',300));
 if(body.nextActionDate!==undefined)set('next_action_date',body.nextActionDate===''||body.nextActionDate===null?null:date(body.nextActionDate));
 if(body.lostReason!==undefined){set('status','lost');set('lost_reason',text(body.lostReason,'Reason the lead was lost',1000));}
 if(body.matterId!==undefined){const m=await matter(db,actor,text(body.matterId,'Matter',100));insist(!(await stmt(db,"SELECT 1 FROM s_leads WHERE matter_id=? AND status='converted'",m.id).first()),'That matter already converted another lead',409);set('status','converted');set('matter_id',m.id);}
 insist(Object.keys(changes).length>0,'Change at least one lead field');
 const at=now(),kind=next.status==='lost'?'lost':next.status==='converted'?'converted':'updated';
 await atomic(db,actor,[guard(db,`EXISTS(SELECT 1 FROM s_leads l WHERE l.id=? AND l.revision=? AND ${visibleLeadSql})`,leadId,l.revision,...visibleParams(actor)),
  stmt(db,'UPDATE s_leads SET stage_id=?,practice_code=?,assigned_email=?,qualification=?,consultation_outcome=?,next_action=?,next_action_date=?,status=?,lost_reason=?,matter_id=?,revision=?,last_activity_at=? WHERE id=?',next.stage_id,next.practice_code,next.assigned_email,next.qualification,next.consultation_outcome,next.next_action,next.next_action_date,next.status,next.lost_reason,next.matter_id,id(),at,leadId),
  ...event(db,actor,leadId,kind,changes,at)]);
 return leadDetail(db,actor,leadId);
}
// Merging keeps the survivor's fields and marks the duplicate merged into it; the
// duplicate row, its referral source and history remain as the survivor's provenance.
export async function mergeLead(db:D1Database,actor:Actor,leadId:string,body:Data) {
 counsel(actor);
 const loser=await visibleLead(db,actor,leadId),survivor=await visibleLead(db,actor,text(body.intoId,'Surviving lead',100));
 insist(body.revision===loser.revision&&body.intoRevision===survivor.revision,'A lead changed. Review both before merging.',409);
 insist(loser.status==='open'&&survivor.status==='open'&&loser.id!==survivor.id,'Merge one open lead into another',409);
 const reason=text(body.reason,'Merge reason',1000),at=now(),snapshot={id:loser.id,name:loser.name,email:loser.email,phone:loser.phone,referralSource:loser.referral_source,practiceCode:loser.practice_code??null,createdBy:loser.created_by,createdAt:loser.created_at};
 await atomic(db,actor,[guard(db,'EXISTS(SELECT 1 FROM s_leads WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM s_leads WHERE id=? AND revision=?)',loser.id,loser.revision,survivor.id,survivor.revision),
  ...event(db,actor,loser.id,'merged',{into:survivor.id,reason},at),
  stmt(db,"UPDATE s_leads SET status='merged',merged_into=?,revision=?,last_activity_at=? WHERE id=?",survivor.id,id(),at,loser.id),
  stmt(db,'UPDATE s_leads SET revision=?,last_activity_at=? WHERE id=?',id(),at,survivor.id),
  ...event(db,actor,survivor.id,'absorbed',{from:snapshot,reason},at)]);
 return leadDetail(db,actor,survivor.id);
}
