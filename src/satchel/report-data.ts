import {allWallsAllow} from './wall-doors';
import {matterScope} from './matter-scope';
// REPORT-001: select permitted records before any cohort or aggregate calculation.
import {date,human,insist,need,now,rows,stmt,type Actor,type Data} from './model';
import {documentAccess} from './documents';
import {visibility} from './deadlines';
const same=(filter:string|undefined,value:unknown)=>!filter||(filter==='__none__'?!value:filter===value);
export async function readReportData(db:D1Database,actor:Actor,input:Data={}){
 human(actor);need(actor,'owner','lawyer');
 const filters:Record<string,string>={};for(const key of ['practice','owner','from','to','status']){if(input[key]){insist(typeof input[key]==='string'&&input[key].length<=254,'Use valid report filters');filters[key]=input[key];}}
 if(filters.from)date(filters.from);if(filters.to)date(filters.to);insist(!filters.from||!filters.to||filters.from<=filters.to,'Opened from must be on or before Opened through');
 insist(!filters.status||['open','closed'].includes(filters.status),'Choose open, closed or all case statuses');
 const asOf=now(),timezone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}),localDay=(at:string)=>calendar.format(new Date(at)),today=localDay(asOf);
 const [grantedMatters,allLeads,practices,people,stages,wholeFirmWallAccess]=await Promise.all([
  rows(db,`SELECT m.*,p.stage_id,p.lawyer_email FROM s_matters m LEFT JOIN s_matter_stage_profiles p ON p.matter_id=m.id WHERE ${matterScope('m.id', actor.channel === 'agent' ? "'agent'" : "'person'")} ORDER BY m.matter_number,m.id`,actor.role,actor.email),
  rows(db,"SELECT * FROM s_leads WHERE status<>'merged' ORDER BY created_at,id"),rows(db,'SELECT code,name FROM s_practice_areas ORDER BY name,code'),rows(db,"SELECT email,display_name name FROM oa_operators ORDER BY email"),rows(db,'SELECT id,name,required_types FROM s_matter_stages'),stmt(db,`SELECT 1 FROM (SELECT ? email) scope_viewer WHERE ${allWallsAllow('scope_viewer.email')}`,actor.email).first()
 ]);
 // FIRM-008: a custom role limited to own matters narrows every dataset, count, drill and CSV before any cohort is built.
 const own=actor.grants?.reports==='own',allowed=own?grantedMatters.filter(m=>m.lawyer_email===actor.email):grantedMatters,leads=own?allLeads.filter(l=>l.assigned_email===actor.email):allLeads;
 const permitted=new Set(allowed.map(m=>m.id));
 const permittedPractices=new Set([...allowed.map(m=>m.practice_code),...leads.filter(l=>!l.matter_id||permitted.has(l.matter_id)).map(l=>l.practice_code)].filter(Boolean));
 const inDates=(at:string)=>{const d=localDay(at);return (!filters.from||d>=filters.from)&&(!filters.to||d<=filters.to);};
 const cohort=allowed.filter(m=>same(filters.practice,m.practice_code)&&same(filters.owner,m.lawyer_email)&&same(filters.status,m.lifecycle_status)&&inDates(m.opened_at));
 const ids=JSON.stringify(cohort.map(m=>m.id)),inCohort='IN (SELECT value FROM json_each(?))',d=documentAccess(actor),v=visibility(actor);
 const [transitions,lifecycle,legalOutcomes,documents,tasks,deadlines]=await Promise.all([
  rows(db,`SELECT id,matter_id,kind,detail,at FROM s_matter_stage_events WHERE kind='transition' AND matter_id ${inCohort} ORDER BY at,id`,ids),
  rows(db,`SELECT id,matter_id,kind,revision,at FROM s_matter_lifecycle_events WHERE matter_id ${inCohort} ORDER BY at,id`,ids),
  rows(db,`SELECT matter_id,event_id,outcome,at FROM s_matter_outcomes WHERE matter_id ${inCohort} ORDER BY at,id`,ids),
  rows(db,`SELECT d.matter_id,d.document_type FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id AND v.version=d.current_version WHERE d.matter_id ${inCohort} AND d.erased_at IS NULL AND v.content_base64 IS NOT NULL AND ${d.sql}`,ids,...d.params),
  rows(db,`SELECT t.id,t.matter_id,t.title,t.owner_email,t.due_date,t.deadline_id,d.date deadline_date,d.status deadline_status FROM s_tasks t LEFT JOIN s_deadlines d ON d.id=t.deadline_id WHERE t.status='open' AND t.matter_id ${inCohort} AND (t.deadline_id IS NULL OR EXISTS(SELECT 1 FROM s_deadlines t WHERE t.id=d.id AND ${v.sql})) ORDER BY t.id`,ids,...v.params),
  rows(db,`SELECT t.id,t.matter_id,t.title,t.owner_email,t.date,t.status FROM s_deadlines t WHERE t.matter_id ${inCohort} AND t.status IN ('proposed','confirmed') AND ${v.sql} ORDER BY t.date,t.id`,ids,...v.params)
 ]);
 return {filters,asOf,timezone,today,cohort,allowed,leads,practices:wholeFirmWallAccess&&!own?practices:practices.filter(p=>permittedPractices.has(p.code)),people,stages,transitions,lifecycle,legalOutcomes,documents,tasks,deadlines,permitted,inDates,localDay};
}
